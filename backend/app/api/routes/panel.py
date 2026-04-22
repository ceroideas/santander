"""API compatible con panel ETD8A12 (software prueba_)."""
from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from app.db import panel_modules_store as pms
from app.db import system_events_store as ses
from app.db.session import get_connection
from app.core.config import settings
from pydantic import BaseModel
from pymodbus.client import ModbusSerialClient, ModbusTcpClient
from pymodbus.exceptions import ModbusException

router = APIRouter(prefix="/panel")

# Constantes ETD8A12
CMD_OPEN = 0x0100
CMD_CLOSE = 0x0200
CMD_OPEN_ALL = 0x0700
CMD_CLOSE_ALL = 0x0800
REG_OUTPUT_START = 0x0000
REG_OUTPUT_BITS = 0x0070
REG_INPUT_START = 0x0080
REG_IN_OUT_RELATION = 0x00FA
MODBUS_TIMEOUT = 8
DISABLE_IN_OUT_RELATION_ON_CONNECT = False

pms.ensure_panel_modules_schema()
pms.seed_default_modules_if_empty()

clients: Dict[int, Optional[Any]] = {}
io_state: Dict[int, dict] = {}
input_overrides: Dict[int, List[Optional[bool]]] = {}
serial_client: Optional[ModbusSerialClient] = None
modbus_io_lock = threading.RLock()


def _module_ids() -> List[int]:
    return pms.list_module_ids_ordered()


