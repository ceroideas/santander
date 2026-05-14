"""
Configuración de la aplicación (variables de entorno y valores por defecto).
Ver .env.example en la raíz de backend/.
"""
from pathlib import Path
from typing import Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuración cargada desde entorno y archivo .env."""

    app_name: str = "Control de Accesos — Santander"
    app_version: str = "0.1.0"
    debug: bool = False

    # API (prefijo de todos los routers salvo zaguán, que usa rutas fijas /api/zaguan/...)
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
    # Reintentos pymodbus por petición; en remoto conviene 0–1 (cada read del status ya son muchas peticiones).
    modbus_retries: int = 1
    # Si false, en cada barrido de placas no se lee el holding IN↔OUT (relation_register): menos tráfico Modbus;
    # el estado del checkbox de asociación puede quedar menos al día hasta el siguiente POST o conexión.
    panel_poll_in_out_relation_register: bool = True
    modbus_mode: str = "rtu"  # tcp | rtu
    modbus_default_port: int = 5000  # Modbus TCP estándar; ETD8A12 suele usar 502 (no 5000).
    modbus_default_slave_id: int = 1
    modbus_serial_port: str = "COM7"
    modbus_serial_baudrate: int = 9600
    modbus_serial_bytesize: int = 8
    modbus_serial_parity: str = "N"
    modbus_serial_stopbits: int = 1

    # ETD8A12 (Eletechsup): de fábrica suele venir en modo asociado (INx activa OUTx por firmware).
    # Si True, tras conectar Modbus TCP se escribe 0 en `relation_register` del módulo (p. ej. 250 = 0xFA
    # en panel_modules) para intentar desacoplar IN/OUT; el estado queda solo vía lecturas Modbus.
    # Otras revisiones usan registro de “modo de trabajo” distinto (p. ej. 0x0030): ver manual impreso.
    # Riesgo: algunas placas cierran el socket al escribir 0xFA; probar en banco antes de producción.
    etd_disable_in_out_association_on_connect: bool = True

    # Persistencia estado (alcance: cada 60 s)
    state_save_interval_seconds: int = 60

    # Retención histórico (alcance: 180 días)
    events_retention_days: int = 180

    # Evaluación automática de reglas en background (independiente del dashboard)
    auto_rules_background_enabled: bool = True
    auto_rules_background_interval_seconds: int = 5
    # Si está activo, al bajar el trigger de la regla actual se desactiva ese modo.
    auto_rules_deactivate_on_fall: bool = True

    # Producción: servir build del frontend desde FastAPI (ruta a frontend/dist o backend/static)
    # Por defecto: carpeta hermana frontend/dist (repo con backend/ y frontend/).
    # Si en el servidor solo copias dist a backend/static, define STATIC_DIR=./static
    static_dir: Optional[str] = None

    # Dispositivo ESP32 zaguán (cliente HTTP saliente backend -> ESP32)
    zaguan_device_host: str = "192.168.10.20"
    zaguan_device_port: int = 80
    zaguan_device_timeout_s: float = 2.0

    @model_validator(mode="after")
    def normalize_api_prefix(self) -> "Settings":
        """Evita API_PREFIX vacío o con barras dobles que rompen el match con el proxy Vite (/api/...)."""
        p = (self.api_prefix or "/api").strip()
        if not p:
            p = "/api"
        if not p.startswith("/"):
            p = "/" + p
        p = p.rstrip("/") or "/api"
        object.__setattr__(self, "api_prefix", p)
        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Ruta base del proyecto backend (para resolver paths relativos)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

settings = Settings()
