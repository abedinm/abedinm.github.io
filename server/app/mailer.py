"""Email delivery with three interchangeable backends selected by
EMAIL_PROVIDER: console (log only), smtp (aiosmtplib), resend (HTTP API).

All paths build the same plain-text + minimal-HTML message and set a
Reply-To of the inquirer so a reply goes straight back to them."""
from __future__ import annotations

import html
import logging
from email.message import EmailMessage

import httpx

from .config import Settings
from .schemas import ContactPayload

log = logging.getLogger("portfolio.mailer")


def _subject(p: ContactPayload) -> str:
    who = p.company or p.name
    kind = p.kind or "Project"
    return f"[Portfolio] {kind} — {who}"


def _plain_body(p: ContactPayload, ip: str) -> str:
    lines = [
        f"Name:      {p.name}",
        f"Email:     {p.email}",
    ]
    if p.company:
        lines.append(f"Company:   {p.company}")
    if p.kind:
        lines.append(f"Kind:      {p.kind}")
    if p.budget:
        lines.append(f"Budget:    {p.budget}")
    if p.timeline:
        lines.append(f"Timeline:  {p.timeline}")
    lines += ["", "— Message —", p.message, "", f"(submitted from {ip})"]
    return "\n".join(lines)


def _html_body(p: ContactPayload, ip: str) -> str:
    def row(label: str, value: str) -> str:
        if not value:
            return ""
        return (
            f"<tr><td style='padding:4px 12px 4px 0;color:#666;"
            f"font:13px/1.5 monospace'>{html.escape(label)}</td>"
            f"<td style='padding:4px 0;font:14px/1.5 system-ui'>"
            f"{html.escape(value)}</td></tr>"
        )

    rows = "".join(
        [
            row("Name", p.name),
            row("Email", p.email),
            row("Company", p.company),
            row("Kind", p.kind),
            row("Budget", p.budget),
            row("Timeline", p.timeline),
        ]
    )
    msg = html.escape(p.message).replace("\n", "<br>")
    return (
        f"<div style='font:14px/1.6 system-ui;color:#111'>"
        f"<table style='border-collapse:collapse;margin-bottom:16px'>{rows}</table>"
        f"<div style='padding:12px 16px;background:#f6f5ef;border-left:3px solid "
        f"#ff6b35;border-radius:4px'>{msg}</div>"
        f"<p style='margin-top:16px;color:#999;font-size:12px'>Submitted from "
        f"{html.escape(ip)}</p></div>"
    )


def _build_message(settings: Settings, p: ContactPayload, ip: str) -> EmailMessage:
    em = EmailMessage()
    em["Subject"] = _subject(p)
    em["From"] = f"{settings.contact_from_name} <{settings.contact_from}>"
    em["To"] = str(settings.contact_to)
    em["Reply-To"] = p.email
    em.set_content(_plain_body(p, ip))
    em.add_alternative(_html_body(p, ip), subtype="html")
    return em


async def send_contact(settings: Settings, p: ContactPayload, ip: str) -> None:
    """Deliver one inquiry. Raises on hard delivery failure so the route can
    surface a retry/fallback message to the user."""
    provider = settings.email_provider

    if provider == "console":
        log.info(
            "CONTACT (console mode — not emailed):\n%s", _plain_body(p, ip)
        )
        return

    if provider == "smtp":
        import aiosmtplib

        if not settings.smtp_host:
            raise RuntimeError("EMAIL_PROVIDER=smtp but SMTP_HOST is empty")
        em = _build_message(settings, p, ip)
        await aiosmtplib.send(
            em,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_ssl,            # implicit TLS (465)
            start_tls=settings.smtp_starttls and not settings.smtp_ssl,
            timeout=20,
        )
        log.info("CONTACT delivered via SMTP to %s", settings.contact_to)
        return

    if provider == "resend":
        if not settings.resend_api_key:
            raise RuntimeError("EMAIL_PROVIDER=resend but RESEND_API_KEY is empty")
        payload = {
            "from": f"{settings.contact_from_name} <{settings.contact_from}>",
            "to": [str(settings.contact_to)],
            "reply_to": str(p.email),
            "subject": _subject(p),
            "text": _plain_body(p, ip),
            "html": _html_body(p, ip),
        }
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json=payload,
            )
        if r.status_code >= 300:
            raise RuntimeError(f"Resend error {r.status_code}: {r.text[:200]}")
        log.info("CONTACT delivered via Resend to %s", settings.contact_to)
        return

    raise RuntimeError(f"Unknown EMAIL_PROVIDER: {provider!r}")
