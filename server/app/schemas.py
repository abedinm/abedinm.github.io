"""Request/response models. Validation here is the server-side source of
truth — the client mirrors it for UX, but never for security."""
from __future__ import annotations

import re

from pydantic import BaseModel, EmailStr, Field, field_validator

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(value: str) -> str:
    """Strip control characters and collapse surrounding whitespace."""
    return _CONTROL_CHARS.sub("", value).strip()


class ContactPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)

    company: str = Field(default="", max_length=200)
    kind: str = Field(default="", max_length=80)
    budget: str = Field(default="", max_length=80)
    timeline: str = Field(default="", max_length=80)

    # Honeypot — must stay empty. Bots fill every field they see. We accept
    # the field at the schema level (capped) and let the route decide, so a
    # tripped honeypot returns a fake 200 instead of a tell-tale 422.
    botcheck: str = Field(default="", max_length=200)
    # Milliseconds (or seconds) the form was on screen before submit.
    # Used to reject instant bot submissions. Optional; tolerated if absent.
    elapsed_ms: int | None = Field(default=None, ge=0)

    # Optional Cloudflare Turnstile token (only required when configured).
    turnstile_token: str = Field(default="", max_length=4096)

    @field_validator("name", "message", "company", "kind", "budget", "timeline")
    @classmethod
    def _sanitize(cls, v: str) -> str:
        return _clean(v)


class ContactResponse(BaseModel):
    ok: bool
    message: str
