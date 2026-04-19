"""GET /api/modes, POST /api/mode — modos operativos (7 modos, exclusión mutua)."""
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import system_events_store as ses

router = APIRouter()

MODES = [
    {"id": 1, "name": "AUTOMÁTICO", "description": "Apertura automática por radares. ICR2 y llave Winhouse desactivados."},
    {"id": 2, "name": "ESCLUSA", "description": "Apertura secuencial (una puerta a la vez)."},
    {"id": 3, "name": "EXTENDIDO", "description": "Horario extendido. Todas las funciones operativas."},
    {"id": 4, "name": "AUTOSERVICIO", "description": "Cajeros operativos. Cierres en puerta oficina si está cerrada."},
    {"id": 5, "name": "CERRADO", "description": "Instalación cerrada. Solo emergencias."},
    {"id": 6, "name": "CARGA CAJERO", "description": "Recarga de cajeros. Bloqueo puerta oficina."},
    {"id": 7, "name": "MANUAL", "description": "Control manual. Operación por pulsadores."},
]


class SetModeBody(BaseModel):
    mode_id: int


@router.get("/modes", summary="Modos disponibles y activo")
def get_modes():
    """Lista de 7 modos y cuál está activo. (TODO: modo activo desde system_state.)"""
    return {
        "current_mode_id": 1,
        "current_mode_name": "AUTOMÁTICO",
        "modes": MODES,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.post("/mode", summary="Cambiar modo operativo")
def set_mode(body: SetModeBody):
    """Cambia el modo (1–7). Exclusión mutua. (TODO: validar enclavamientos y persistir.)"""
    if not 1 <= body.mode_id <= 7:
        raise HTTPException(status_code=400, detail="mode_id debe estar entre 1 y 7")
    prev_id = 1  # TODO: leer de estado
    name = next((m["name"] for m in MODES if m["id"] == body.mode_id), "?")
    try:
        ses.record_event(
            "INFO",
            f"Cambio modo operativo (API): id={body.mode_id} → {name} (anterior id={prev_id})",
            event_type="mode_change",
        )
    except Exception:  # noqa: BLE001
        pass
    return {
        "mode_id": body.mode_id,
        "mode_name": name,
        "previous_mode_id": prev_id,
        "message": "Modo cambiado correctamente",
    }
