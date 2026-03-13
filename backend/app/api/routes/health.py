"""GET /api/health — health check para watchdog y balanceadores."""
import time
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
