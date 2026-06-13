"""Optional Cloudflare Turnstile verification. No-op (returns True) when no
secret is configured, so the site works out of the box; once TURNSTILE_SECRET
is set, every submission must carry a valid token."""
from __future__ import annotations

import logging

import httpx

from .config import Settings

log = logging.getLogger("portfolio.turnstile")

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


async def verify_turnstile(settings: Settings, token: str, ip: str) -> bool:
    if not settings.turnstile_secret:
        return True  # disabled
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                _VERIFY_URL,
                data={
                    "secret": settings.turnstile_secret,
                    "response": token,
                    "remoteip": ip,
                },
            )
        data = r.json()
        ok = bool(data.get("success"))
        if not ok:
            log.warning("Turnstile rejected: %s", data.get("error-codes"))
        return ok
    except Exception as exc:  # network/Cloudflare failure
        log.error("Turnstile verify failed: %s", exc)
        # Fail closed: if a challenge is configured but unverifiable, reject.
        return False
