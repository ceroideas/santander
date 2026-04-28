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
from zaguan_esp32 import registrar_callback_pulsacion, router as zaguan_esp32_router

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("control_accesos")

# Mapeo fijo de pulsadores ESP32 -> salida física a activar en ETD8A12.
# Ajustar estos códigos OUT_YY_ZZ según instalación real.
ZAGUAN_PULSADOR_TO_OUT_CODE = {
    "p1": "OUT_02_01",  # Exterior calle P1
    "p2": "OUT_03_01",  # Exterior oficina P2
    "p3": "OUT_02_01",  # Interior P1
    "p4": "OUT_03_01",  # Interior P2
}
ZAGUAN_PULSE_SECONDS = 0.7


async def _events_retention_loop() -> None:
    while True:
        await asyncio.sleep(6 * 3600)
        try:
            n = ses.purge_events_older_than()
            if n:
                log.info("Retención system_events: eliminadas %s filas", n)
        except Exception as e:  # noqa: BLE001
            log.warning("Purge system_events: %s", e)


async def _auto_rules_background_loop() -> None:
    interval_s = max(1, int(settings.auto_rules_background_interval_seconds))
    while True:
        await asyncio.sleep(interval_s)
        try:
            panel.background_auto_rules_cycle(
                deactivate_on_fall=bool(settings.auto_rules_deactivate_on_fall),
            )
        except Exception as e:  # noqa: BLE001
            log.warning("Ciclo auto-rules background: %s", e)


async def _on_zaguan_pulsacion(canal: str, ts: int) -> None:
    """Callback base para pulsaciones de zaguán (p1..p4) con mapeo fijo."""
    log.info("Pulsación zaguán recibida: canal=%s ts=%s", canal, ts)
    out_code = ZAGUAN_PULSADOR_TO_OUT_CODE.get(canal)
    if not out_code:
        log.warning("Canal zaguán sin mapeo fijo: %s", canal)
        try:
            ses.record_event(
                "WARN",
                f"Pulsación zaguán sin mapeo: {canal}",
                event_type="zaguan_button_unmapped",
                source="zaguan_esp32",
                payload={"canal": canal, "ts": ts},
            )
        except Exception:  # noqa: BLE001
            pass
        return

    # Pulso de apertura: ON corto y luego OFF.
    try:
        panel.api_v1_set_output_by_code(out_code, True)
        await asyncio.sleep(ZAGUAN_PULSE_SECONDS)
        panel.api_v1_set_output_by_code(out_code, False)
    except Exception as e:  # noqa: BLE001
        log.warning("Error al ejecutar mapeo zaguán %s -> %s: %s", canal, out_code, e)
        try:
            ses.record_event(
                "ERR",
                f"Error mapeo zaguán {canal} -> {out_code}",
                event_type="zaguan_button_action_error",
                source="zaguan_esp32",
                payload={"canal": canal, "out_code": out_code, "ts": ts, "error": str(e)},
            )
        except Exception:  # noqa: BLE001
            pass
        return

    try:
        ses.record_event(
            "INFO",
            f"Pulsación zaguán {canal} -> {out_code}",
            event_type="zaguan_button_press",
            source="zaguan_esp32",
            payload={"canal": canal, "out_code": out_code, "ts": ts},
        )
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudo registrar evento zaguán: %s", e)


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
    registrar_callback_pulsacion(_on_zaguan_pulsacion)
    retention_task = asyncio.create_task(_events_retention_loop())
    auto_rules_task: Optional[asyncio.Task] = None
    if settings.auto_rules_background_enabled:
        auto_rules_task = asyncio.create_task(_auto_rules_background_loop())
    yield
    retention_task.cancel()
    if auto_rules_task:
        auto_rules_task.cancel()
    try:
        await retention_task
    except asyncio.CancelledError:
        pass
    if auto_rules_task:
        try:
            await auto_rules_task
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
# Endpoints para integración ESP32 zaguán (sin prefijo /api, compat firmware)
app.include_router(zaguan_esp32_router)


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
