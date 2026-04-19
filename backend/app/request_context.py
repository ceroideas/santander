"""Contexto por petición: actor para auditoría de eventos (panel / tablet / system)."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Literal, Optional, Tuple

Principal = Literal["panel", "tablet", "system"]

_actor: ContextVar[Optional[Tuple[Principal, Optional[str]]]] = ContextVar(
    "audit_actor",
    default=None,
)


def set_actor(principal: Principal, username: Optional[str] = None) -> object:
    """Devuelve el token para reset_actor."""
    return _actor.set((principal, username))


def reset_actor(token: object) -> None:
    _actor.reset(token)


def get_actor() -> Tuple[Principal, Optional[str]]:
    v = _actor.get()
    if v is None:
        return "system", None
    return v[0], v[1]
