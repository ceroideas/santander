"""GET /api/events, GET /api/events/export — histórico de eventos (180 días)."""
from datetime import datetime
from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

router = APIRouter()


@router.get("/events", summary="Histórico de eventos")
def get_events(
    from_date: str | None = Query(None, description="ISO 8601 fecha/hora inicial"),
    to_date: str | None = Query(None, description="ISO 8601 fecha/hora final"),
    type_filter: str | None = Query(None, alias="type", description="Tipo: mode_change, door_open, alarm, ..."),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Lista eventos con filtros. (TODO: leer de tabla events en SQLite.)"""
    return {
        "total": 0,
        "events": [],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/events/export", summary="Exportar eventos en CSV")
def export_events(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    type_filter: str | None = Query(None, alias="type"),
):
    """Mismos filtros que GET /events; respuesta CSV. (TODO: implementar con tabla events.)"""
    csv = "id,timestamp,type,detail,source,board_id\n"
    return PlainTextResponse(csv, media_type="text/csv")
    # TODO: generar CSV desde BD y devolver con Content-Disposition attachment
