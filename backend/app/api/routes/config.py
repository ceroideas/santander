"""GET/PUT /api/config/* — horarios, festivos, tiempos, boards (IPs ETD8A12)."""
from fastapi import APIRouter

router = APIRouter(prefix="/config")


@router.get("/schedules", summary="Configuración de horarios")
def get_schedules():
    """Franjas horarias por modo. (TODO: tabla schedule_slots.)"""
    return {"schedules": []}


@router.put("/schedules", summary="Actualizar horarios")
def put_schedules():
    """(TODO: validar y guardar en schedule_slots.)"""
    return {"ok": True}


@router.get("/holidays", summary="Calendario de festivos")
def get_holidays():
    """(TODO: tabla holidays.)"""
    return {"holidays": []}


@router.post("/holidays", summary="Añadir festivo")
def post_holiday():
    return {"id": 1}


@router.delete("/holidays/{holiday_id}", summary="Eliminar festivo")
def delete_holiday(holiday_id: int):
    return {"deleted": holiday_id}


@router.get("/timings", summary="Tiempos (retardos, pulsos)")
def get_timings():
    """(TODO: tabla config_timings.)"""
    return {"timings": {}}


@router.put("/timings", summary="Actualizar tiempos")
def put_timings():
    return {"ok": True}


@router.get("/boards", summary="Configuración módulos ETD8A12")
def get_boards():
    """IP, puerto, slave_id de los 3 módulos. (TODO: tabla boards_config.)"""
    return {
        "boards": [
            {"board_id": 1, "name": "Central", "host": "192.168.0.10", "port": 5000, "slave_id": 1},
            {"board_id": 2, "name": "Puerta Calle", "host": "192.168.0.11", "port": 5000, "slave_id": 1},
            {"board_id": 3, "name": "Puerta Oficina", "host": "192.168.0.12", "port": 5000, "slave_id": 1},
        ]
    }


@router.put("/boards", summary="Actualizar configuración de módulos")
def put_boards():
    """(TODO: validar y guardar en boards_config; reconectar Modbus.)"""
    return {"ok": True}
