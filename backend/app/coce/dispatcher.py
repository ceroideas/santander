"""Mensajes COCE → sucursal (fase 2: notificaciones, OTA, etc.)."""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("coce.dispatcher")


async def handle_coce_message(message: dict[str, Any]) -> None:
    """Stub: registrar y ampliar en fase 2."""
    msg_type = message.get("type")
    log.debug("Mensaje COCE→sucursal (stub): %s", msg_type)
