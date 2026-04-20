"""
Configuración de la aplicación (variables de entorno y valores por defecto).
Ver .env.example en la raíz de backend/.
"""
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuración cargada desde entorno y archivo .env."""

    app_name: str = "Control de Accesos — Santander"
    app_version: str = "0.1.0"
    debug: bool = False

    # API
    api_prefix: str = "/api"

    # API tablet v1 (JWT)
    tablet_jwt_secret: str = "cambiar-en-produccion-usar-env"
    tablet_jwt_expire_minutes: int = 60  # 7 días
    # Si está vacío: solo se permite el primer registro sin cabecera; más usuarios requieren definir token.
    # Si tiene valor: todo registro requiere cabecera X-Tablet-Setup-Token coincidente.
    tablet_setup_token: Optional[str] = None

    # Panel web / sistema (JWT distinto de tablet)
    panel_jwt_secret: str = "cambiar-panel-jwt-en-produccion"
    panel_jwt_expire_minutes: int = 10080  # 7 días
    # Si está vacío: solo el primer usuario sin cabecera; más usuarios requieren PANEL_SETUP_TOKEN + X-Panel-Setup-Token.
    # Si tiene valor: todo registro requiere cabecera coincidente.
    panel_setup_token: Optional[str] = None

    # SQLite
    database_url: str = "sqlite:///./data/control_accesos.db"

    # Modbus ETD8A12 (por defecto; se puede sobreescribir desde boards_config en BD)
    modbus_timeout: float = 3.0
    modbus_default_port: int = 5000
    modbus_default_slave_id: int = 1

    # Persistencia estado (alcance: cada 60 s)
    state_save_interval_seconds: int = 60

    # Retención histórico (alcance: 180 días)
    events_retention_days: int = 180

    # Producción: servir build del frontend desde FastAPI (ruta a frontend/dist o backend/static)
    # Por defecto: carpeta hermana frontend/dist (repo con backend/ y frontend/).
    # Si en el servidor solo copias dist a backend/static, define STATIC_DIR=./static
    static_dir: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Ruta base del proyecto backend (para resolver paths relativos)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

settings = Settings()
