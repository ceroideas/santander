"""
Aplicación principal FastAPI — Control de Accesos (Santander / SAIMA).
Arranque: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.config import BASE_DIR, settings
from app.api.routes import health, status, modes, events, config, panel, tablet_v1, auth_panel
from app.db import system_events_store as ses
from app.middleware.panel_api_auth import PanelApiAuthMiddleware
from app.middleware.tablet_actor_context import TabletActorContextMiddleware

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("control_accesos")


async def _events_retention_loop() -> None:
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            n = ses.purge_events_older_than()
            if n:
                log.info("Retención system_events: eliminadas %s filas", n)
        except Exception as e:  # noqa: BLE001
            log.warning("Purge system_events: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicio y cierre: conexión BD, polling Modbus, etc."""
    log.info("Iniciando servicio Control de Accesos")
    try:
        ses.ensure_system_events_schema()
        n0 = ses.purge_events_older_than()
        if n0:
            log.info("Retención system_events (arranque): eliminadas %s filas", n0)
    except Exception as e:  # noqa: BLE001
        log.warning("system_events al arranque: %s", e)
    retention_task = asyncio.create_task(_events_retention_loop())
    yield
    retention_task.cancel()
    try:
        await retention_task
    except asyncio.CancelledError:
        pass
    log.info("Cerrando servicio")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API REST para control de accesos — tablet, configuración web, integración COCE (fase 2)",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción restringir al origen del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(PanelApiAuthMiddleware)
app.add_middleware(TabletActorContextMiddleware)

# Rutas bajo /api (ver API_SPEC.md)
app.include_router(health.router, prefix=settings.api_prefix, tags=["Salud"])
app.include_router(status.router, prefix=settings.api_prefix, tags=["Estado"])
app.include_router(modes.router, prefix=settings.api_prefix, tags=["Modos"])
app.include_router(events.router, prefix=settings.api_prefix, tags=["Eventos"])
app.include_router(config.router, prefix=settings.api_prefix, tags=["Configuración"])
app.include_router(panel.router, prefix=settings.api_prefix, tags=["Panel ETD8A12"])
app.include_router(auth_panel.router, prefix=settings.api_prefix)
app.include_router(tablet_v1.router, prefix=settings.api_prefix)


# ─── Servir frontend en producción ─────────────────────────────────────────
# Si existe el build del frontend (frontend/dist o STATIC_DIR), se sirve la SPA:
# - /assets/* → archivos estáticos (JS, CSS)
# - Cualquier otra ruta que no sea /api, /docs, /redoc → index.html (SPA)
# Ver DESARROLLO.md, sección "Producción: servir el frontend desde el backend".

def _get_frontend_dist_path() -> Optional[Path]:
    if settings.static_dir:
        p = (BASE_DIR / settings.static_dir).resolve()
    else:
        p = BASE_DIR.parent / "frontend" / "dist"
    return p if p.is_dir() and (p / "index.html").exists() else None

_frontend_dist = _get_frontend_dist_path()

if _frontend_dist:
    _assets = _frontend_dist / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")
    log.info("Sirviendo frontend desde %s", _frontend_dist)

    @app.get("/")
    def serve_index():
        return FileResponse(str(_frontend_dist / "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        """Cualquier ruta no cubierta por la API o /docs,/redoc devuelve la SPA."""
        return FileResponse(str(_frontend_dist / "index.html"))
else:
    @app.get("/")
    def root():
        """Raíz: info del servicio (cuando no se sirve frontend)."""
        return {
            "service": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs",
            "api": settings.api_prefix,
        }
