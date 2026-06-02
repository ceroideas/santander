"""
SAIMA Seguridad — Control de Accesos Banco Santander
Módulo: zaguan_esp32.py

Endpoints que el ESP32-S3-ETH usa para:
  1. GET  /zaguan/estado         → obtener estado de canales al arrancar
  2. POST /zaguan/pulsacion/p{n} → notificar pulsación de botón

Añadir al server.py:
    from zaguan_esp32 import router as esp32_router
    app.include_router(esp32_router)
"""

from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import BaseModel
from typing import Any, Literal, Callable
import logging
import asyncio

from app.services import zaguan_led_client

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Tipos ──────────────────────────────────────────────────
EstadoValido = Literal["libre", "ocupado", "abriendo", "apagado"]
CanalValido  = Literal["p1", "p2", "p3", "p4"]

# ── Estado actual de los 4 canales (en memoria) ────────────
_estado_canales: dict[str, EstadoValido] = {
    "p1": "apagado",
    "p2": "apagado",
    "p3": "apagado",
    "p4": "apagado",
}

# ── Callback de pulsación ──────────────────────────────────
# Registrar desde server.py para conectar con la lógica de puertas
# Ejemplo: registrar_callback_pulsacion(mi_funcion_apertura)
_callback_pulsacion: Callable | None = None

def registrar_callback_pulsacion(fn: Callable):
    """
    Registra la función que se llamará cuando el ESP32
    notifique una pulsación de botón.

    La función debe aceptar: (canal: str, ts: int)
      canal → "p1" | "p2" | "p3" | "p4"
      ts    → timestamp millis() del ESP32

    Ejemplo en server.py:
        from zaguan_esp32 import registrar_callback_pulsacion

        async def gestionar_apertura(canal: str, ts: int):
            logger.info(f"Pulsación en canal {canal}")
            # lógica de apertura de puerta...

        registrar_callback_pulsacion(gestionar_apertura)
    """
    global _callback_pulsacion
    _callback_pulsacion = fn
    logger.info("[ESP32] Callback de pulsación registrado")


# ══════════════════════════════════════════════════════════
#  MODELOS
# ══════════════════════════════════════════════════════════

class PulsacionBody(BaseModel):
    canal: int          # 1-4
    ts:    int          # millis() del ESP32
    estado: str | None = None


class EstadoCanalBody(BaseModel):
    estado: EstadoValido


class DeviceConfigRedBody(BaseModel):
    ip: str
    gateway: str
    subnet: str
    backend_ip: str
    backend_puerto: int
    backend_ruta: str
    pulsacion_ruta: str


class DeviceConfigCanalBody(BaseModel):
    canal: int
    leds: int | None = None
    brillo: int | None = None


class DeviceConfigEstadoBody(BaseModel):
    estado: EstadoValido
    canal: int | None = None
    color: list[int] | None = None
    animacion: str | None = None
    velocidad: int | None = None


class DeviceConfigFlashBody(BaseModel):
    color: list[int] | None = None
    n_flashes: int | None = None
    duracion_ms: int | None = None


class DeviceTargetBody(BaseModel):
    host: str
    port: int = 80
    timeout_s: float = 2.0


# ══════════════════════════════════════════════════════════
#  ENDPOINT 1 — Estado al arrancar
#  El ESP32 hace GET aquí nada más conectar
# ══════════════════════════════════════════════════════════

@router.get("/api/zaguan/estado")
@router.get("/zaguan/estado")
async def get_estado_zaguan():
    """
    El ESP32 consulta este endpoint al arrancar para obtener
    el estado real de cada canal antes de iniciar animaciones.

    Respuesta:
    {
        "p1": "libre",
        "p2": "ocupado",
        "p3": "libre",
        "p4": "apagado"
    }
    """
    return _estado_canales.copy()


@router.post("/api/zaguan/estado/{canal}")
@router.post("/zaguan/estado/{canal}")
async def set_estado_zaguan(
    canal: CanalValido = Path(..., description="Canal a actualizar: p1|p2|p3|p4"),
    body: EstadoCanalBody = None,
):
    """
    Actualiza el estado lógico de un canal en backend.
    Útil para pruebas y para sincronizar estado visual/manual.
    """
    if body is None:
        return {"ok": False, "error": "Body requerido: {estado}"}
    actualizar_estado_canal(canal, body.estado)
    return {"ok": True, "canal": canal, "estado": body.estado}


# ══════════════════════════════════════════════════════════
#  ENDPOINT 2 — Pulsaciones del ESP32
#  Un endpoint por canal — fire and forget desde el ESP32
# ══════════════════════════════════════════════════════════

