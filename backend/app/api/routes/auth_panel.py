"""Auth JSON para el panel web del sistema (usuarios system_users, JWT panel)."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.db import system_users_store as sus
from app.services import panel_jwt
from app.services.tablet_password import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Auth panel"])


class AuthBody(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _register_allowed(setup_header: Optional[str]) -> None:
    token = (settings.panel_setup_token or "").strip()
    n = sus.count_users()
    hdr = (setup_header or "").strip()
    if token:
        if hdr != token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cabecera X-Panel-Setup-Token incorrecta o ausente",
            )
        return
    if n == 0:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Ya existen usuarios: define PANEL_SETUP_TOKEN y envía X-Panel-Setup-Token para registrar más",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def auth_register(
    body: AuthBody,
    x_panel_setup_token: Annotated[Optional[str], Header(alias="X-Panel-Setup-Token")] = None,
) -> dict:
    _register_allowed(x_panel_setup_token)
    if sus.get_user_by_username(body.username):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    h = hash_password(body.password)
    uid = sus.create_user(body.username, h)
    return {"ok": True, "id": uid, "username": body.username.strip()}


@router.post("/login", response_model=TokenResponse)
def auth_login(body: AuthBody) -> TokenResponse:
    row = sus.get_user_by_username(body.username)
    if not row or not verify_password(body.password, row[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    tok = panel_jwt.create_access_token(row[1])
    return TokenResponse(access_token=tok)
