"""JWT para clientes de la API tablet v1."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from jose import JWTError, jwt

from app.core.config import settings


def create_access_token(subject_username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.tablet_jwt_expire_minutes)
    payload: Dict[str, Any] = {
        "sub": subject_username,
        "exp": expire,
    }
    return jwt.encode(payload, settings.tablet_jwt_secret, algorithm="HS256")


def decode_access_token_username(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.tablet_jwt_secret, algorithms=["HS256"])
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub.strip():
            raise JWTError("missing sub")
        return sub.strip()
    except JWTError as e:
        raise ValueError(str(e)) from e