def _board_cfg(board_id: int) -> dict:
    cfg = pms.get_boards_config_map().get(board_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Módulo {board_id} no existe")
    return cfg


def _board_exists(board_id: int) -> bool:
    return board_id in pms.get_boards_config_map()


def _modbus_mode() -> str:
    mode = (settings.modbus_mode or "tcp").strip().lower()
    return mode if mode in {"tcp", "rtu"} else "tcp"


def _is_rtu_mode() -> bool:
    return _modbus_mode() == "rtu"


def _client_is_open(client: Any) -> bool:
    if client is None:
        return False
    if hasattr(client, "is_socket_open"):
        try:
            return bool(client.is_socket_open())
        except Exception:
            return False
    if hasattr(client, "connected"):
        return bool(getattr(client, "connected"))
    return True


def _sync_runtime_from_db() -> None:
    """Alinea clientes en memoria, tamaños de I/O y overrides con la configuración en SQLite."""
    global clients, io_state, input_overrides
    mids = _module_ids()
    for old in list(clients.keys()):
        if old not in mids:
            c = clients.pop(old, None)
            if c:
                try:
                    c.close()
                except Exception:
                    pass
    for old in list(io_state.keys()):
        if old not in mids:
            io_state.pop(old, None)
    for old in list(input_overrides.keys()):
        if old not in mids:
            input_overrides.pop(old, None)
    for mid in mids:
        if mid not in clients:
            clients[mid] = None
        ins, outs = pms.get_channels_for_module(mid)
        n_in, n_out = len(ins), len(outs)
        prev = io_state.get(mid, {})
        prev_in_raw: List[bool] = list(prev.get("inputs_raw") or [])
        prev_out: List[bool] = list(prev.get("outputs") or [])
        prev_eff: List[bool] = list(prev.get("inputs") or [])
        io_state[mid] = {
            "connected": prev.get("connected", False),
            "inputs_raw": [prev_in_raw[i] if i < len(prev_in_raw) else False for i in range(n_in)],
            "outputs": [prev_out[i] if i < len(prev_out) else False for i in range(n_out)],
            "inputs": [prev_eff[i] if i < len(prev_eff) else False for i in range(n_in)],
            "last_update": prev.get("last_update"),
            "error": prev.get("error"),
        }
        o_prev = input_overrides.get(mid, [])
        input_overrides[mid] = [
            (o_prev[i] if i < len(o_prev) and o_prev[i] in (None, True, False) else None) for i in range(n_in)
        ]
mode_latches: Dict[str, bool] = {}
current_mode: Optional[str] = None
DEFAULT_RULES_CONFIG: Dict[str, dict] = {}
BACKEND_DIR = Path(__file__).resolve().parents[3]
RULES_FILE = BACKEND_DIR / "data" / "panel_rules.json"


def _load_rules_from_disk() -> Dict[str, dict]:
    try:
        if RULES_FILE.exists():
            raw = json.loads(RULES_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return raw
    except Exception:  # noqa: BLE001
        # Si falla lectura, se continúa sin reglas.
        pass
    return DEFAULT_RULES_CONFIG.copy()


def _save_rules_to_disk(rules: Dict[str, dict]) -> None:
    RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
    RULES_FILE.write_text(json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")


rules_config: Dict[str, dict] = _load_rules_from_disk()
rules_runtime: Dict[str, dict] = {}


def _sync_mode_latches_from_rules(rules: Dict[str, dict]) -> None:
    """Asegura entradas en mode_latches para cada código IN referenciado en las reglas."""
    for _rk, rule in rules.items():
        tc = rule.get("trigger")
        if isinstance(tc, str) and tc.startswith("IN_"):
            mode_latches.setdefault(tc, False)
        for code in rule.get("blocked_if_active") or []:
            if isinstance(code, str) and code.startswith("IN_"):
                mode_latches.setdefault(code, False)
        for code in rule.get("deactivate_modes") or []:
            if isinstance(code, str) and code.startswith("IN_"):
                mode_latches.setdefault(code, False)


def _sync_rules_runtime(rules: Dict[str, dict]) -> None:
    global rules_runtime
    for k in list(rules_runtime.keys()):
        if k not in rules:
            rules_runtime.pop(k, None)
    for k in rules.keys():
        if k not in rules_runtime:
            rules_runtime[k] = {"last_trigger_active": False, "last_executed_at": None}


_sync_mode_latches_from_rules(rules_config)
_sync_rules_runtime(rules_config)

PANEL_STATE_OVERRIDES_KEY = "panel_input_overrides"
PANEL_STATE_CURRENT_MODE_KEY = "panel_current_mode"


def _ensure_panel_state_table() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS panel_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _save_panel_state_value(key: str, value: str) -> None:
    _ensure_panel_state_table()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO panel_state (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (key, value, datetime.now().isoformat()),
        )
        conn.commit()


def _load_panel_state_value(key: str) -> Optional[str]:
    _ensure_panel_state_table()
    with get_connection() as conn:
        row = conn.execute("SELECT value FROM panel_state WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None


def _persist_overrides_to_db() -> None:
    data = {str(mid): input_overrides[mid] for mid in _module_ids() if mid in input_overrides}
    _save_panel_state_value(PANEL_STATE_OVERRIDES_KEY, json.dumps(data))


def _persist_current_mode_to_db() -> None:
    _save_panel_state_value(PANEL_STATE_CURRENT_MODE_KEY, json.dumps({"current_mode": current_mode}))


def _load_persisted_panel_state() -> None:
    global current_mode
    _sync_runtime_from_db()
    raw_overrides = _load_panel_state_value(PANEL_STATE_OVERRIDES_KEY)
    if raw_overrides:
        try:
            data = json.loads(raw_overrides)
            if isinstance(data, dict):
                for board_key, values in data.items():
                    board_id = int(board_key)
                    if board_id in input_overrides and isinstance(values, list):
                        n = len(input_overrides[board_id])
                        merged = [v if v in (None, True, False) else None for v in values[:n]]
                        while len(merged) < n:
                            merged.append(None)
                        input_overrides[board_id] = merged
        except Exception:  # noqa: BLE001
            pass

    raw_mode = _load_panel_state_value(PANEL_STATE_CURRENT_MODE_KEY)
    if raw_mode:
        try:
            mode_obj = json.loads(raw_mode)
            mode_value = mode_obj.get("current_mode")
            if isinstance(mode_value, str) or mode_value is None:
                current_mode = mode_value
        except Exception:  # noqa: BLE001
            pass


_load_persisted_panel_state()


def add_event(level: str, message: str, board_id: int = 0) -> None:
    """Registra evento en SQLite (actor desde contexto panel/tablet o system)."""
    try:
        ses.record_event(level, message, board_id=board_id)
    except Exception:  # noqa: BLE001
        # No bloquear operación crítica si falla el log
        pass


def get_client(board_id: int) -> Any:
    _board_cfg(board_id)
    client = clients.get(board_id)
    if not _client_is_open(client):
        raise HTTPException(status_code=503, detail=f"Módulo {board_id} no conectado")
    return client


def _probe_register_address(board_id: int) -> int:
    ins, outs = pms.get_channels_for_module(board_id)
    if ins:
        return int(ins[0]["address"])
    if outs:
        return int(outs[0]["address"])
    return REG_INPUT_START


def _connect_board(board_id: int) -> bool:
    global serial_client
    cfg = dict(_board_cfg(board_id))
    try:
        if _is_rtu_mode():
            with modbus_io_lock:
                if serial_client is None:
                    serial_client = ModbusSerialClient(
                        port=settings.modbus_serial_port,
                        baudrate=settings.modbus_serial_baudrate,
                        bytesize=settings.modbus_serial_bytesize,
                        parity=settings.modbus_serial_parity,
                        stopbits=settings.modbus_serial_stopbits,
                        timeout=MODBUS_TIMEOUT,
                    )
                if not _client_is_open(serial_client):
                    ok = serial_client.connect()
                    if not ok:
                        io_state[board_id]["connected"] = False
                        io_state[board_id]["error"] = (
                            f"No se pudo abrir puerto serial {settings.modbus_serial_port}"
                        )
                        add_event(
                            "ERR",
                            f"RTU no conectado en {settings.modbus_serial_port}",
                            board_id,
                        )
                        return False

                candidates = [cfg["slave_id"]]
                for candidate in (1, 2, 3, 255):
                    if candidate not in candidates:
                        candidates.append(candidate)

                last_probe_error: Optional[str] = None
                for candidate_slave in candidates:
                    try:
                        probe_addr = _probe_register_address(board_id)
                        probe = serial_client.read_holding_registers(
                            address=probe_addr,
                            count=1,
                            device_id=candidate_slave,
                        )
                        if probe.isError():
                            raise RuntimeError(f"Probe Modbus error: {probe}")
                        if cfg["slave_id"] != candidate_slave:
                            pms.update_module(board_id, slave_id=candidate_slave)
                            add_event("INFO", f"slave_id autodetectado: {candidate_slave}", board_id)
                        clients[board_id] = serial_client
                        io_state[board_id]["connected"] = True
                        io_state[board_id]["error"] = None
                        add_event(
                            "OK",
                            f"RTU conectado en {settings.modbus_serial_port} (slave_id={candidate_slave})",
                            board_id,
                        )
                        break
                    except Exception as probe_err:  # noqa: BLE001
                        last_probe_error = str(probe_err)
                else:
                    io_state[board_id]["connected"] = False
                    io_state[board_id]["error"] = f"RTU no operativo: {last_probe_error}"
                    add_event(
                        "ERR",
                        f"Conexión RTU inválida tras probar slave_id {candidates}: {last_probe_error}",
                        board_id,
                    )
                    return False
        else:
            if clients[board_id]:
                try:
                    clients[board_id].close()
                except Exception:
                    pass
            candidates = [cfg["slave_id"]]
            for candidate in (1, 255):
                if candidate not in candidates:
                    candidates.append(candidate)

            last_probe_error: Optional[str] = None
            for candidate_slave in candidates:
                client = ModbusTcpClient(host=cfg["host"], port=cfg["port"], timeout=MODBUS_TIMEOUT)
                ok = client.connect()
                if not ok:
                    last_probe_error = "No se pudo establecer conexión TCP"
                    try:
                        client.close()
                    except Exception:
                        pass
                    continue

                clients[board_id] = client
                io_state[board_id]["connected"] = True
                io_state[board_id]["error"] = None
                add_event("OK", f"TCP conectado a {cfg['host']}:{cfg['port']} (probando slave_id={candidate_slave})", board_id)

                # Validación mínima Modbus
                try:
                    probe_addr = _probe_register_address(board_id)
                    probe = client.read_holding_registers(address=probe_addr, count=1, device_id=candidate_slave)
                    if probe.isError():
                        raise RuntimeError(f"Probe Modbus error: {probe}")
                    if cfg["slave_id"] != candidate_slave:
                        pms.update_module(board_id, slave_id=candidate_slave)
                        add_event("INFO", f"slave_id autodetectado: {candidate_slave}", board_id)
                        cfg = dict(_board_cfg(board_id))
                    break
                except Exception as probe_err:  # noqa: BLE001
                    last_probe_error = str(probe_err)
                    io_state[board_id]["connected"] = False
                    io_state[board_id]["error"] = f"TCP ok pero Modbus no operativo: {probe_err}"
                    try:
                        client.close()
                    except Exception:
                        pass
                    clients[board_id] = None
                    continue
            else:
                io_state[board_id]["connected"] = False
                io_state[board_id]["error"] = f"TCP ok pero Modbus no operativo: {last_probe_error}"
                add_event("ERR", f"Conexión inválida tras probar slave_id {candidates}: {last_probe_error}", board_id)
                return False

        # Algunos ETD8A12 cierran socket si se escribe 0x00FA al conectar.
        # Se deja desactivado por defecto para priorizar estabilidad de enlace.
        if DISABLE_IN_OUT_RELATION_ON_CONNECT:
            try:
                rel = cfg.get("relation_register")
                if rel is not None:
                    c = clients.get(board_id)
                    if c is not None:
                        c.write_register(address=int(rel), value=0x0000, device_id=cfg["slave_id"])
            except Exception:
                pass
        return True
    except Exception as e:  # noqa: BLE001
        io_state[board_id]["connected"] = False
        io_state[board_id]["error"] = str(e)
        add_event("ERR", f"Excepción al conectar: {e}", board_id)
        return False


def _read_all_io(board_id: int, retried: bool = False) -> None:
    client = clients.get(board_id)
    if not _client_is_open(client):
        if board_id in io_state:
            io_state[board_id]["connected"] = False
        return

    cfg = _board_cfg(board_id)
    slave = cfg["slave_id"]
    ins, outs = pms.get_channels_for_module(board_id)
    try:
        with modbus_io_lock:
            for i, ch in enumerate(outs):
                res = client.read_holding_registers(address=int(ch["address"]), count=1, device_id=slave)
                if not res.isError() and res.registers:
                    io_state[board_id]["outputs"][i] = bool(res.registers[0])

            for i, ch in enumerate(ins):
                res = client.read_holding_registers(address=int(ch["address"]), count=1, device_id=slave)
                if not res.isError() and res.registers:
                    io_state[board_id]["inputs_raw"][i] = bool(res.registers[0])

        effective_inputs: List[bool] = []
        for idx in range(len(ins)):
            forced = input_overrides[board_id][idx]
            raw = io_state[board_id]["inputs_raw"][idx]
            effective_inputs.append(raw if forced is None else forced)
        io_state[board_id]["inputs"] = effective_inputs

        io_state[board_id]["connected"] = True
        io_state[board_id]["last_update"] = datetime.now().isoformat()
        io_state[board_id]["error"] = None
    except Exception as e:  # noqa: BLE001
        # Reintento único tras reconexión cuando el equipo resetea socket (WinError 10054).
        if not retried:
            _connect_board(board_id)
            if io_state[board_id]["connected"]:
                return _read_all_io(board_id, retried=True)
        io_state[board_id]["connected"] = False
        io_state[board_id]["error"] = str(e)


def _write_output(board_id: int, channel: int, state: bool) -> None:
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    _, outs = pms.get_channels_for_module(board_id)
    if not 1 <= channel <= len(outs):
        raise HTTPException(status_code=400, detail=f"Canal OUT {channel} inválido para módulo {board_id}")
    ch = outs[channel - 1]
    register = int(ch["address"])
    open_v = int(ch["open_cmd"]) if ch["open_cmd"] is not None else CMD_OPEN
    close_v = int(ch["close_cmd"]) if ch["close_cmd"] is not None else CMD_CLOSE
    value = open_v if state else close_v
    with modbus_io_lock:
        result = client.write_register(address=register, value=value, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=f"Error Modbus escribiendo OUT{channel} en módulo {board_id}: {result}")
    io_state[board_id]["outputs"][channel - 1] = state


def _parse_in_code(code: str) -> tuple[int, int]:
    # Formato recomendado: IN_YY_ZZ (sin XX)
    parts = code.split("_")
    if len(parts) == 3 and parts[0] == "IN":
        return int(parts[1]), int(parts[2])
    # Compatibilidad legado: DI_01_YY_ZZ
    if len(parts) == 4 and parts[0] == "DI":
        return int(parts[2]), int(parts[3])
    raise HTTPException(status_code=400, detail=f"Código de entrada inválido: {code}")


def _parse_out_code(code: str) -> tuple[int, int]:
    parts = code.split("_")
    # Nuevo formato recomendado: OUT_YY_ZZ (sin XX)
    if len(parts) == 3 and parts[0] == "OUT":
        return int(parts[1]), int(parts[2])
    # Compatibilidad legado: DO_01_YY_ZZ
    if len(parts) == 4 and parts[0] == "DO":
        return int(parts[2]), int(parts[3])
    raise HTTPException(status_code=400, detail=f"Código de salida inválido: {code}")


def _read_input_effective(code: str, use_hardware_if_no_override: bool = True) -> bool:
    board_id, channel = _parse_in_code(code)
    if not _board_exists(board_id):
        raise HTTPException(status_code=400, detail=f"Módulo inválido en {code}")
    ins, _ = pms.get_channels_for_module(board_id)
    if not 1 <= channel <= len(ins):
        raise HTTPException(status_code=400, detail=f"Canal inválido en {code}")
    forced = input_overrides[board_id][channel - 1]
    if forced is not None:
        return forced
    if not use_hardware_if_no_override:
        # En modo pruebas, si no hay override explícito, usar estado efectivo cacheado.
        return io_state[board_id]["inputs"][channel - 1]
    if not io_state[board_id]["connected"]:
        _connect_board(board_id)
    if not io_state[board_id]["connected"]:
        raise HTTPException(status_code=503, detail=f"No se pudo conectar placa {board_id} para leer {code}")
    _read_all_io(board_id)
    return io_state[board_id]["inputs"][channel - 1]


def _evaluate_trigger_rule(
    rule_key: str,
    manual: bool = False,
    use_hardware_if_no_override: bool = True,
    apply_outputs_to_hardware: bool = True,
) -> dict:
    global current_mode
    rule = rules_config.get(rule_key)
    if not rule:
        return {"executed": False, "reason": f"Regla no encontrada: {rule_key}"}
    if rule_key not in rules_runtime:
        rules_runtime[rule_key] = {"last_trigger_active": False, "last_executed_at": None}
    runtime = rules_runtime[rule_key]

    if not rule.get("enabled", True):
        return {"executed": False, "reason": "Regla deshabilitada"}

    trigger_code = rule.get("trigger", "IN_01_01")
    trigger_active = _read_input_effective(trigger_code, use_hardware_if_no_override=use_hardware_if_no_override)
    blocked_codes = rule.get("blocked_if_active", [])
    blocked_active_codes = [
        code
        for code in blocked_codes
        if _read_input_effective(code, use_hardware_if_no_override=use_hardware_if_no_override)
    ]

    if not manual:
        rising_edge = trigger_active and not runtime["last_trigger_active"]
        runtime["last_trigger_active"] = trigger_active
        if not rising_edge:
            return {"executed": False, "reason": "Sin flanco de subida en trigger", "trigger_input_active": trigger_active}
    elif not trigger_active:
        return {"executed": False, "reason": f"No se ejecuta: {trigger_code} no está activa", "trigger_input_active": False}

    if blocked_active_codes:
        add_event("WARN", f"{rule_key} bloqueado por {', '.join(blocked_active_codes)}", 1)
        return {
            "executed": False,
            "reason": f"Bloqueado por entradas activas: {', '.join(blocked_active_codes)}",
            "trigger_input_active": trigger_active,
        }

    mode_latches.setdefault(trigger_code, False)
    mode_latches[trigger_code] = True
    for code in rule.get("deactivate_modes", []):
        mode_latches.setdefault(code, False)
        mode_latches[code] = False
        board_id, channel = _parse_in_code(code)
        input_overrides[board_id][channel - 1] = False
    current_mode = rule_key
    _persist_overrides_to_db()
    _persist_current_mode_to_db()

    for do_code in rule.get("activate_outputs", []):
        board_id, channel = _parse_out_code(do_code)
        if apply_outputs_to_hardware:
            if not io_state[board_id]["connected"]:
                _connect_board(board_id)
            _write_output(board_id, channel, True)
        else:
            _, outs = pms.get_channels_for_module(board_id)
            if 1 <= channel <= len(outs):
                io_state[board_id]["outputs"][channel - 1] = True
                add_event("INFO", f"SIMULADO {do_code} -> ON (sin hardware)", board_id)
    for do_code in rule.get("deactivate_outputs", []):
        board_id, channel = _parse_out_code(do_code)
        if apply_outputs_to_hardware:
            if not io_state[board_id]["connected"]:
                _connect_board(board_id)
            _write_output(board_id, channel, False)
        else:
            _, outs = pms.get_channels_for_module(board_id)
            if 1 <= channel <= len(outs):
                io_state[board_id]["outputs"][channel - 1] = False
                add_event("INFO", f"SIMULADO {do_code} -> OFF (sin hardware)", board_id)

    runtime["last_executed_at"] = datetime.now().isoformat()
    add_event("OK", f"Regla ejecutada: {rule_key}", 1)
    return {
        "executed": True,
        "mode": current_mode,
        "trigger_input_active": trigger_active,
        "blocked_inputs": blocked_active_codes,
        "deactivated_modes": rule.get("deactivate_modes", []),
        "outputs_activated": rule.get("activate_outputs", []),
        "outputs_deactivated": rule.get("deactivate_outputs", []),
        "timestamp": runtime["last_executed_at"],
    }


def _evaluate_horario_automatico(
    manual: bool = False,
    use_hardware_if_no_override: bool = True,
    apply_outputs_to_hardware: bool = True,
) -> dict:
    """Compatibilidad: misma lógica que la regla `horario_automatico` si existe."""
    if "horario_automatico" not in rules_config:
        return {"executed": False, "reason": "No hay regla horario_automatico"}
    return _evaluate_trigger_rule(
        "horario_automatico",
        manual=manual,
        use_hardware_if_no_override=use_hardware_if_no_override,
        apply_outputs_to_hardware=apply_outputs_to_hardware,
    )


def _evaluate_auto_rules() -> None:
    for rk, rule in rules_config.items():
        if not rule.get("enabled", True):
            continue
        if not rule.get("auto_execute", True):
            continue
        if rule.get("type") != "enclavamiento":
            continue
        try:
            _evaluate_trigger_rule(rk, manual=False)
        except Exception as e:  # noqa: BLE001
            add_event("ERR", f"Error auto-evaluando {rk}: {e}", 1)


def _execute_rule_forced(rule_key: str, apply_outputs_to_hardware: bool = True) -> dict:
    """
    Ejecuta una regla JSON de forma forzada:
    - trigger por override=True
    - deactivate_modes por override=False
    - aplica salidas de activate_outputs/deactivate_outputs
    """
    global current_mode
    rule = rules_config.get(rule_key)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Regla no encontrada: {rule_key}")
    if not rule.get("enabled", True):
        return {"executed": False, "reason": "Regla deshabilitada", "rule": rule_key}

    trigger_code = rule.get("trigger")
    if trigger_code:
        b, ch = _parse_in_code(trigger_code)
        input_overrides[b][ch - 1] = True
        mode_latches[trigger_code] = True

    for in_code in rule.get("deactivate_modes", []):
        b, ch = _parse_in_code(in_code)
        input_overrides[b][ch - 1] = False
        mode_latches[in_code] = False

    for out_code in rule.get("activate_outputs", []):
        b, ch = _parse_out_code(out_code)
        if apply_outputs_to_hardware:
            if not io_state[b]["connected"]:
                _connect_board(b)
            if not io_state[b]["connected"]:
                raise HTTPException(status_code=503, detail=f"No se pudo conectar módulo {b} para {out_code}")
            _write_output(b, ch, True)
        else:
            _, outs = pms.get_channels_for_module(b)
            if 1 <= ch <= len(outs):
                io_state[b]["outputs"][ch - 1] = True

    for out_code in rule.get("deactivate_outputs", []):
        b, ch = _parse_out_code(out_code)
        if apply_outputs_to_hardware:
            if not io_state[b]["connected"]:
                _connect_board(b)
            if not io_state[b]["connected"]:
                raise HTTPException(status_code=503, detail=f"No se pudo conectar módulo {b} para {out_code}")
            _write_output(b, ch, False)
        else:
            _, outs = pms.get_channels_for_module(b)
            if 1 <= ch <= len(outs):
                io_state[b]["outputs"][ch - 1] = False

    current_mode = rule_key
    _persist_overrides_to_db()
    _persist_current_mode_to_db()
    if rule_key in rules_runtime:
        rules_runtime[rule_key]["last_executed_at"] = datetime.now().isoformat()
    add_event("OK", f"Regla forzada ejecutada: {rule_key}", 1)
    return {
        "executed": True,
        "rule": rule_key,
        "trigger": trigger_code,
        "deactivate_modes": rule.get("deactivate_modes", []),
        "outputs_activated": rule.get("activate_outputs", []),
        "outputs_deactivated": rule.get("deactivate_outputs", []),
        "mode": current_mode,
    }


class BoardConfig(BaseModel):
    host: str
    port: int = 5000
    slave_id: int = 1
    name: Optional[str] = None


class ChannelAction(BaseModel):
    channel: int
    state: bool


class BitmaskAction(BaseModel):
    channels_on: List[int]


class InputOverrideAction(BaseModel):
    board_id: int
    channel: int
    state: bool


class RulesUpdateBody(BaseModel):
    rules: Dict[str, dict]


class ModuleCreateBody(BaseModel):
    name: str
    host: str
    port: int = 5000
    slave_id: int = 1


class ModuleUpdateBody(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    slave_id: Optional[int] = None
    sort_order: Optional[int] = None
    bitmask_address: Optional[int] = None
    relation_register: Optional[int] = None


class ChannelCreateBody(BaseModel):
    kind: str
    address: int
    slot_index: Optional[int] = None
    label: Optional[str] = None
    open_cmd: Optional[int] = None
    close_cmd: Optional[int] = None


class ChannelPatchBody(BaseModel):
    slot_index: Optional[int] = None
    label: Optional[str] = None
    address: Optional[int] = None
    open_cmd: Optional[int] = None
    close_cmd: Optional[int] = None


class BulkCommandPair(BaseModel):
    address: int
    value: int


class BulkCommandsBody(BaseModel):
    all_on: Optional[BulkCommandPair] = None
    all_off: Optional[BulkCommandPair] = None


def _ensure_serial_client_connected() -> ModbusSerialClient:
    """Abre (o reutiliza) el cliente serial para diagnósticos RTU."""
    global serial_client
    if serial_client is None:
        serial_client = ModbusSerialClient(
            port=settings.modbus_serial_port,
            baudrate=settings.modbus_serial_baudrate,
            bytesize=settings.modbus_serial_bytesize,
            parity=settings.modbus_serial_parity,
            stopbits=settings.modbus_serial_stopbits,
            timeout=MODBUS_TIMEOUT,
        )
    if not _client_is_open(serial_client):
        ok = serial_client.connect()
        if not ok:
            raise RuntimeError(f"No se pudo abrir puerto serial {settings.modbus_serial_port}")
    return serial_client


@router.get("/")
def root():
    return {"service": "ETD8A12 Panel API", "status": "running", "timestamp": datetime.now().isoformat()}


@router.get("/status")
def get_status(run_auto_rules: bool = False):
    cfg_map = pms.get_boards_config_map()
    for board_id in _module_ids():
        if board_id in io_state and io_state[board_id]["connected"]:
            _read_all_io(board_id)
    if run_auto_rules:
        _evaluate_auto_rules()
    return {
        "boards": {
            str(bid): {
                "id": bid,
                "config": {
                    "name": cfg_map[bid]["name"],
                    "host": cfg_map[bid]["host"],
                    "port": cfg_map[bid]["port"],
                    "slave_id": cfg_map[bid]["slave_id"],
                    "modbus_mode": _modbus_mode(),
                    "serial_port": settings.modbus_serial_port if _is_rtu_mode() else None,
                },
                **io_state.get(bid, {}),
                "input_overrides": input_overrides.get(bid, []),
            }
            for bid in _module_ids()
            if bid in cfg_map
        },
        "modules_config": pms.get_full_config_for_api(),
        "current_mode": current_mode,
        "auto_rules_executed": run_auto_rules,
        "timestamp": datetime.now().isoformat(),
    }


@router.post("/boards/{board_id}/connect")
def connect_board(board_id: int):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    ok = _connect_board(board_id)
    if ok:
        _read_all_io(board_id)
    # "connected" refleja el estado real final (tras handshake/poll), no solo apertura TCP.
    return {"board_id": board_id, "connected": io_state[board_id]["connected"], "state": io_state[board_id]}


@router.get("/diagnostics/rtu-ping")
def rtu_ping(
    board_id: Optional[int] = None,
    slave_ids: str = "",
    retries: int = 1,
    timeout_s: float = 1.5,
):
    """
    Diagnóstico de bus RS-485 / Modbus RTU.
    - Si no se envía `slave_ids`, usa los slave_id configurados en BD.
    - Si se envía `board_id`, usa el registro de probe de ese módulo.
    - Si `MODBUS_MODE != rtu`, devuelve error 400.
    """
    if not _is_rtu_mode():
        raise HTTPException(
            status_code=400,
            detail=f"Diagnóstico RTU requiere MODBUS_MODE=rtu (actual: {_modbus_mode()})",
        )

    retries = max(1, min(retries, 5))
    timeout_s = max(0.2, min(timeout_s, 5.0))
    cfg_map = pms.get_boards_config_map()
    mids = _module_ids()
    if not mids:
        raise HTTPException(status_code=400, detail="No hay módulos configurados")

    # Si no indican módulo, se usa el primero para calcular dirección de probe.
    probe_board_id = board_id if board_id is not None else mids[0]
    if probe_board_id not in cfg_map:
        raise HTTPException(status_code=404, detail=f"Módulo {probe_board_id} no existe")
    probe_addr = _probe_register_address(probe_board_id)

    if slave_ids.strip():
        try:
            candidates = [int(x.strip()) for x in slave_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="slave_ids debe ser CSV numérico, ej: 1,2,3") from None
    else:
        candidates = []
        for mid in mids:
            sid = int(cfg_map[mid]["slave_id"])
            if sid not in candidates:
                candidates.append(sid)

    if not candidates:
        raise HTTPException(status_code=400, detail="No hay slave_ids para probar")

    report: List[Dict[str, Any]] = []
    # Cliente temporal para diagnóstico: evita quedarse bloqueado por el cliente compartido.
    client = ModbusSerialClient(
        port=settings.modbus_serial_port,
        baudrate=settings.modbus_serial_baudrate,
        bytesize=settings.modbus_serial_bytesize,
        parity=settings.modbus_serial_parity,
        stopbits=settings.modbus_serial_stopbits,
        timeout=timeout_s,
    )
    try:
        if not client.connect():
            raise HTTPException(
                status_code=503,
                detail=f"No se pudo abrir puerto serial {settings.modbus_serial_port}",
            )

        for sid in candidates:
            ok = False
            last_error: Optional[str] = None
            for _ in range(retries):
                try:
                    resp = client.read_holding_registers(address=probe_addr, count=1, device_id=sid)
                    if resp.isError():
                        last_error = str(resp)
                        continue
                    ok = True
                    last_error = None
                    break
                except Exception as e:  # noqa: BLE001
                    last_error = str(e)

            report.append(
                {
                    "slave_id": sid,
                    "ok": ok,
                    "probe_address": probe_addr,
                    "error": last_error,
                }
            )
    finally:
        try:
            client.close()
        except Exception:
            pass

    return {
        "modbus_mode": _modbus_mode(),
        "serial": {
            "port": settings.modbus_serial_port,
            "baudrate": settings.modbus_serial_baudrate,
            "bytesize": settings.modbus_serial_bytesize,
            "parity": settings.modbus_serial_parity,
            "stopbits": settings.modbus_serial_stopbits,
            "timeout": timeout_s,
        },
        "probe_board_id": probe_board_id,
        "probe_address": probe_addr,
        "retries": retries,
        "results": report,
    }


@router.post("/boards/{board_id}/disconnect")
def disconnect_board(board_id: int):
    global serial_client
    if not _board_exists(board_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    if _is_rtu_mode():
        with modbus_io_lock:
            if serial_client:
                try:
                    serial_client.close()
                except Exception:
                    pass
            serial_client = None
            for mid in _module_ids():
                clients[mid] = None
                if mid in io_state:
                    io_state[mid]["connected"] = False
        add_event("WARN", "RTU desconectado manualmente (bus completo)", board_id)
    else:
        client = clients.get(board_id)
        if client:
            client.close()
            clients[board_id] = None
        io_state[board_id]["connected"] = False
        add_event("WARN", "Desconectado manualmente", board_id)
    return {"board_id": board_id, "connected": False}


@router.put("/boards/{board_id}/config")
def update_board_config(board_id: int, config: BoardConfig):
    if not _board_exists(board_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    if config.name:
        pms.update_module(board_id, host=config.host, port=config.port, slave_id=config.slave_id, name=config.name)
    else:
        pms.update_module(board_id, host=config.host, port=config.port, slave_id=config.slave_id)
    cfg = _board_cfg(board_id)
    add_event("INFO", f"Config actualizada: {cfg['host']}:{cfg['port']} slave={cfg['slave_id']}", board_id)
    return {
        "board_id": board_id,
        "config": {
            "name": cfg["name"],
            "host": cfg["host"],
            "port": cfg["port"],
            "slave_id": cfg["slave_id"],
            "modbus_mode": _modbus_mode(),
            "serial_port": settings.modbus_serial_port if _is_rtu_mode() else None,
        },
    }


@router.post("/boards/{board_id}/output")
def set_output(board_id: int, action: ChannelAction):
    _, outs = pms.get_channels_for_module(board_id)
    if not 1 <= action.channel <= len(outs):
        raise HTTPException(status_code=400, detail=f"Canal debe estar entre 1 y {len(outs)}")
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    ch = outs[action.channel - 1]
    register = int(ch["address"])
    open_v = int(ch["open_cmd"]) if ch["open_cmd"] is not None else CMD_OPEN
    close_v = int(ch["close_cmd"]) if ch["close_cmd"] is not None else CMD_CLOSE
    value = open_v if action.state else close_v
    try:
        with modbus_io_lock:
            result = client.write_register(address=register, value=value, device_id=cfg["slave_id"])
        if result.isError():
            raise HTTPException(status_code=502, detail=f"Error Modbus: {result}")
        io_state[board_id]["outputs"][action.channel - 1] = action.state
        add_event("OK", f"CH{action.channel:02d} -> {'ON' if action.state else 'OFF'}", board_id)
        return {"board_id": board_id, "channel": action.channel, "state": action.state}
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=f"Error Modbus: {e}")


@router.post("/boards/{board_id}/outputs/all_on")
def all_outputs_on(board_id: int):
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    bulk = pms.get_bulk_commands(board_id)
    if "all_on" not in bulk:
        raise HTTPException(status_code=400, detail="No hay comando all_on configurado para este módulo")
    addr, val = bulk["all_on"]
    with modbus_io_lock:
        result = client.write_register(address=addr, value=val, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=str(result))
    n_out = len(io_state[board_id]["outputs"])
    io_state[board_id]["outputs"] = [True] * n_out
    add_event("OK", "Todas las salidas ON", board_id)
    return {"board_id": board_id, "all_outputs": True}


@router.post("/boards/{board_id}/outputs/all_off")
def all_outputs_off(board_id: int):
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    bulk = pms.get_bulk_commands(board_id)
    if "all_off" not in bulk:
        raise HTTPException(status_code=400, detail="No hay comando all_off configurado para este módulo")
    addr, val = bulk["all_off"]
    with modbus_io_lock:
        result = client.write_register(address=addr, value=val, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=str(result))
    n_out = len(io_state[board_id]["outputs"])
    io_state[board_id]["outputs"] = [False] * n_out
    add_event("OK", "Todas las salidas OFF", board_id)
    return {"board_id": board_id, "all_outputs": False}


@router.post("/boards/{board_id}/outputs/bitmask")
def set_outputs_bitmask(board_id: int, action: BitmaskAction):
    _, outs = pms.get_channels_for_module(board_id)
    n_out = len(outs)
    for ch in action.channels_on:
        if not 1 <= ch <= n_out:
            raise HTTPException(status_code=400, detail=f"Canal {ch} inválido (1-{n_out})")
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    bm_addr = cfg.get("bitmask_address")
    if bm_addr is None:
        raise HTTPException(status_code=400, detail="Este módulo no tiene bitmask_address configurado")
    bitmask = 0
    for ch in action.channels_on:
        bitmask |= 1 << (ch - 1)
    with modbus_io_lock:
        result = client.write_register(address=int(bm_addr), value=bitmask, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=str(result))
    for i in range(n_out):
        io_state[board_id]["outputs"][i] = bool((bitmask >> i) & 1)
    add_event("OK", f"Bitmask 0x{bitmask:04X}", board_id)
    return {"board_id": board_id, "bitmask": hex(bitmask), "channels_on": sorted(action.channels_on)}


@router.get("/boards/{board_id}/inputs")
def read_inputs(board_id: int):
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    ins, _ = pms.get_channels_for_module(board_id)
    slave = cfg["slave_id"]
    values_raw: List[bool] = []
    with modbus_io_lock:
        for ch in ins:
            res = client.read_holding_registers(address=int(ch["address"]), count=1, device_id=slave)
            if res.isError() or not res.registers:
                raise HTTPException(status_code=502, detail="Error leyendo entradas")
            values_raw.append(bool(res.registers[0]))
    io_state[board_id]["inputs_raw"] = values_raw
    values_effective = [values_raw[i] if input_overrides[board_id][i] is None else input_overrides[board_id][i] for i in range(len(values_raw))]
    io_state[board_id]["inputs"] = values_effective
    return {
        "board_id": board_id,
        "inputs_raw": {f"IN{i+1}": values_raw[i] for i in range(len(values_raw))},
        "inputs_effective": {f"IN{i+1}": values_effective[i] for i in range(len(values_effective))},
        "input_overrides": {f"IN{i+1}": input_overrides[board_id][i] for i in range(len(input_overrides[board_id]))},
    }


@router.get("/boards/{board_id}/outputs")
def read_outputs(board_id: int):
    client = get_client(board_id)
    cfg = _board_cfg(board_id)
    _, outs = pms.get_channels_for_module(board_id)
    slave = cfg["slave_id"]
    values: List[bool] = []
    with modbus_io_lock:
        for ch in outs:
            res = client.read_holding_registers(address=int(ch["address"]), count=1, device_id=slave)
            if res.isError() or not res.registers:
                raise HTTPException(status_code=502, detail="Error leyendo salidas")
            values.append(bool(res.registers[0]))
    io_state[board_id]["outputs"] = values
    return {"board_id": board_id, "outputs": {f"OUT{i+1}": values[i] for i in range(len(values))}}


@router.get("/events")
def get_events(limit: int = 300, type_filter: Optional[str] = None):
    sev = type_filter.strip().upper() if type_filter and type_filter.strip() else None
    total, rows = ses.list_events(
        severity_filter=sev,
        limit=min(limit, 2000),
        offset=0,
    )
    return {"total": total, "events": rows}


@router.delete("/events")
def clear_events():
    n = ses.clear_all_events()
    return {"ok": True, "message": "Histórico limpiado", "deleted": n}


@router.get("/inputs/override")
def get_input_overrides():
    return {
        "overrides": {
            str(board_id): {
                f"IN{i+1}": input_overrides[board_id][i] for i in range(len(input_overrides.get(board_id, [])))
            }
            for board_id in _module_ids()
            if board_id in input_overrides
        }
    }


@router.post("/inputs/override")
def set_input_override(action: InputOverrideAction):
    if not _board_exists(action.board_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    ins, _ = pms.get_channels_for_module(action.board_id)
    if not 1 <= action.channel <= len(ins):
        raise HTTPException(status_code=400, detail=f"Canal debe estar entre 1 y {len(ins)}")
    idx = action.channel - 1
    input_overrides[action.board_id][idx] = action.state
    _persist_overrides_to_db()
    add_event("INFO", f"Override IN{action.channel:02d} = {action.state}", action.board_id)
    return {"board_id": action.board_id, "channel": action.channel, "override": action.state}


@router.delete("/inputs/override")
def clear_input_override(board_id: int, channel: int):
    if not _board_exists(board_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    ins, _ = pms.get_channels_for_module(board_id)
    if not 1 <= channel <= len(ins):
        raise HTTPException(status_code=400, detail=f"Canal debe estar entre 1 y {len(ins)}")
    idx = channel - 1
    input_overrides[board_id][idx] = None
    _persist_overrides_to_db()
    add_event("INFO", f"Override IN{channel:02d} limpiado", board_id)
    return {"board_id": board_id, "channel": channel, "override": None}


@router.get("/rules/state")
def get_rules_state():
    return {
        "current_mode": current_mode,
        "mode_latches": mode_latches,
        "rules": rules_config,
        "runtime": rules_runtime,
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/rules")
def get_rules():
    return {"rules": rules_config, "runtime": rules_runtime}


@router.put("/rules")
def update_rules(body: RulesUpdateBody):
    global rules_config
    rules_config = body.rules
    _sync_mode_latches_from_rules(rules_config)
    _sync_rules_runtime(rules_config)
    _save_rules_to_disk(rules_config)
    add_event("INFO", "Reglas actualizadas por JSON", 1)
    return {"ok": True, "rules": rules_config}


@router.post("/rules/{rule_key}/run")
def run_rule_by_key(rule_key: str, simulate: bool = False):
    return _execute_rule_forced(rule_key=rule_key, apply_outputs_to_hardware=not simulate)


@router.post("/rules/horario-automatico/run")
def run_horario_automatico():
    """
    Ejecución manual forzada de "Horario Automático":
    - Fuerza IN_01_01 activa (override=True).
    - Fuerza IN_01_02..IN_01_07 desactivas (override=False).
    - Activa OUT5 y OUT6 de placa 2 y placa 3.
    """
    return _execute_rule_forced("horario_automatico", apply_outputs_to_hardware=True)


@router.get("/modules")
def list_modules_config():
    return {"modules": pms.get_full_config_for_api()}


@router.post("/modules")
def create_module_api(body: ModuleCreateBody):
    mid = pms.create_module(body.name, body.host, body.port, body.slave_id)
    _sync_runtime_from_db()
    add_event("INFO", f"Módulo creado id={mid} {body.name}", mid)
    mod = next((m for m in pms.get_full_config_for_api() if m["id"] == mid), None)
    return {"id": mid, "module": mod}


@router.put("/modules/{module_id}")
def update_module_api(module_id: int, body: ModuleUpdateBody):
    if not _board_exists(module_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    patch = body.model_dump(exclude_unset=True)
    if patch:
        pms.apply_module_update(module_id, patch)
    _sync_runtime_from_db()
    add_event("INFO", "Módulo actualizado en configuración", module_id)
    return {"id": module_id, "config": _board_cfg(module_id)}


@router.delete("/modules/{module_id}")
def delete_module_api(module_id: int):
    if not _board_exists(module_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    c = clients.pop(module_id, None)
    if c:
        try:
            c.close()
        except Exception:
            pass
    pms.delete_module(module_id)
    _sync_runtime_from_db()
    add_event("WARN", "Módulo eliminado de la configuración", module_id)
    return {"ok": True, "id": module_id}


@router.post("/modules/{module_id}/channels")
def add_channel_api(module_id: int, body: ChannelCreateBody):
    if not _board_exists(module_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    cid = pms.add_channel(
        module_id,
        body.kind,
        body.address,
        slot_index=body.slot_index,
        label=body.label,
        open_cmd=body.open_cmd,
        close_cmd=body.close_cmd,
    )
    _sync_runtime_from_db()
    add_event("INFO", f"Canal {body.kind} id={cid} addr=0x{body.address:X}", module_id)
    return {"channel_id": cid}


@router.put("/modules/{module_id}/channels/{channel_id}")
def patch_channel_api(module_id: int, channel_id: int, body: ChannelPatchBody):
    if not _board_exists(module_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    with get_connection() as conn:
        row = conn.execute(
            "SELECT module_id FROM panel_module_channels WHERE id = ?",
            (channel_id,),
        ).fetchone()
    if not row or row[0] != module_id:
        raise HTTPException(status_code=404, detail="Canal no pertenece a este módulo")
    pms.update_channel(
        channel_id,
        slot_index=body.slot_index,
        label=body.label,
        address=body.address,
        open_cmd=body.open_cmd,
        close_cmd=body.close_cmd,
    )
    _sync_runtime_from_db()
    return {"ok": True, "channel_id": channel_id}


@router.delete("/modules/{module_id}/channels/{channel_id}")
def delete_channel_api(module_id: int, channel_id: int):
    if not _board_exists(module_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    with get_connection() as conn:
        row = conn.execute(
            "SELECT module_id FROM panel_module_channels WHERE id = ?",
            (channel_id,),
        ).fetchone()
    if not row or row[0] != module_id:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    pms.delete_channel(channel_id)
    _sync_runtime_from_db()
    add_event("INFO", f"Canal eliminado id={channel_id}", module_id)
    return {"ok": True}


@router.put("/modules/{module_id}/bulk")
def set_bulk_commands_api(module_id: int, body: BulkCommandsBody):
    if not _board_exists(module_id):
        raise HTTPException(status_code=404, detail="Módulo no encontrado")
    if body.all_on:
        pms.set_bulk_command(module_id, "all_on", body.all_on.address, body.all_on.value)
    if body.all_off:
        pms.set_bulk_command(module_id, "all_off", body.all_off.address, body.all_off.value)
    _sync_runtime_from_db()
    add_event("INFO", "Comandos all_on / all_off actualizados", module_id)
    return {"bulk": pms.get_bulk_commands(module_id)}


@router.post("/rules/evaluate")
def evaluate_rules_now(force_trigger_override: bool = True, rule_key: Optional[str] = None):
    """
    Evalúa una regla tipo enclavamiento en modo manual (flanco / trigger).
    Si no se indica rule_key, se usa `horario_automatico` si existe; si no, la primera regla enclavamiento habilitada.
    """
    if not rules_config:
        raise HTTPException(status_code=400, detail="No hay reglas configuradas")

    rk = rule_key
    if rk is None:
        if "horario_automatico" in rules_config:
            rk = "horario_automatico"
        else:
            for cand, r in rules_config.items():
                if r.get("type") == "enclavamiento" and r.get("enabled", True):
                    rk = cand
                    break
    if rk is None or rk not in rules_config:
        raise HTTPException(status_code=400, detail="Indica rule_key o define al menos una regla enclavamiento")

    rule = rules_config[rk]
    if rule.get("type") != "enclavamiento":
        raise HTTPException(status_code=400, detail=f"La regla {rk} no es tipo enclavamiento (auto-evaluable en este endpoint)")

    if force_trigger_override:
        trigger_code = rule.get("trigger", "IN_01_01")
        if trigger_code:
            b, ch = _parse_in_code(trigger_code)
            input_overrides[b][ch - 1] = True
            _persist_overrides_to_db()
            add_event("INFO", f"Evaluate: trigger {trigger_code} forzado por override", b)

    result = _evaluate_trigger_rule(
        rk,
        manual=True,
        use_hardware_if_no_override=not force_trigger_override,
        apply_outputs_to_hardware=not force_trigger_override,
    )
    return {"ok": True, "results": {rk: result}, "rule_key": rk}


# ─── Funciones usadas por la API tablet v1 (`tablet_v1.py`) ─────────────────


def api_v1_list_modes_from_rules() -> List[Dict[str, Any]]:
    """Lista claves de reglas (modos) tal como están en `panel_rules.json`."""
    items: List[Dict[str, Any]] = []
    for key, rule in rules_config.items():
        items.append(
            {
                "key": key,
                "enabled": bool(rule.get("enabled", True)),
                "type": rule.get("type"),
                "auto_execute": rule.get("auto_execute"),
            }
        )
    return items


def api_v1_get_current_mode() -> Optional[str]:
    return current_mode


def api_v1_clear_current_mode_if_match(rule_key: str) -> dict:
    """Pone `current_mode` en null solo si coincide con el modo indicado."""
    global current_mode
    if current_mode != rule_key:
        return {"cleared": False, "current_mode": current_mode}
    current_mode = None
    _persist_current_mode_to_db()
    add_event("INFO", f"Modo desactivado vía API tablet: {rule_key}", 1)
    return {"cleared": True, "current_mode": None}


def api_v1_execute_rule_for_tablet(rule_key: str) -> dict:
    return _execute_rule_forced(rule_key, apply_outputs_to_hardware=True)


def api_v1_set_output_by_code(code: str, on: bool) -> dict:
    board_id, channel = _parse_out_code(code)
    if not _board_exists(board_id):
        raise HTTPException(status_code=404, detail=f"Módulo {board_id} no encontrado")
    st = io_state.get(board_id) or {}
    if not st.get("connected"):
        _connect_board(board_id)
    st = io_state.get(board_id) or {}
    if not st.get("connected"):
        raise HTTPException(status_code=503, detail=f"No se pudo conectar módulo {board_id}")
    _write_output(board_id, channel, on)
    add_event("OK", f"Salida (API tablet v1) {code} -> {'ON' if on else 'OFF'}", board_id)
    return {"code": code, "on": on, "board_id": board_id, "channel": channel}
