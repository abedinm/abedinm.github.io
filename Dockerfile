# ---------------------------------------------------------------------------
# Portfolio — single image that serves the static site AND the secure
# FastAPI contact backend. ~80MB, runs as a non-root user.
# Build:  docker build -t abedin-portfolio .
# Run:    docker run -p 8000:8000 --env-file server/.env abedin-portfolio
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    SITE_DIR=/srv/site

WORKDIR /srv

# --- Python deps (own layer for caching) ---
COPY server/requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt

# --- Backend code ---
COPY server /srv/server

# --- Static site: copy ONLY the frontend, never the Python or git tree.
# .dockerignore already excludes server/, scripts/, .git, etc.; we copy the
# repo into /srv/site and then remove anything that slipped through.
COPY . /srv/site
RUN rm -rf /srv/site/server /srv/site/scripts /srv/site/.git \
           /srv/site/Dockerfile /srv/site/docker-compose.yml \
           /srv/site/Caddyfile /srv/site/.dockerignore \
    && find /srv/site -maxdepth 1 -name "*.py" -delete \
    && find /srv/site -maxdepth 1 -name ".env*" -delete

# --- Non-root user ---
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /srv
USER appuser

EXPOSE 8000

# Single worker keeps the in-memory rate limiter correct. Bump workers only if
# you move rate limiting to a shared store (see DEPLOY.md).
CMD ["sh", "-c", "uvicorn server.app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health').status==200 else 1)"
