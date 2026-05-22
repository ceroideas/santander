"""Fan-out en vivo del estado panel al dashboard local (WebSocket)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from fastapi import WebSocket

log = logging.getLogger("panel.live")

_clients: set[WebSocket] = set()
_loop: Optional[asyncio.AbstractEventLoop] = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


async def register(ws: WebSocket) -> None:
    _clients.add(ws)


async def unregister(ws: WebSocket) -> None:
    _clients.discard(ws)


async def broadcast(message: dict[str, Any]) -> None:
    if not _clients:
        return
    dead: list[WebSocket] = []
    for ws in list(_clients):
        try:
            await ws.send_json(message)
        except Exception:  # noqa: BLE001
            dead.append(ws)
    for ws in dead:
        _clients.discard(ws)


def publish_sync(message: dict[str, Any]) -> None:
    """Llamada desde código síncrono del panel (tras Modbus / acciones)."""
    loop = _loop
    if loop is None or not loop.is_running():
        return
    asyncio.run_coroutine_threadsafe(broadcast(message), loop)
