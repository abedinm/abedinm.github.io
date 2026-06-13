"""Environment-driven configuration. Everything is overridable via env vars
(or a .env file in the working directory). Safe, working defaults are chosen
so the app boots even with zero configuration — in that mode the contact form
logs submissions to stdout instead of emailing (EMAIL_PROVIDER=console)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import EmailStr, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root = two levels up from this file (server/app/config.py -> repo root).
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- App / server -----------------------------------------------------
    app_name: str = "Abedin M. — Portfolio"
    environment: Literal["development", "production"] = "production"
    # Directory containing the built static site (index.html, assets/, etc.).
    # In Docker this is /srv/site; in local dev it defaults to the repo root.
    site_dir: Path = _REPO_ROOT
    # Trust X-Forwarded-For from this many proxy hops (Caddy/nginx = 1).
    # Used for correct client IP in rate limiting behind a reverse proxy.
    forwarded_allow_hops: int = 1

    # ---- Recipient / branding --------------------------------------------
    contact_to: EmailStr = "abedinminhazul12@gmail.com"  # where inquiries are delivered
    contact_from: EmailStr = "noreply@abedinm.github.io"  # envelope/from address
    contact_from_name: str = "Abedin M. Portfolio"

    # ---- CORS / origin lock ----------------------------------------------
    # Comma-separated list of allowed origins for the API. The form is
    # same-origin so this is mostly defense-in-depth. "*" disables the lock.
    allowed_origins: str = "https://abedinm.github.io,https://www.abedinm.github.io"

    # ---- Rate limiting (in-memory sliding window) ------------------------
    rate_limit_max: int = 5  # max contact submissions...
    rate_limit_window_seconds: int = 3600  # ...per IP per this window
    global_rate_limit_max: int = 60  # safety cap across all IPs / window

    # ---- Anti-spam --------------------------------------------------------
    # Reject submissions that arrive faster than this after page render
    # (bots submit near-instantly). Honeypot field is always enforced.
    min_submit_seconds: float = 2.0
    max_message_chars: int = 5000

    # ---- Cloudflare Turnstile (optional, privacy-friendly CAPTCHA) -------
    # Leave secret empty to disable. When set, the server verifies the token.
    turnstile_secret: str = ""

    # ---- Email delivery ---------------------------------------------------
    # console  -> log the inquiry to stdout (no config needed; good for dev)
    # smtp     -> send via SMTP (works with Gmail app password, Mailgun, SES…)
    # resend   -> send via Resend HTTP API (set resend_api_key)
    email_provider: Literal["console", "smtp", "resend"] = "console"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    smtp_ssl: bool = False  # use implicit TLS (port 465) instead of STARTTLS

    resend_api_key: str = ""

    @field_validator("site_dir", mode="before")
    @classmethod
    def _expand_site_dir(cls, v):
        return Path(v).expanduser().resolve() if v else _REPO_ROOT

    @property
    def origins_list(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
