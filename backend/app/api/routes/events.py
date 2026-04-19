"""GET /api/events, GET /api/events/export — histórico unificado (SQLite, retención)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse

from app.db import system_events_store as ses

router = APIRouter()


@router.get("/events", summary="Histórico de eventos")
def get_events(
    from_date: str | None = Query(None, description="ISO 8601 fecha/hora inicial"),
    to_date: str | None = Query(None, description="ISO 8601 fecha/hora final"),
    type_filter: str | None = Query(None, alias="type", description="Severidad: OK, INFO, WARN, ERR"),
    limit: int = Query(100, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    total, events = ses.list_events(
        from_date=from_date,
        to_date=to_date,
        severity_filter=type_filter.upper() if type_filter else None,
        limit=limit,
        offset=offset,
    )
    return {
        "total": total,
        "events": events,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/events/export", summary="Exportar eventos en CSV")
def export_events(
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    type_filter: str | None = Query(None, alias="type"),
):
    csv_data = ses.export_csv(
        from_date=from_date,
        to_date=to_date,
        severity_filter=type_filter.upper() if type_filter else None,
    )
    return PlainTextResponse(
        csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="events_export.csv"'},
    )
