"""Security primitives: response-header hardening, client-IP resolution
behind a proxy, and a dependency-free in-memory sliding-window rate limiter."""
from __future__ import annotations

import threading
import time
from collections import deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from .config import Settings


# --------------------------------------------------------------------------
# Security headers
# --------------------------------------------------------------------------
def _csp() -> str:
    # The site uses inline <script> (theme boot) and inline styles, so
    # 'unsafe-inline' is required for now. script-src is otherwise locked to
    # self + Cloudflare Insights (analytics) + Turnstile (CAPTCHA). This can
    # be tightened to nonces later without touching the rest of the stack.
    return "; ".join(
        [
            "default-src 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
            "form-action 'self' mailto:",
            "object-src 'none'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' 'unsafe-inline' "
            "https://static.cloudflareinsights.com https://challenges.cloudflare.com",
            "connect-src 'self' https://cloudflareinsights.com",
            "frame-src https://challenges.cloudflare.com",
            "manifest-src 'self'",
            "worker-src 'self'",
            "upgrade-insecure-requests",
        ]
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings
        self.csp = _csp()

    async def dispatch(self, request: Request, call_next):
        resp: Response = await call_next(request)
        h = resp.headers
        h.setdefault("Content-Security-Policy", self.csp)
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        h.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=(), usb=(), "
            "interest-cohort=()",
        )
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        h.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        # HSTS only makes sense over TLS; safe to always send (ignored on http
        # by compliant browsers) but we gate on production to avoid surprising
        # local http dev.
        if not self.settings.is_dev:
            h.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        # Don't leak the server stack.
        if "server" in h:
            del h["server"]
        return resp


# --------------------------------------------------------------------------
# Block requests for source/dotfiles in case SITE_DIR ever points at a tree
# that contains them (defense-in-depth; Docker already ships a clean dir).
# --------------------------------------------------------------------------
_BLOCKED_PREFIXES = ("server/", "scripts/", ".git/")
_BLOCKED_SUFFIXES = (".py", ".env", ".pyc")


class PathGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        low = request.url.path.lstrip("/").lower()
        # Always allow ACME / .well-known probes (TLS issuance, etc.).
        if not low.startswith(".well-known/"):
            last = low.rsplit("/", 1)[-1]
            blocked = (
                low.startswith(_BLOCKED_PREFIXES)
                or low.endswith(_BLOCKED_SUFFIXES)
                or last.startswith(".")  # any hidden dotfile
            )
            if blocked:
                return Response("Not found", status_code=404)
        return await call_next(request)


# --------------------------------------------------------------------------
# Client IP (honours a bounded number of proxy hops)
# --------------------------------------------------------------------------
def client_ip(request: Request, hops: int) -> str:
    if hops > 0:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            parts = [p.strip() for p in fwd.split(",") if p.strip()]
            if parts:
                # The right-most `hops` entries are added by our own proxies;
                # take the first untrusted one from the left, bounded by hops.
                idx = max(0, len(parts) - hops)
                return parts[idx]
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------
# In-memory sliding-window rate limiter (per-key + global).
# Single-process / single-worker scope — perfect for a portfolio. For
# multi-worker setups, run with --workers 1 or front it with a shared store.
# --------------------------------------------------------------------------
class RateLimiter:
    def __init__(self, max_events: int, window_seconds: int):
        self.max = max_events
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> tuple[bool, int]:
        """Record a hit. Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            dq = self._hits.setdefault(key, deque())
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self.max:
                retry = int(dq[0] + self.window - now) + 1
                return False, max(retry, 1)
            dq.append(now)
            # Opportunistic cleanup to bound memory.
            if len(self._hits) > 4096:
                for k in [k for k, v in self._hits.items() if not v]:
                    self._hits.pop(k, None)
            return True, 0
