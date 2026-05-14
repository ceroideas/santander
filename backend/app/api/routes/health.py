"""GET /api/health — health check. GET /api/ping — solo conectividad HTTP (sin Modbus)."""
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()

# Uptime aproximado (segundos desde import)
_start = time.time()


@router.get("/health", summary="Health check")
def get_health():
    """Estado OK/ERROR, versión, uptime. Sin autenticación para uso interno."""
    return {
        "status": "ok",
        "version": settings.app_version,
        "uptime_seconds": int(time.time() - _start),
    }


@router.get("/ping", summary="Ping front ↔ back (sin placas)")
def get_ping():
    """
    Comprueba que el navegador o el proxy llegan al backend.
    No abre puerto serie, no llama Modbus ni toca `panel`/placas.
    """
    return {
        "ok": True,
        "scope": "http_only",
        "modbus": False,
        "boards": False,
        "version": settings.app_version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
