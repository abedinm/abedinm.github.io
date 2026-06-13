# Deploying abedinm.github.io

This repo is **two things in one**:

1. A static portfolio (vanilla HTML/CSS/JS) — works on any static host, including
   GitHub Pages. The contact form falls back to a pre-filled `mailto:` when no
   backend is present.
2. A small **FastAPI backend** (`server/`) that serves the same site *and* a
   hardened `/api/contact` endpoint (validation, rate limiting, honeypot,
   submit-timing check, optional Cloudflare Turnstile, SMTP/Resend email).

Pick the path that matches what you want. **Option A** (Docker on a VPS) is the
recommended "real backend + your own domain" setup.

---

## What you need

- A **domain** (e.g. from Namecheap, Cloudflare, Porkbun, or a local BD registrar).
- **Hosting** — either a small VPS (DigitalOcean / Hetzner / Contabo / Vultr; the
  $4–6/mo tier is plenty) **or** a free/cheap PaaS (Render).
- An **email path** for the contact form (pick one):
  - **Resend** (easiest): sign up at resend.com, verify your domain, grab an API key.
  - **SMTP**: any provider — a Gmail *App Password*, Mailgun, Amazon SES, Zoho, etc.
  - **console** (default): submissions are logged, not emailed. Fine for testing.

---

## Option A — VPS with Docker + your domain (recommended)

Gives you the full backend and automatic HTTPS in ~10 minutes.

1. **DNS** — point your domain's `A` record (and `www` if you want it) at the
   server's public IP.

2. **Get the code onto the server**
   ```bash
   git clone https://github.com/abedinm/abedinm.github.io.git portfolio
   cd portfolio
   ```

3. **Install Docker** (once, on the server)
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

4. **Configure**
   ```bash
   cp server/.env.example server/.env
   nano server/.env        # set EMAIL_PROVIDER + its block, CONTACT_TO, ALLOWED_ORIGINS
   nano Caddyfile          # replace "abedinm.github.io" with your domain, set your email
   ```

5. **Launch** (builds the image, starts the app + Caddy, fetches HTTPS certs)
   ```bash
   docker compose up -d --build
   ```

6. **Verify**
   ```bash
   curl https://YOURDOMAIN/api/health        # {"ok":true,...}
   ```
   Open `https://YOURDOMAIN` in a browser and submit the contact form.

**Updating later:** `git pull && docker compose up -d --build`.
**Logs:** `docker compose logs -f app`.

---

## Option B — Render (PaaS, no server to manage)