@router.post("/api/zaguan/pulsacion/{canal}")
@router.post("/zaguan/pulsacion/{canal}")
async def recibir_pulsacion(
    canal: CanalValido = Path(..., description="Canal pulsado: p1|p2|p3|p4"),
    request: Request = None,
    body: PulsacionBody = None
):
    """
    El ESP32 llama a este endpoint cuando se pulsa un botón físico.
    El ESP32 dispara y se olvida — responder rápido.

    Mapeo de canales:
      p1 → pulsador canal 1 (exterior calle P1)
      p2 → pulsador canal 2 (exterior oficina P2)
      p3 → pulsador canal 3 (interior P1)
      p4 → pulsador canal 4 (interior P2)
    """
    payload_raw: Any = None
    if request is not None:
        try:
            payload_raw = await request.json()
        except Exception:
            payload_raw = None
    ts = body.ts if body else (int(payload_raw.get("ts")) if isinstance(payload_raw, dict) and payload_raw.get("ts") is not None else 0)
    logger.info("[ESP32] PULSACION RECIBIDA canal=%s", canal)
    logger.info("[ESP32] Payload pulsacion: %s", payload_raw if payload_raw is not None else (body.model_dump() if body else {}))

    # Fire-and-forget: la respuesta no espera lógica de negocio/Modbus.
    if _callback_pulsacion is not None:
        asyncio.create_task(_ejecutar_callback_pulsacion(canal, ts))

    return {"ok": True}


@router.post("/api/zaguan/pulsacion")
@router.post("/zaguan/pulsacion")
async def recibir_pulsacion_base(request: Request):
    """
    Endpoint temporal de captura genérica de payload.
    Permite inspeccionar el body real que envía el ESP32 sin asumir canal en la ruta.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    logger.info("[ESP32] PULSACION RECIBIDA (base)")
    logger.info("[ESP32] Payload pulsacion (base): %s", payload)
    return {"ok": True}


# ══════════════════════════════════════════════════════════
#  ENDPOINTS DE CLIENTE SALIENTE (backend -> ESP32)
# ══════════════════════════════════════════════════════════

@router.get("/api/zaguan/device/ping")
def device_ping():
    try:
        return zaguan_led_client.ping()
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/api/zaguan/device/estado")
def device_estado():
    try:
        return zaguan_led_client.estado()
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/api/zaguan/device/config")
def device_config():
    try:
        return zaguan_led_client.config_get()
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/api/zaguan/device/canal/{canal}/estado")
def device_set_estado_canal(
    canal: CanalValido = Path(..., description="Canal de dispositivo p1|p2|p3|p4"),
    body: EstadoCanalBody = None,
):
    if body is None:
        raise HTTPException(status_code=400, detail="Body requerido: {estado}")
    try:
        result = zaguan_led_client.set_estado_canal(canal, body.estado)
        actualizar_estado_canal(canal, body.estado)
        return result
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/api/zaguan/device/config/red")
def device_config_red(body: DeviceConfigRedBody):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    try:
        return zaguan_led_client.config_red(payload)
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/api/zaguan/device/config/canal")
def device_config_canal(body: DeviceConfigCanalBody):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    try:
        return zaguan_led_client.config_canal(payload)
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/api/zaguan/device/config/estado")
def device_config_estado(body: DeviceConfigEstadoBody):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    try:
        return zaguan_led_client.config_estado(payload)
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.post("/api/zaguan/device/config/flash")
def device_config_flash(body: DeviceConfigFlashBody):
    payload: dict[str, Any] = body.model_dump(exclude_none=True)
    try:
        return zaguan_led_client.config_flash(payload)
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/api/zaguan/device/ota/version")
def device_ota_version():
    try:
        return zaguan_led_client.ota_version()
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@router.get("/api/zaguan/device/target")
def device_target_get():
    return zaguan_led_client.get_target()


@router.post("/api/zaguan/device/target")
def device_target_set(body: DeviceTargetBody):
    try:
        return zaguan_led_client.set_target(
            host=body.host,
            port=body.port,
            timeout_s=body.timeout_s,
        )
    except zaguan_led_client.ZaguanLedClientError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ══════════════════════════════════════════════════════════
#  HELPERS — llamar desde el sistema de control
# ══════════════════════════════════════════════════════════

def actualizar_estado_canal(canal: str, estado: EstadoValido):
    """
    Actualiza el estado de un canal en memoria para que
    el ESP32 lo obtenga correctamente al arrancar.

    Llamar siempre que cambie el estado de una puerta:
        actualizar_estado_canal("p1", "ocupado")
        actualizar_estado_canal("p2", "libre")
    """
    if canal in _estado_canales:
        _estado_canales[canal] = estado
        logger.debug(f"[ESP32] Estado canal {canal} → {estado}")


def get_estado_actual() -> dict:
    """Devuelve el estado actual de todos los canales."""
    return _estado_canales.copy()


async def _ejecutar_callback_pulsacion(canal: str, ts: int) -> None:
    """Ejecuta callback de pulsación sin bloquear el response HTTP."""
    try:
        if asyncio.iscoroutinefunction(_callback_pulsacion):
            await _callback_pulsacion(canal, ts)
        else:
            _callback_pulsacion(canal, ts)
    except Exception as e:
        logger.error("[ESP32] Error en callback pulsación: %s", e)
