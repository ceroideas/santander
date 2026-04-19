"""Establece contexto de actor (tablet) para auditoría en rutas /api/v1/* autenticadas."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.request_context import reset_actor, set_actor
from app.services import tablet_jwt


def _api_base() -> str:
    return (settings.api_prefix or "/api").rstrip("/") or "/api"


class TabletActorContextMiddleware(BaseHTTPMiddleware):
    """Decodifica JWT tablet del Bearer y expone usuario en contextvars para add_event."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        base = _api_base()
        if request.method == "OPTIONS":
            return await call_next(request)
        if not path.startswith(f"{base}/v1/"):
            return await call_next(request)
        if path.startswith(f"{base}/v1/auth/"):
            return await call_next(request)

        auth = request.headers.get("Authorization")
        if not auth or not auth.lower().startswith("bearer "):
            return await call_next(request)
        raw = auth[7:].strip()
        if not raw:
            return await call_next(request)
        try:
            username = tablet_jwt.decode_access_token_username(raw)
        except ValueError:
            return await call_next(request)
        tok = set_actor("tablet", username)
        try:
            return await call_next(request)
        finally:
            reset_actor(tok)
