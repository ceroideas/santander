"""Estado en vivo por sucursal y fan-out al dashboard (solo si hay viewers)."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import WebSocket

from app.core.config import settings

log = logging.getLogger("coce.live_hub")

BranchStatus = str  # operativo | no_operativo | apagado


@dataclass
class BranchLiveState:
    installation_id: str
    nombre: str = ""
    ws_connected: bool = False
    last_heartbeat_ts: float = 0.0
    last_event_ts: float = 0.0
    modbus: bool = False
    boards_connected: int = 0
    boards_total: int = 0
    current_mode: Optional[str] = None
    partial: dict[str, Any] = field(default_factory=dict)

    def to_public(self, status: BranchStatus) -> dict[str, Any]:
        return {
            "installationId": self.installation_id,
            "nombre": self.nombre,
            "status": status,
            "wsConnected": self.ws_connected,
            "modbus": self.modbus,
            "boardsConnected": self.boards_connected,
            "boardsTotal": self.boards_total,
            "currentMode": self.current_mode,
            "lastHeartbeatTs": self.last_heartbeat_ts or None,
            "lastEventTs": self.last_event_ts or None,
            "partial": self.partial or None,
        }


class LiveHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._states: dict[str, BranchLiveState] = {}
        self._branch_ws: dict[str, WebSocket] = {}
        self._dashboard_ws: set[WebSocket] = set()
        self._viewer_count = 0

    @property
    def viewer_count(self) -> int:
        return self._viewer_count

    def _timeout_s(self) -> float:
        return float(settings.branch_heartbeat_timeout_seconds)

    def derive_status(self, st: BranchLiveState) -> BranchStatus:
        now = time.time()
        if not st.ws_connected:
            if st.last_heartbeat_ts and (now - st.last_heartbeat_ts) <= self._timeout_s():
                pass
            else:
                return "apagado"
        if st.last_heartbeat_ts and (now - st.last_heartbeat_ts) > self._timeout_s():
            return "apagado"
        if st.modbus and st.boards_connected > 0:
            return "operativo"
        if st.ws_connected or st.last_heartbeat_ts:
            return "no_operativo"
        return "apagado"

    async def ensure_branch(self, installation_id: str, nombre: str = "") -> BranchLiveState:
        async with self._lock:
            st = self._states.get(installation_id)
            if not st:
                st = BranchLiveState(installation_id=installation_id, nombre=nombre)
                self._states[installation_id] = st
            elif nombre and not st.nombre:
                st.nombre = nombre
            return st

    async def register_branch_ws(self, installation_id: str, ws: WebSocket, nombre: str = "") -> None:
        async with self._lock:
            old = self._branch_ws.get(installation_id)
            if old is not None and old is not ws:
                try:
                    await old.close(code=4000, reason="replaced")
                except Exception:  # noqa: BLE001
                    pass
            self._branch_ws[installation_id] = ws
            st = self._states.get(installation_id) or BranchLiveState(
                installation_id=installation_id, nombre=nombre
            )
            st.ws_connected = True
            st.nombre = nombre or st.nombre
            self._states[installation_id] = st

    async def unregister_branch_ws(self, installation_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if self._branch_ws.get(installation_id) is ws:
                del self._branch_ws[installation_id]
            st = self._states.get(installation_id)
            if st:
                st.ws_connected = False
        await self._maybe_broadcast(installation_id)

    async def register_dashboard(self, ws: WebSocket) -> None:
        async with self._lock:
            self._dashboard_ws.add(ws)
            self._viewer_count = len(self._dashboard_ws)

    async def unregister_dashboard(self, ws: WebSocket) -> None:
        async with self._lock:
            self._dashboard_ws.discard(ws)
            self._viewer_count = len(self._dashboard_ws)

    async def ingest(self, installation_id: str, message: dict[str, Any], nombre: str = "") -> None:
        msg_type = str(message.get("type") or "event")
        payload = message.get("payload")
        if not isinstance(payload, dict):
            payload = {}

        async with self._lock:
            st = self._states.get(installation_id) or BranchLiveState(
                installation_id=installation_id, nombre=nombre
            )
            if nombre:
                st.nombre = nombre
            now = time.time()
            st.last_event_ts = now

            if msg_type == "heartbeat":
                st.last_heartbeat_ts = now
                st.modbus = bool(payload.get("modbus"))
                st.boards_connected = int(payload.get("boards_connected") or 0)
                st.boards_total = int(payload.get("boards_total") or 0)
                if "current_mode" in payload:
                    st.current_mode = payload.get("current_mode")
            elif msg_type == "mode_changed":
                st.current_mode = payload.get("current_mode")
                st.partial = {"currentMode": st.current_mode}
            elif msg_type in ("output_changed", "input_override", "board_connected", "board_disconnected"):
                st.partial = payload
            elif msg_type in ("snapshot", "panel_status"):
                st.modbus = bool(payload.get("modbus"))
                st.boards_connected = int(payload.get("boards_connected") or 0)
                st.boards_total = int(payload.get("boards_total") or 0)
                st.current_mode = payload.get("current_mode")
                st.partial = payload

            self._states[installation_id] = st
            status = self.derive_status(st)
            event = {
                "type": "branch_update",
                "installationId": installation_id,
                "status": status,
                "branch": st.to_public(status),
                "message": {"type": msg_type, "payload": payload},
            }

        await self._broadcast(event)

    async def _maybe_broadcast(self, installation_id: str) -> None:
        async with self._lock:
            st = self._states.get(installation_id)
            if not st:
                return
            status = self.derive_status(st)
            event = {
                "type": "branch_update",
                "installationId": installation_id,
                "status": status,
                "branch": st.to_public(status),
            }
        await self._broadcast(event)

    async def _broadcast(self, event: dict[str, Any]) -> None:
        if self._viewer_count <= 0:
            return
        async with self._lock:
            clients = list(self._dashboard_ws)
        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(event)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            await self.unregister_dashboard(ws)

    async def snapshot_for_dashboard(self) -> dict[str, Any]:
        async with self._lock:
            items = []
            for iid, st in self._states.items():
                status = self.derive_status(st)
                items.append(st.to_public(status))
            return {"type": "live_snapshot", "branches": items}

    async def send_to_branch(self, installation_id: str, message: dict[str, Any]) -> bool:
        async with self._lock:
            ws = self._branch_ws.get(installation_id)
        if not ws:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("send_to_branch %s: %s", installation_id, e)
            return False


live_hub = LiveHub()
