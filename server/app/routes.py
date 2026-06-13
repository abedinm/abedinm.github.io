"""API routes: health check + hardened contact submission."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .mailer import send_contact
from .schemas import ContactPayload, ContactResponse
from .security import client_ip
from .turnstile import verify_turnstile

log = logging.getLogger("portfolio.routes")
router = APIRouter()


@router.get("/api/health")
async def health(settings: Settings = Depends(get_settings)) -> dict:
    return {
        "ok": True,
        "service": "portfolio-backend",
        "email_provider": settings.email_provider,
        "turnstile": bool(settings.turnstile_secret),
    }


def _too_many(retry_after: int) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "ok": False,
            "message": "Too many submissions. Please try again later, "
            "or email abedinminhazul12@gmail.com directly.",
        },
        headers={"Retry-After": str(retry_after)},
    )


@router.post("/api/contact", response_model=ContactResponse)
async def contact(
    payload: ContactPayload,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    ip = client_ip(request, settings.forwarded_allow_hops)

    # 1) Global safety cap (cheap DoS / spam-flood guard).
    g_ok, g_retry = request.app.state.global_limiter.hit("__global__")
    if not g_ok:
        log.warning("Global rate limit hit (ip=%s)", ip)
        return _too_many(g_retry)

    # 2) Per-IP rate limit.
    ok, retry = request.app.state.ip_limiter.hit(ip)
    if not ok:
        log.info("Per-IP rate limit hit: %s", ip)
        return _too_many(retry)

    # 3) Honeypot — Pydantic already enforces max_length=0, but double-check
    #    so a future schema change can't silently disable it.
    if payload.botcheck:
        log.info("Honeypot tripped (ip=%s)", ip)
        # Pretend success so bots don't learn they were caught.
        return ContactResponse(ok=True, message="Thanks — your message was sent.")

    # 4) Submit-timing check — reject near-instant bot posts.
    if (
        payload.elapsed_ms is not None
        and payload.elapsed_ms < settings.min_submit_seconds * 1000
    ):
        log.info("Too-fast submit (%sms, ip=%s)", payload.elapsed_ms, ip)
        return ContactResponse(ok=True, message="Thanks — your message was sent.")

    # 5) Message length ceiling (belt-and-suspenders with the schema).
    if len(payload.message) > settings.max_message_chars:
        return JSONResponse(
            status_code=422,
            content={"ok": False, "message": "Message is too long."},
        )

    # 6) Cloudflare Turnstile (no-op unless configured).
    if not await verify_turnstile(settings, payload.turnstile_token, ip):
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "message": "Verification failed. Please retry, "
                "or email abedinminhazul12@gmail.com directly.",
            },
        )

    # 7) Deliver.
    try:
        await send_contact(settings, payload, ip)
    except Exception as exc:
        log.error("Contact delivery failed: %s", exc)
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "message": "Couldn't send right now. Please email "
                "abedinminhazul12@gmail.com directly — I'll get straight back to you.",
            },
        )

    return ContactResponse(
        ok=True,
        message="Thanks — your inquiry landed in my inbox. I reply within 24h.",
    )
