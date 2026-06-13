"""Application factory. Serves the static portfolio and the /api routes
with security middleware, CORS lock, and rate limiters wired in."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse, Response

from . import __version__
from .config import Settings, get_settings
from .routes import router
from .security import (
    PathGuardMiddleware,
    RateLimiter,
    SecurityHeadersMiddleware,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger("portfolio")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        docs_url=None,          # no public API docs surface
        redoc_url=None,
        openapi_url=None,
    )

    # Rate limiters live on app.state (per-process).
    app.state.ip_limiter = RateLimiter(
        settings.rate_limit_max, settings.rate_limit_window_seconds
    )
    app.state.global_limiter = RateLimiter(
        settings.global_rate_limit_max, settings.rate_limit_window_seconds
    )

    # Middleware (order matters: outermost first).
    app.add_middleware(SecurityHeadersMiddleware, settings=settings)
    app.add_middleware(PathGuardMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )

    # API routes.
    app.include_router(router)

    # ---- Static site ------------------------------------------------------
    site = settings.site_dir
    log.info("Serving static site from %s", site)

    # Custom 404 -> the branded 404.html if present.
    not_found_page = site / "404.html"

    if site.is_dir():
        # html=True makes "/about-this-site.html" and "/" (->index.html) work.
        app.mount(
            "/",
            _SiteFiles(directory=str(site), html=True, not_found=not_found_page),
            name="site",
        )
    else:
        log.warning("SITE_DIR %s does not exist — serving API only", site)

    return app


class _SiteFiles(StaticFiles):
    """StaticFiles that returns the branded 404 page for missing routes.
    Handles both Starlette behaviours (return-404 and raise-HTTPException)."""

    def __init__(self, *args, not_found=None, **kwargs):
        self._not_found = not_found
        super().__init__(*args, **kwargs)

    def _fallback(self):
        if self._not_found and self._not_found.is_file():
            return FileResponse(str(self._not_found), status_code=404)
        return Response("Not found", status_code=404)

    async def get_response(self, path: str, scope):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        try:
            resp = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return self._fallback()
            raise
        if resp.status_code == 404:
            return self._fallback()
        return resp


# Module-level app for `uvicorn server.app.main:app`.
app = create_app()