1. Push this repo to GitHub (already done if you're reading this there).
2. On [render.com](https://render.com): **New + → Blueprint →** select the repo.
   Render reads `render.yaml` and provisions a Docker web service.
3. In the service's **Environment** tab, set the values marked `sync:false`:
   `ALLOWED_ORIGINS`, `CONTACT_TO`, `CONTACT_FROM`, `RESEND_API_KEY`
   (or switch `EMAIL_PROVIDER` to `smtp`/`console`).
4. **Custom domain:** Settings → Custom Domains → add yours; point the CNAME/A
   record as Render instructs. HTTPS is automatic.

(Railway / Fly.io work the same way — both build straight from the `Dockerfile`.)

---

## Option C — Run locally (dev / trying it out)

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r server/requirements.txt
uvicorn server.app.main:app --reload --port 8000
```
Open <http://127.0.0.1:8000>. With no `.env`, the form runs in **console mode** —
submissions are printed to the terminal instead of emailed.

---

## Option D — Static only (GitHub Pages, no backend)

Already live at <https://abedinm.github.io/>. The site is fully functional; the
contact form degrades to a pre-filled `mailto:`. Nothing to configure. Use this
as a free always-on mirror even if you also self-host the backend elsewhere — to
point the form at a remote backend, set `CONFIG.contactEndpoint` in `script.js`
to an absolute URL (e.g. `https://api.your-domain.com/api/contact`).

---

## Environment variables (server/.env)

| Variable | Default | What it does |
|---|---|---|
| `ENVIRONMENT` | `production` | `development` disables HSTS for local http. |
| `SITE_DIR` | repo root / `/srv/site` | Folder of static files to serve. Set for you in Docker. |
| `FORWARDED_ALLOW_HOPS` | `1` | Proxy hops to trust for the real client IP. Caddy/nginx = 1. |
| `CONTACT_TO` | `abedinminhazul12@gmail.com` | Where inquiries are delivered. |
| `CONTACT_FROM` / `CONTACT_FROM_NAME` | `noreply@abedinm.github.io` | Envelope from. |
| `ALLOWED_ORIGINS` | abedinm.github.io, www | CORS allowlist (comma-separated; `*` to disable). |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_SECONDS` | `5` / `3600` | Per-IP submission cap. |
| `GLOBAL_RATE_LIMIT_MAX` | `60` | Cap across all IPs per window (flood guard). |
| `MIN_SUBMIT_SECONDS` | `2` | Reject submissions faster than this (bots). |
| `MAX_MESSAGE_CHARS` | `5000` | Message length ceiling. |
| `TURNSTILE_SECRET` | _(empty)_ | Set to enable Cloudflare Turnstile (see below). |
| `EMAIL_PROVIDER` | `console` | `console` \| `smtp` \| `resend`. |
| `SMTP_HOST/PORT/USER/PASSWORD` | _(empty)_ | SMTP credentials when `EMAIL_PROVIDER=smtp`. |
| `SMTP_STARTTLS` / `SMTP_SSL` | `true` / `false` | STARTTLS (587) vs implicit TLS (465). |
| `RESEND_API_KEY` | _(empty)_ | API key when `EMAIL_PROVIDER=resend`. |

### Email examples

**Resend** (recommended):
```ini
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
CONTACT_FROM=noreply@yourdomain   # must be a domain you verified in Resend
```

**Gmail** (App Password, not your login password — requires 2FA enabled):
```ini
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-16-char-app-password
SMTP_STARTTLS=true
```

---

## Optional: Cloudflare Turnstile (privacy-friendly CAPTCHA)

The honeypot + timing checks already stop most bots with zero friction. If you
later get targeted spam, add Turnstile:

1. Cloudflare dashboard → **Turnstile** → create a widget; note the **site key**
   and **secret key**.
2. Put the **secret** in `server/.env`: `TURNSTILE_SECRET=...` and redeploy.
3. In `index.html`, add the Turnstile script in `<head>` and a widget div inside
   the contact form (it writes a hidden `cf-turnstile-response` input, which the
   frontend already reads and the backend already verifies):
   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
   <!-- inside #contact-form, before the submit button: -->
   <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
   ```
   No JS changes needed — wiring is already in place.

---

## Security notes (what's already handled)

- **Input validation** server-side (Pydantic): types, email format, length caps,
  control-character stripping. The client mirrors this for UX only.
- **Rate limiting**: per-IP sliding window + a global flood cap, with `Retry-After`.
- **Honeypot** field + **submit-timing** check reject automated submissions
  silently (bots get a fake success, so they don't adapt).
- **Security headers** on every response: CSP, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, and HSTS in production.
- **No source leakage**: a path guard 404s any request for `*.py`, `.env`,
  dotfiles, or the `server/`, `scripts/`, `.git/` trees; the Docker image ships a
  cleaned static dir that never contained them in the first place.
- **Non-root** container user; **least-privilege** CORS locked to your origins.
- **HTTPS**: automatic via Caddy + Let's Encrypt (Option A) or the platform (B).

> The in-memory rate limiter is per-process — run the app with a single worker
> (the Docker image does). If you scale to multiple workers/instances, move the
> limiter to a shared store (Redis) or rely on an upstream WAF/rate limiter.
