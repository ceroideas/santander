"""GET/PUT /api/config/* — horarios, festivos, tiempos, boards (IPs ETD8A12)."""
from fastapi import APIRouter, Query
from app.hardware.modbus_client import get_boards_config_placeholder, test_board_ports

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
    boards_cfg = get_boards_config_placeholder()
    return {
        "boards": [
            {"board_id": board_id, **cfg}
            for board_id, cfg in boards_cfg.items()
        ]
    }


@router.put("/boards", summary="Actualizar configuración de módulos")
def put_boards():
    """(TODO: validar y guardar en boards_config; reconectar Modbus.)"""
    return {"ok": True}


@router.get("/boards/test-connection", summary="Diagnóstico de conectividad ETD8A12")
def test_boards_connection(
    timeout: float = Query(default=2.0, ge=0.5, le=10.0),
):
    """
    Prueba conectividad TCP a las IPs de ETD8A12.
    Se prueba el puerto configurado y puertos típicos de diagnóstico.
    """
    ports_to_check = [5000, 502, 80, 443, 23]
    boards_cfg = get_boards_config_placeholder()
    diagnostics = []

    for board_id, cfg in boards_cfg.items():
        host = cfg["host"]
        report = test_board_ports(host=host, ports=ports_to_check, timeout=timeout)
        diagnostics.append(
            {
                "board_id": board_id,
                "name": cfg["name"],
                "host": host,
                "configured_port": cfg["port"],
                "modbus_configured_reachable": any(
                    c["port"] == cfg["port"] and c["reachable"] for c in report["checks"]
                ),
                "open_ports": report["open_ports"],
                "checks": report["checks"],
            }
        )

    return {
        "ok": True,
        "timeout_seconds": timeout,
        "tested_ports": ports_to_check,
        "boards": diagnostics,
    }
