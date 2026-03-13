"""GET /api/status, GET /api/doors — estado global y de puertas/módulos."""
from datetime import datetime
from fastapi import APIRouter

router = APIRouter()


@router.get("/status", summary="Estado global del sistema")
def get_status():
    """Modo activo, placas conectadas, última persistencia. (TODO: leer de system_state y hardware.)"""
    return {
        "status": "running",
        "current_mode": "AUTOMATICO",
        "mode_id": 1,
        "boards_connected": 0,
        "boards_total": 3,
        "last_state_save": None,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/doors", summary="Estado de puertas / módulos")
def get_doors():
    """Estado por puerta (Calle, Oficina) o por módulo ETD8A12. (TODO: leer de hardware/boards.)"""
    return {
        "doors": [
            {"id": "calle", "board_id": 2, "connected": False, "inputs": {}, "outputs": {}},
            {"id": "oficina", "board_id": 3, "connected": False, "inputs": {}, "outputs": {}},
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
