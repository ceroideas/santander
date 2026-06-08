"""
Orquestador zaguán: LEDs ESP32 + apertura Modbus según modo operativo.

Modos implementados: horario_automatico, horario_esclusa, horario_autoservicio,
horario_extendido.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Literal, Optional

from app.db import system_events_store as ses

log = logging.getLogger(__name__)

EstadoLed = Literal["libre", "ocupado", "abriendo", "apagado"]
PuertaId = Literal["p1", "p2"]
PulsadorId = Literal["p1", "p2", "p3", "p4"]

SUPPORTED_MODES = frozenset(
    {
        "horario_automatico",
        "horario_esclusa",
        "horario_autoservicio",
        "horario_extendido",
    }
)
INTERLOCK_MODES = frozenset({"horario_esclusa", "horario_extendido"})

# Autoservicio (Excel ENTRADAS Y SALIDAS — módulo 3, IN3 inductivo llave echada)
WINHOSE_IN_P2 = "IN_03_03"
WINHOSE_WINDOW_SECONDS = 15.0
# Si en banco la secuencia WinHose no dispara la ventana 15 s, cambiar a False aquí.
WINHOSE_ARMED_IS_ACTIVE_HIGH = True
OCCUPANCY_INPUT_CODES = ("IN_01_11", "IN_02_10")
DOOR_PULSE_OFF_SECONDS = 5.0
# Tras el pulso Modbus (~5 s), si el inductivo no marca apertura, volver LED a libre.
DOOR_LED_REPOSO_AFTER_S = DOOR_PULSE_OFF_SECONDS + 1.5
# Autoservicio: no liberar la puerta opuesta hasta cierre real (sensor) o tiempo máximo.
DOOR_AUTOSERVICIO_INTERLOCK_MAX_S = 90.0
DOOR_AUTOSERVICIO_MIN_MANEUVER_S = 3.0
DOOR_AUTOSERVICIO_CLOSE_DEBOUNCE_POLLS = 3
# Si IN_xx_04 no marcó apertura: cerrar interbloqueo tras lecturas estables de «cerrada».
DOOR_AUTOSERVICIO_FALLBACK_CLOSE_S = DOOR_PULSE_OFF_SECONDS + 4.0

INITIAL_LED_BY_MODE: dict[str, dict[PulsadorId, EstadoLed]] = {
    "horario_automatico": {
        "p1": "libre",
        "p2": "libre",
        "p3": "libre",
        "p4": "libre",
    },
    "horario_esclusa": {
        "p1": "libre",
        "p2": "libre",
        "p3": "libre",
        "p4": "libre",
    },
    "horario_autoservicio": {
        "p1": "libre",
        "p2": "ocupado",
        "p3": "libre",
        "p4": "libre",
    },
    "horario_extendido": {
        "p1": "libre",
        "p2": "libre",
        "p3": "libre",
        "p4": "libre",
    },
}

OPPOSITE_DOOR: dict[PuertaId, PuertaId] = {"p1": "p2", "p2": "p1"}

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

DOOR_TO_LED_CHANNELS: dict[PuertaId, tuple[PulsadorId, PulsadorId]] = {
    "p1": ("p1", "p3"),
    "p2": ("p2", "p4"),
}

DOOR_OPEN_SENSOR: dict[PuertaId, str] = {
    "p1": "IN_02_04",
    "p2": "IN_03_04",
}

DOOR_OPEN_RULE_PREFIXES = (
    "radares_interior_puerta_",
    "radares_exterior_puerta_",
    "interfono_puerta_",
    "pulsador_emergencia_puerta_",
    "apertura_remota_coce_puerta_",
)

ORCHESTRATOR_ENABLED = True
LED_DEVICE_SYNC = True
_CAPTURE_ONLY = os.getenv("ZAGUAN_PULSACION_CAPTURE_ONLY", "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)
MODBUS_ON_PULSACION = not _CAPTURE_ONLY

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
_abriendo_since: dict[PuertaId, float] = {"p1": 0.0, "p2": 0.0}
# Autoservicio: bloquea la puerta opuesta hasta cierre confirmado (IN_xx_04).
_door_interlock_active: dict[PuertaId, bool] = {"p1": False, "p2": False}
_saw_open_while_interlock: dict[PuertaId, bool] = {"p1": False, "p2": False}
_door_closed_streak: dict[PuertaId, int] = {"p1": 0, "p2": 0}

# WinHose P2 (autoservicio): IN_03_03 secuencia cierre→apertura → ventana 15 s
_winhose_last_armed: Optional[bool] = None
_winhose_saw_armed: bool = False
_winhose_window_until: float = 0.0
_p2_intermittent: bool = False
_intermittent_task: Optional[asyncio.Task] = None

# Extendido: p2 exterior → llamada consola (sin Modbus); p3 intermitente hasta COCE/p4.
_extendido_p2_call_pending: bool = False
_p3_intermittent: bool = False
_p3_intermittent_task: Optional[asyncio.Task] = None


def get_led_states() -> dict[str, EstadoLed]:
    return dict(_led_states)


def get_autoservicio_status() -> dict[str, Any]:
    """Estado auxiliar ATM (WinHose, intermitente) para depuración/API."""
    now = time.monotonic()
    return {
        "winhose_window_active": _winhose_window_active(),
        "winhose_window_remaining_s": max(0.0, _winhose_window_until - now)
        if _winhose_window_until
        else 0.0,
        "p2_intermittent": _p2_intermittent,
        "winhose_saw_armed": _winhose_saw_armed,
        "p1_user_in_zaguan": _p1_user_in_zaguan,
        "winhose_in": WINHOSE_IN_P2,
        "winhose_armed_is_active_high": WINHOSE_ARMED_IS_ACTIVE_HIGH,
        "extendido_p2_call_pending": _extendido_p2_call_pending,
        "p3_intermittent": _p3_intermittent,
    }


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


def _read_input(code: str) -> bool:
    return bool(_import_panel().api_v1_read_input_by_code(code))


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


def _reset_winhose_state() -> None:
    global _winhose_last_armed, _winhose_saw_armed, _winhose_window_until, _p2_intermittent
    global _intermittent_task
    _winhose_last_armed = None
    _winhose_saw_armed = False
    _winhose_window_until = 0.0
    _p2_intermittent = False
    if _intermittent_task and not _intermittent_task.done():
        _intermittent_task.cancel()
    _intermittent_task = None


def _reset_extendido_state() -> None:
    global _extendido_p2_call_pending, _p3_intermittent, _p3_intermittent_task
    _extendido_p2_call_pending = False
    _p3_intermittent = False
    if _p3_intermittent_task and not _p3_intermittent_task.done():
        _p3_intermittent_task.cancel()
    _p3_intermittent_task = None


def _stop_p3_intermittent() -> None:
    global _p3_intermittent, _p3_intermittent_task
    _p3_intermittent = False
    if _p3_intermittent_task and not _p3_intermittent_task.done():
        _p3_intermittent_task.cancel()
    _p3_intermittent_task = None


async def _p3_intermittent_loop() -> None:
    """Extendido: p3 intermitente mientras espera autorización consola."""
    client = _import_led_client()
    try:
        while _extendido_p2_call_pending:
            try:
                await asyncio.to_thread(client.set_estado_canal, "p3", "libre")
                await asyncio.to_thread(
                    client.config_flash,
                    {"color": [0, 200, 0], "n_flashes": 2, "duracion_ms": 350},
                )
            except Exception as e:  # noqa: BLE001
                log.debug("Flash intermitente p3: %s", e)
            await asyncio.sleep(0.9)
    except asyncio.CancelledError:
        pass


def _clear_extendido_p2_call() -> None:
    global _extendido_p2_call_pending
    if not _extendido_p2_call_pending:
        return
    _extendido_p2_call_pending = False
    _stop_p3_intermittent()
    if _current_mode == "horario_extendido":
        _led_states["p3"] = "libre"
        _sync_led_memory()
        if LED_DEVICE_SYNC:
            try:
                _import_led_client().set_estado_canal("p3", "libre")
            except Exception as e:  # noqa: BLE001
                log.debug("LED p3 reposo tras llamada consola: %s", e)


def _start_extendido_p2_call() -> None:
    """p2 exterior: notifica consola y enciende p3 intermitente (sin abrir P2)."""
    global _extendido_p2_call_pending, _p3_intermittent, _p3_intermittent_task
    _extendido_p2_call_pending = True
    _p3_intermittent = True
    _apply_led_map(dict(INITIAL_LED_BY_MODE["horario_extendido"]))
    _record(
        "zaguan_extendido_call",
        "Extendido: llamada consola P2 (p3 intermitente)",
        {"pulsador": "p2", "mode": _current_mode},
    )
    log.info("Extendido: llamada consola P2 — p3 intermitente")
    try:
        loop = asyncio.get_running_loop()
        _p3_intermittent_task = loop.create_task(_p3_intermittent_loop())
    except RuntimeError:
        pass


def _winhose_window_active() -> bool:
    return _winhose_window_until > 0 and time.monotonic() < _winhose_window_until


def _input_means_armed(raw_active: bool) -> bool:
    return raw_active if WINHOSE_ARMED_IS_ACTIVE_HIGH else not raw_active


def _autoservicio_reposo() -> None:
    """Excel ATM reposo: P1 verde, P2 ext rojo, P1 int y P2 int verde."""
    _stop_p2_intermittent()
    _apply_led_map(dict(INITIAL_LED_BY_MODE["horario_autoservicio"]))


def _stop_p2_intermittent() -> None:
    global _p2_intermittent, _intermittent_task
    _p2_intermittent = False
    if _intermittent_task and not _intermittent_task.done():
        _intermittent_task.cancel()
    _intermittent_task = None


async def _p2_intermittent_loop(until: float) -> None:
    """Simula INTERMITENTE Excel (verde parpadeante) en p2 durante ventana WinHose."""
    client = _import_led_client()
    try:
        while time.monotonic() < until:
            try:
                await asyncio.to_thread(
                    client.set_estado_canal,
                    "p2",
                    "libre",
                )
                await asyncio.to_thread(
                    client.config_flash,
                    {"color": [0, 200, 0], "n_flashes": 2, "duracion_ms": 350},
                )
            except Exception as e:  # noqa: BLE001
                log.debug("Flash intermitente p2: %s", e)
            await asyncio.sleep(0.9)
    except asyncio.CancelledError:
        pass


def _start_winhose_window() -> None:
    """Excel: EN ESPERA DE APERTURA TRAS PULSACIÓN — p2 ext intermitente, resto verde."""
    global _winhose_window_until, _p2_intermittent, _intermittent_task
    _winhose_window_until = time.monotonic() + WINHOSE_WINDOW_SECONDS
    _p2_intermittent = True
    _apply_led_map(
        {
            "p1": "libre",
            "p2": "libre",
            "p3": "libre",
            "p4": "libre",
        }
    )
    _record(
        "zaguan_winhose_window",
        f"Ventana WinHose P2 ({WINHOSE_WINDOW_SECONDS}s)",
        {"until_s": WINHOSE_WINDOW_SECONDS, "in": WINHOSE_IN_P2},
    )
    log.info("WinHose P2: ventana %ss — p2 intermitente", WINHOSE_WINDOW_SECONDS)
    try:
        loop = asyncio.get_running_loop()
        _intermittent_task = loop.create_task(
            _p2_intermittent_loop(_winhose_window_until)
        )
    except RuntimeError:
        pass


def poll_winhose() -> None:
    """
    Detecta maniobra WinHose en P2 vía IN_03_03 (inductivo llave echada).
    Secuencia por defecto: entrada en «armado/cierre» y luego «desarmado/apertura» → 15 s.
    Ajustable con WINHOSE_ARMED_IS_ACTIVE_HIGH en código si en banco es al revés.
    """
    global _winhose_last_armed, _winhose_saw_armed, _winhose_window_until

    if not ORCHESTRATOR_ENABLED or _current_mode != "horario_autoservicio":
        return

    try:
        raw = _read_input(WINHOSE_IN_P2)
    except Exception as e:  # noqa: BLE001
        log.debug("WinHose lectura %s: %s", WINHOSE_IN_P2, e)
        return

    armed = _input_means_armed(raw)

    if _winhose_last_armed is None:
        _winhose_last_armed = armed
        return

    if armed and not _winhose_last_armed:
        _winhose_saw_armed = True
        log.debug("WinHose: flanco armado/cierre (%s=%s)", WINHOSE_IN_P2, raw)

    if not armed and _winhose_last_armed and _winhose_saw_armed:
        _winhose_saw_armed = False
        _start_winhose_window()
        log.info("WinHose: maniobra completa — ventana apertura P2 exterior")

    _winhose_last_armed = armed

    if _winhose_window_until > 0 and not _winhose_window_active():
        _winhose_window_until = 0.0
        _autoservicio_reposo()
        _record("zaguan_winhose_expired", "Ventana WinHose P2 expirada", {})


def _zaguan_occupied() -> bool:
    for code in OCCUPANCY_INPUT_CODES:
        try:
            if _read_input(code):
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


def _door_is_open(door: PuertaId) -> bool:
    code = DOOR_OPEN_SENSOR[door]
    try:
        return _read_input(code)
    except Exception:  # noqa: BLE001
        return False


def _p2_blocks_p1_autoservicio() -> bool:
    return bool(
        _door_interlock_active.get("p2")
        or _pending_abriendo.get("p2")
        or _door_is_open("p2")
    )


def _p1_blocks_p2_autoservicio() -> bool:
    return bool(
        _door_interlock_active.get("p1")
        or _pending_abriendo.get("p1")
        or _door_is_open("p1")
    )


def _can_open_p1_autoservicio() -> tuple[bool, str]:
    if _zaguan_occupied():
        return False, "Autoservicio: zaguán ocupado"
    if _p2_blocks_p1_autoservicio():
        return False, "Autoservicio: P2 debe estar totalmente cerrada"
    return True, ""


def _can_open_p2_autoservicio(pulsador: PulsadorId) -> tuple[bool, str]:
    if _p1_blocks_p2_autoservicio():
        return False, "Autoservicio: P1 debe estar totalmente cerrada"
    if pulsador == "p2":
        if not _winhose_window_active():
            return False, "Autoservicio: P2 exterior solo tras maniobra WinHose (15 s)"
    return True, ""


def _opposite_door_blocks(door: PuertaId) -> bool:
    other = OPPOSITE_DOOR[door]
    return bool(_pending_abriendo.get(other) or _door_is_open(other))


def _can_open_in_interlock(door: PuertaId) -> tuple[bool, str]:
    if _opposite_door_blocks(door):
        other = OPPOSITE_DOOR[door]
        return False, f"Puerta {other} debe estar totalmente cerrada"
    return True, ""


def _can_open_in_esclusa(door: PuertaId) -> tuple[bool, str]:
    ok, reason = _can_open_in_interlock(door)
    if not ok:
        return False, f"Esclusa: {reason}"
    return True, ""


def _can_open_p1_extendido() -> tuple[bool, str]:
    if _zaguan_occupied():
        return False, "Extendido: zaguán ocupado"
    ok, reason = _can_open_in_interlock("p1")
    if not ok:
        return False, f"Extendido: {reason}"
    return True, ""


def _esclusa_active_door() -> Optional[PuertaId]:
    """Puerta con maniobra en curso o físicamente abierta (IN_xx_04)."""
    if _pending_abriendo.get("p1") or _door_is_open("p1"):
        return "p1"
    if _pending_abriendo.get("p2") or _door_is_open("p2"):
        return "p2"
    return None


def _apply_esclusa_led_for_door(door: PuertaId) -> None:
    other = OPPOSITE_DOOR[door]
    states: dict[PulsadorId, EstadoLed] = {}
    for ch in DOOR_TO_LED_CHANNELS[door]:
        states[ch] = "abriendo"
    for ch in DOOR_TO_LED_CHANNELS[other]:
        states[ch] = "ocupado"
    _apply_led_map(states)


def _sync_interlock_leds() -> None:
    """Esclusa/extendido: reposo (4× libre) solo cuando ambas puertas están cerradas."""
    if _current_mode not in INTERLOCK_MODES:
        return
    if _current_mode == "horario_extendido" and _extendido_p2_call_pending:
        return
    active = _esclusa_active_door()
    if active is None:
        initial = INITIAL_LED_BY_MODE.get(_current_mode)
        if initial:
            _apply_led_map(dict(initial))
    else:
        _apply_esclusa_led_for_door(active)


def _sync_esclusa_leds() -> None:
    _sync_interlock_leds()


def _sync_autoservicio_interlock_leds() -> None:
    """
    Mantiene el par P1 en ocupado mientras P2 abre o está abierta (y viceversa).
    No pisa el estado «usuario en zaguán» tras cerrar P1 si P2 no interviene.
    """
    if _p1_user_in_zaguan and not _p2_blocks_p1_autoservicio():
        return
    if _p2_blocks_p1_autoservicio():
        _apply_led_map(
            {
                "p1": "ocupado",
                "p3": "ocupado",
                "p2": "abriendo",
                "p4": "abriendo",
            }
        )
    elif _p1_blocks_p2_autoservicio():
        _apply_led_map(
            {
                "p1": "abriendo",
                "p3": "abriendo",
                "p2": "ocupado",
                "p4": "ocupado",
            }
        )


def on_mode_changed(mode: Optional[str]) -> None:
    if not ORCHESTRATOR_ENABLED:
        return
    global _current_mode, _p1_user_in_zaguan
    _current_mode = mode
    _p1_user_in_zaguan = False
    _pending_abriendo["p1"] = False
    _pending_abriendo["p2"] = False
    _abriendo_since["p1"] = 0.0
    _abriendo_since["p2"] = 0.0
    _door_interlock_active["p1"] = False
    _door_interlock_active["p2"] = False
    _saw_open_while_interlock["p1"] = False
    _saw_open_while_interlock["p2"] = False
    _door_closed_streak["p1"] = 0
    _door_closed_streak["p2"] = 0
    _reset_winhose_state()
    _reset_extendido_state()

    if mode not in SUPPORTED_MODES:
        log.info("Modo %s sin orquestación LED zaguán", mode)
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
    if not ORCHESTRATOR_ENABLED or not result.get("executed"):
        return
    if _current_mode not in SUPPORTED_MODES:
        return
    if not any(rule_key.startswith(p) for p in DOOR_OPEN_RULE_PREFIXES):
        return

    door = _rule_opens_door(rule_key)
    if not door:
        return

    if _current_mode == "horario_autoservicio":
        if door == "p2":
            return
        ok, _ = _can_open_p1_autoservicio()
        if not ok:
            return
    elif _current_mode == "horario_esclusa":
        ok, _ = _can_open_in_esclusa(door)
        if not ok:
            return
    elif _current_mode == "horario_extendido":
        if door == "p1" and _zaguan_occupied():
            return
        ok, _ = _can_open_in_interlock(door)
        if not ok:
            return
        if door == "p2":
            _clear_extendido_p2_call()

    _set_door_abriendo(door, source=f"rule:{rule_key}")


def _set_door_abriendo(door: PuertaId, *, source: str) -> None:
    global _winhose_window_until

    _pending_abriendo[door] = True
    _abriendo_since[door] = time.monotonic()
    if _current_mode == "horario_autoservicio":
        _door_interlock_active[door] = True
        if door == "p1":
            _apply_led_map(
                {
                    "p1": "abriendo",
                    "p3": "abriendo",
                    "p2": "ocupado",
                    "p4": "ocupado",
                }
            )
        else:
            _stop_p2_intermittent()
            _winhose_window_until = 0.0
            _apply_led_map(
                {
                    "p1": "ocupado",
                    "p3": "ocupado",
                    "p2": "abriendo",
                    "p4": "abriendo",
                }
            )
    elif _current_mode in INTERLOCK_MODES:
        if door == "p2" and _current_mode == "horario_extendido":
            _clear_extendido_p2_call()
        _apply_esclusa_led_for_door(door)
    else:
        _apply_led_channels(DOOR_TO_LED_CHANNELS[door], "abriendo")

    _record(
        "zaguan_led_abriendo",
        f"Puerta {door} abriendo ({source})",
        {"door": door, "source": source, "leds": dict(_led_states)},
    )


def _autoservicio_post_close_p1() -> None:
    if _p1_user_in_zaguan:
        _apply_led_map(
            {
                "p1": "ocupado",
                "p2": "ocupado",
                "p3": "libre",
                "p4": "libre",
            }
        )
    else:
        _autoservicio_reposo()


def _automatico_post_close(door: PuertaId) -> None:
    if door == "p1":
        _apply_led_channels(DOOR_TO_LED_CHANNELS["p1"], "libre")
    else:
        _apply_led_map(INITIAL_LED_BY_MODE["horario_automatico"])


def _try_autoservicio_close_confirm(
    door: PuertaId, *, is_open: bool, was_open: bool, age_s: float
) -> None:
    """Confirma cierre P1/P2 en autoservicio (sensor vio abierta o fallback sin apertura)."""
    if is_open:
        _saw_open_while_interlock[door] = True
        _door_closed_streak[door] = 0
        return

    if (
        was_open
        and _saw_open_while_interlock.get(door)
        and age_s >= DOOR_AUTOSERVICIO_MIN_MANEUVER_S
    ):
        _on_door_closed(door, source="sensor_edge")
        return

    _door_closed_streak[door] += 1
    if age_s < DOOR_AUTOSERVICIO_MIN_MANEUVER_S:
        return
    if _door_closed_streak[door] < DOOR_AUTOSERVICIO_CLOSE_DEBOUNCE_POLLS:
        return

    if _saw_open_while_interlock.get(door):
        _on_door_closed(door, source="sensor_confirmed")
    elif age_s >= DOOR_AUTOSERVICIO_FALLBACK_CLOSE_S:
        _on_door_closed(door, source="fallback_closed")


def _release_autoservicio_door(door: PuertaId) -> None:
    _door_interlock_active[door] = False
    _pending_abriendo[door] = False
    _abriendo_since[door] = 0.0
    _saw_open_while_interlock[door] = False
    _door_closed_streak[door] = 0


def _on_door_closed(door: PuertaId, *, source: str = "sensor") -> None:
    if _current_mode == "horario_autoservicio":
        if not (
            _door_interlock_active.get(door)
            or _pending_abriendo.get(door)
        ):
            return
        _release_autoservicio_door(door)
        if door == "p1":
            _autoservicio_post_close_p1()
        elif _p2_blocks_p1_autoservicio():
            _sync_autoservicio_interlock_leds()
        else:
            _autoservicio_reposo()
        _record(
            "zaguan_door_closed",
            f"Puerta {door} cerrada — LED actualizado ({source})",
            {"door": door, "mode": _current_mode, "source": source, "leds": dict(_led_states)},
        )
        log.info("Puerta %s → LED reposo (%s)", door, source)
        return

    if not _pending_abriendo.get(door):
        return
    _pending_abriendo[door] = False
    _abriendo_since[door] = 0.0

    if _current_mode == "horario_automatico":
        _automatico_post_close(door)
    elif _current_mode in INTERLOCK_MODES:
        _sync_interlock_leds()
    _record(
        "zaguan_door_closed",
        f"Puerta {door} cerrada — LED actualizado ({source})",
        {"door": door, "mode": _current_mode, "source": source, "leds": dict(_led_states)},
    )
    log.info("Puerta %s → LED reposo (%s)", door, source)


def poll_door_sensors() -> None:
    if not ORCHESTRATOR_ENABLED or _current_mode not in SUPPORTED_MODES:
        return

    if _current_mode == "horario_autoservicio":
        poll_winhose()

    now = time.monotonic()
    panel = _import_panel()
    for door, in_code in DOOR_OPEN_SENSOR.items():
        try:
            is_open = panel.api_v1_read_input_by_code(in_code)
        except Exception as e:  # noqa: BLE001
            log.debug("Lectura sensor puerta %s: %s", door, e)
            continue
        was_open = _door_was_open[door]
        age_s = now - _abriendo_since[door] if _abriendo_since[door] > 0 else 0.0

        if _current_mode == "horario_autoservicio" and _door_interlock_active.get(door):
            _try_autoservicio_close_confirm(
                door, is_open=is_open, was_open=was_open, age_s=age_s
            )
            if (
                _door_interlock_active.get(door)
                and not is_open
                and age_s >= DOOR_AUTOSERVICIO_INTERLOCK_MAX_S
            ):
                _on_door_closed(door, source="interlock_timeout")
        elif was_open and not is_open:
            _on_door_closed(door, source="sensor_edge")
        elif (
            _current_mode != "horario_autoservicio"
            and _pending_abriendo.get(door)
            and not is_open
            and age_s >= DOOR_LED_REPOSO_AFTER_S
        ):
            # Fallback automático/esclusa: inductivo no marcó apertura; puerta ya cerrada.
            _on_door_closed(door, source="post_pulse")
        _door_was_open[door] = is_open

    if _current_mode in INTERLOCK_MODES:
        _sync_interlock_leds()
    elif _current_mode == "horario_autoservicio":
        _sync_autoservicio_interlock_leds()


def _pulsador_allowed_in_mode(pulsador: PulsadorId) -> tuple[bool, str]:
    if _current_mode not in SUPPORTED_MODES:
        return False, f"Modo {_current_mode!r} sin orquestación zaguán"

    if _led_states.get(pulsador) == "ocupado":
        return False, f"Pulsador {pulsador} bloqueado (LED ocupado)"

    if _current_mode == "horario_autoservicio":
        if pulsador in ("p1", "p3"):
            return _can_open_p1_autoservicio()
        if pulsador in ("p2", "p4"):
            return _can_open_p2_autoservicio(pulsador)

    if _current_mode == "horario_esclusa":
        door = PULSADOR_TO_DOOR[pulsador]
        return _can_open_in_esclusa(door)

    if _current_mode == "horario_extendido":
        if pulsador == "p1":
            return _can_open_p1_extendido()
        if pulsador == "p3":
            ok, reason = _can_open_in_interlock("p1")
            return (ok, f"Extendido: {reason}" if reason else "")
        if pulsador == "p2":
            ok, reason = _can_open_in_interlock("p2")
            return (ok, f"Extendido: {reason}" if reason else "")
        if pulsador == "p4":
            ok, reason = _can_open_in_interlock("p2")
            return (ok, f"Extendido: {reason}" if reason else "")

    return True, ""


async def handle_pulsacion(pulsador: PulsadorId, ts: int) -> dict[str, Any]:
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

    if pulsador == "p2" and _current_mode == "horario_autoservicio":
        _stop_p2_intermittent()
        global _winhose_window_until
        _winhose_window_until = 0.0

    if _current_mode == "horario_extendido" and pulsador == "p2":
        _start_extendido_p2_call()
        return {
            "ok": True,
            "pulsador": pulsador,
            "door": door,
            "mode": _current_mode,
            "extendido_call": True,
            "modbus_ok": False,
        }

    if _current_mode == "horario_extendido" and pulsador == "p4":
        _clear_extendido_p2_call()

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
    await asyncio.sleep(seconds)
    panel = _import_panel()
    out_code = "OUT_02_07" if door == "p1" else "OUT_03_07"
    try:
        await asyncio.to_thread(panel.api_v1_set_output_by_code, out_code, False)
    except Exception as e:  # noqa: BLE001
        log.warning("No se pudo apagar %s tras pulso %s: %s", out_code, rule_key, e)


def bootstrap_from_panel() -> None:
    if not ORCHESTRATOR_ENABLED:
        return
    try:
        mode = _import_panel().api_v1_get_current_mode()
    except Exception as e:  # noqa: BLE001
        log.warning("Bootstrap zaguán: %s", e)
        return
    if mode in SUPPORTED_MODES:
        on_mode_changed(mode)
    for door in ("p1", "p2"):
        try:
            is_open = _import_panel().api_v1_read_input_by_code(DOOR_OPEN_SENSOR[door])
            _door_was_open[door] = is_open
        except Exception:  # noqa: BLE001
            pass
    if _current_mode in INTERLOCK_MODES:
        _sync_interlock_leds()
    elif _current_mode == "horario_autoservicio":
        _sync_autoservicio_interlock_leds()
        try:
            raw = _read_input(WINHOSE_IN_P2)
            global _winhose_last_armed
            _winhose_last_armed = _input_means_armed(raw)
        except Exception:  # noqa: BLE001
            pass
