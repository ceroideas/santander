"""
Orquestador zaguán: LEDs ESP32 + apertura Modbus según modo operativo.

Modos implementados (v1): horario_automatico, horario_autoservicio.
horario_cerrado queda pendiente hasta definición del cliente (Flujo B).
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Literal, Optional

from app.db import system_events_store as ses

log = logging.getLogger(__name__)

EstadoLed = Literal["libre", "ocupado", "abriendo", "apagado"]
PuertaId = Literal["p1", "p2"]
PulsadorId = Literal["p1", "p2", "p3", "p4"]

SUPPORTED_MODES = frozenset({"horario_automatico", "horario_autoservicio"})

# Estado LED inicial por modo (documento Flujos LED v1.0)
INITIAL_LED_BY_MODE: dict[str, dict[PulsadorId, EstadoLed]] = {
    "horario_automatico": {
        "p1": "libre",
        "p2": "libre",
        "p3": "libre",
        "p4": "libre",
    },
    "horario_autoservicio": {
        "p1": "libre",
        "p2": "ocupado",
        "p3": "libre",
        "p4": "ocupado",
    },
}

# Pulsador → puerta física y regla interfono existente en panel_rules.json
PULSADOR_TO_DOOR: dict[PulsadorId, PuertaId] = {
    "p1": "p1",
    "p2": "p2",
    "p3": "p1",
    "p4": "p2",
}

PULSADOR_TO_INTERFONO_RULE: dict[PulsadorId, str] = {
    "p1": "interfono_puerta_calle_exterior",
    "p2": "interfono_puerta_oficina_exterior",
    "p3": "interfono_puerta_calle_interior",
    "p4": "interfono_puerta_oficina_interior",
}

# Canales LED asociados a cada puerta (exterior + interior)
DOOR_TO_LED_CHANNELS: dict[PuertaId, tuple[PulsadorId, PulsadorId]] = {
    "p1": ("p1", "p3"),
    "p2": ("p2", "p4"),
}

DOOR_OPEN_SENSOR: dict[PuertaId, str] = {
    "p1": "IN_02_04",
    "p2": "IN_03_04",
}

# Reglas cuya ejecución implica apertura de puerta (para sincronizar LED)
DOOR_OPEN_RULE_PREFIXES = (
    "radares_interior_puerta_",
    "radares_exterior_puerta_",
    "interfono_puerta_",
    "pulsador_emergencia_puerta_",
    "apertura_remota_coce_puerta_",
)

ORCHESTRATOR_ENABLED = os.getenv("ZAGUAN_ORCHESTRATOR_ENABLED", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
LED_DEVICE_SYNC = os.getenv("ZAGUAN_LED_DEVICE_SYNC", "1").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
_CAPTURE_ONLY = os.getenv("ZAGUAN_PULSACION_CAPTURE_ONLY", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
MODBUS_ON_PULSACION = (
    not _CAPTURE_ONLY
    and os.getenv("ZAGUAN_MODBUS_ON_PULSACION", "1").strip().lower()
    in ("1", "true", "yes", "on")
)
DOOR_PULSE_OFF_SECONDS = float(os.getenv("ZAGUAN_DOOR_PULSE_OFF_SECONDS", "5"))

_led_states: dict[PulsadorId, EstadoLed] = {
    "p1": "apagado",
    "p2": "apagado",
    "p3": "apagado",
    "p4": "apagado",
}
_current_mode: Optional[str] = None
_door_was_open: dict[PuertaId, bool] = {"p1": False, "p2": False}
_p1_user_in_zaguan: bool = False
_pending_abriendo: dict[PuertaId, bool] = {"p1": False, "p2": False}


def get_led_states() -> dict[str, EstadoLed]:
    return dict(_led_states)


def get_current_mode() -> Optional[str]:
    return _current_mode


def _import_panel():
    from app.api.routes import panel

    return panel


def _import_zaguan_mem():
    import zaguan_esp32

    return zaguan_esp32


def _import_led_client():
    from app.services import zaguan_led_client

    return zaguan_led_client


def _rule_opens_door(rule_key: str) -> Optional[PuertaId]:
    if "puerta_calle" in rule_key or rule_key.endswith("_calle"):
        return "p1"
    if "puerta_oficina" in rule_key or rule_key.endswith("_oficina"):
        return "p2"
    return None


def _apply_led_channels(channels: tuple[PulsadorId, ...], estado: EstadoLed) -> None:
    for ch in channels:
        _led_states[ch] = estado
    _sync_led_memory()
    if LED_DEVICE_SYNC:
        _push_leds_to_device({ch: estado for ch in channels})


def _apply_led_map(states: dict[PulsadorId, EstadoLed]) -> None:
    for ch, est in states.items():
        _led_states[ch] = est
    _sync_led_memory()
    if LED_DEVICE_SYNC:
        _push_leds_to_device(states)


def _sync_led_memory() -> None:
    try:
        z = _import_zaguan_mem()
        for ch, est in _led_states.items():
            z.actualizar_estado_canal(ch, est)
    except Exception as e:  # noqa: BLE001
        log.debug("Sync memoria zaguan_esp32: %s", e)


def _push_leds_to_device(states: dict[PulsadorId, EstadoLed]) -> None:
    client = _import_led_client()
    for ch, est in states.items():
        try:
            client.set_estado_canal(ch, est)
        except client.ZaguanLedClientError as e:
            log.warning("LED ESP32 canal %s -> %s: %s", ch, est, e)


def _record(event_type: str, message: str, payload: dict[str, Any]) -> None:
    try:
        ses.record_event(
            "INFO",
            message,
            event_type=event_type,
            source="zaguan_orchestrator",
            payload=payload,
        )
    except Exception:  # noqa: BLE001
        pass


def on_mode_changed(mode: Optional[str]) -> None:
    """LED inicial al activar modo (solo automático y autoservicio)."""
    if not ORCHESTRATOR_ENABLED:
        return
    global _current_mode, _p1_user_in_zaguan
    _current_mode = mode
    _p1_user_in_zaguan = False
    _pending_abriendo["p1"] = False
    _pending_abriendo["p2"] = False

    if mode not in SUPPORTED_MODES:
        log.info("Modo %s sin orquestación LED zaguán (pendiente o no soportado)", mode)
        return

    initial = INITIAL_LED_BY_MODE.get(mode)
    if not initial:
        return
    _apply_led_map(initial)
    _record(
        "zaguan_mode_led_init",
        f"LED inicial modo {mode}",
        {"mode": mode, "leds": dict(_led_states)},
    )
    log.info("Zaguán LED inicial modo %s: %s", mode, _led_states)


def on_rule_executed(rule_key: str, result: dict[str, Any]) -> None:
    """Sincroniza LED 'abriendo' cuando una regla de apertura se ejecuta (radar/interfono)."""
    if not ORCHESTRATOR_ENABLED:
        return
    if not result.get("executed"):
        return
    if _current_mode not in SUPPORTED_MODES:
        return
    if not any(rule_key.startswith(p) for p in DOOR_OPEN_RULE_PREFIXES):
        return

    door = _rule_opens_door(rule_key)
    if not door:
        return

    if _current_mode == "horario_autoservicio" and door == "p2":
        return

    _set_door_abriendo(door, source=f"rule:{rule_key}")


def _set_door_abriendo(door: PuertaId, *, source: str) -> None:
    channels = DOOR_TO_LED_CHANNELS[door]
    _pending_abriendo[door] = True
    _apply_led_channels(channels, "abriendo")
    _record(
        "zaguan_led_abriendo",
        f"Puerta {door} abriendo ({source})",
        {"door": door, "source": source, "leds": {c: _led_states[c] for c in channels}},
    )


def _autoservicio_post_close_p1() -> None:
    """Tras cerrar P1 en autoservicio: ocupado si usuario dentro del zaguán, libre si sale."""
    if _p1_user_in_zaguan:
        _apply_led_map(
            {
                "p1": "ocupado",
                "p2": "ocupado",
                "p3": "libre",
                "p4": "ocupado",
            }
        )
    else:
        _apply_led_map(
            {
                "p1": "libre",
                "p2": "ocupado",
                "p3": "libre",
                "p4": "ocupado",
            }
        )


def _automatico_post_close(door: PuertaId) -> None:
    if door == "p1":
        _apply_led_channels(DOOR_TO_LED_CHANNELS["p1"], "libre")
    else:
        _apply_led_map(INITIAL_LED_BY_MODE["horario_automatico"])


def _on_door_closed(door: PuertaId) -> None:
    if not _pending_abriendo.get(door):
        return
    _pending_abriendo[door] = False

    if _current_mode == "horario_automatico":
        _automatico_post_close(door)
    elif _current_mode == "horario_autoservicio":
        if door == "p1":
            _autoservicio_post_close_p1()
        else:
            _apply_led_channels(DOOR_TO_LED_CHANNELS["p2"], "ocupado")
    _record(
        "zaguan_door_closed",
        f"Puerta {door} cerrada — LED actualizado",
        {"door": door, "mode": _current_mode, "leds": dict(_led_states)},
    )


def poll_door_sensors() -> None:
    """Detecta flanco de cierre (sensor inductivo deja de indicar abierta)."""
    if not ORCHESTRATOR_ENABLED:
        return
    if _current_mode not in SUPPORTED_MODES:
        return

    panel = _import_panel()
    for door, in_code in DOOR_OPEN_SENSOR.items():
        try:
            is_open = panel.api_v1_read_input_by_code(in_code)
        except Exception as e:  # noqa: BLE001
            log.debug("Lectura sensor puerta %s: %s", door, e)
            continue
        was_open = _door_was_open[door]
        _door_was_open[door] = is_open
        if was_open and not is_open:
            _on_door_closed(door)


def _pulsador_allowed_in_mode(pulsador: PulsadorId) -> tuple[bool, str]:
    if _current_mode not in SUPPORTED_MODES:
        return False, f"Modo {_current_mode!r} sin orquestación zaguán"
    if _current_mode == "horario_autoservicio" and pulsador in ("p2", "p4"):
        return False, "Autoservicio: P2 bloqueada (solo acceso por P1)"
    return True, ""


async def handle_pulsacion(pulsador: PulsadorId, ts: int) -> dict[str, Any]:
    """Flujo pulsación ESP32: validar modo → LED abriendo → apertura Modbus vía regla interfono."""
    log.info("Orquestador pulsación %s (modo=%s, ts=%s)", pulsador, _current_mode, ts)

    allowed, reason = _pulsador_allowed_in_mode(pulsador)
    if not allowed:
        log.info("Pulsación %s rechazada: %s", pulsador, reason)
        _record(
            "zaguan_pulsacion_rejected",
            f"Pulsación {pulsador} rechazada",
            {"pulsador": pulsador, "mode": _current_mode, "reason": reason, "ts": ts},
        )
        return {"ok": False, "reason": reason}

    door = PULSADOR_TO_DOOR[pulsador]
    rule_key = PULSADOR_TO_INTERFONO_RULE[pulsador]

    global _p1_user_in_zaguan
    if _current_mode == "horario_autoservicio":
        if pulsador == "p1":
            _p1_user_in_zaguan = True
        elif pulsador == "p3":
            _p1_user_in_zaguan = False

    _set_door_abriendo(door, source=f"pulsacion:{pulsador}")

    modbus_ok = True
    modbus_detail: Any = None
    if MODBUS_ON_PULSACION:
        panel = _import_panel()
        try:
            modbus_detail = await asyncio.to_thread(
                panel.api_v1_execute_rule_for_tablet,
                rule_key,
            )
            modbus_ok = bool(modbus_detail.get("executed"))
            if not modbus_ok:
                log.warning(
                    "Regla interfono no ejecutada para %s: %s",
                    pulsador,
                    modbus_detail.get("reason"),
                )
        except Exception as e:  # noqa: BLE001
            modbus_ok = False
            modbus_detail = str(e)
            log.warning("Error Modbus pulsación %s: %s", pulsador, e)

        if modbus_ok and DOOR_PULSE_OFF_SECONDS > 0:
            asyncio.create_task(_schedule_door_output_off(door, rule_key, DOOR_PULSE_OFF_SECONDS))

    _record(
        "zaguan_pulsacion",
        f"Pulsación {pulsador} puerta {door}",
        {
            "pulsador": pulsador,
            "door": door,
            "mode": _current_mode,
            "ts": ts,
            "modbus_ok": modbus_ok,
            "rule": rule_key,
            "modbus_detail": modbus_detail if isinstance(modbus_detail, dict) else {"error": modbus_detail},
        },
    )
    return {
        "ok": True,
        "pulsador": pulsador,
        "door": door,
        "mode": _current_mode,
        "modbus_ok": modbus_ok,
    }


async def _schedule_door_output_off(door: PuertaId, rule_key: str, seconds: float) -> None:
    """Apaga salida de apertura tras pulso temporizado (reglas interfono en modo seguimiento)."""
    await asyncio.sleep(seconds)
    panel = _import_panel()
    out_code = "OUT_02_07" if door == "p1" else "OUT_03_07"
    try:
        await asyncio.to_thread(panel.api_v1_set_output_by_code, out_code, False)
        log.debug("Pulso apertura %s finalizado (%s OFF)", door, out_code)
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudo apagar %s tras pulso %s: %s", out_code, rule_key, e)


def bootstrap_from_panel() -> None:
    """Al arranque: aplicar LED si el modo persistido ya es automático o autoservicio."""
    if not ORCHESTRATOR_ENABLED:
        return
    try:
        mode = _import_panel().api_v1_get_current_mode()
    except Exception as e:  # noqa: BLE001
        log.warning("Bootstrap zaguán: no se pudo leer modo panel: %s", e)
        return
    if mode in SUPPORTED_MODES:
        on_mode_changed(mode)
    for door in ("p1", "p2"):
        try:
            is_open = _import_panel().api_v1_read_input_by_code(DOOR_OPEN_SENSOR[door])
            _door_was_open[door] = is_open
        except Exception:  # noqa: BLE001
            pass
