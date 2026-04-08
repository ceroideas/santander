"""API compatible con panel ETD8A12 (software prueba_)."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pymodbus.client import ModbusTcpClient
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

BOARDS_CONFIG: Dict[int, dict] = {
    1: {"name": "Placa 1 — Central", "host": "192.168.1.101", "port": 5000, "slave_id": 1},
    2: {"name": "Placa 2 — Puerta Calle", "host": "192.168.1.102", "port": 5000, "slave_id": 1},
    3: {"name": "Placa 3 — Puerta Oficina", "host": "192.168.1.103", "port": 5000, "slave_id": 1},
}
clients: Dict[int, Optional[ModbusTcpClient]] = {1: None, 2: None, 3: None}
io_state: Dict[int, dict] = {
    i: {
        "connected": False,
        "inputs_raw": [False] * 12,
        "outputs": [False] * 12,
        "inputs": [False] * 12,
        "last_update": None,
        "error": None,
    }
    for i in range(1, 4)
}
input_overrides: Dict[int, List[Optional[bool]]] = {1: [None] * 12, 2: [None] * 12, 3: [None] * 12}
event_log: List[dict] = []
mode_latches: Dict[str, bool] = {
    "IN_01_01": False,  # Horario Automatico
    "IN_01_02": False,  # Horario Esclusa
    "IN_01_03": False,  # Horario Extendido
    "IN_01_04": False,  # Horario Autoservicio
    "IN_01_05": False,  # Horario Cerrado
    "IN_01_06": False,  # Horario Carga Cajero
    "IN_01_07": False,  # Horario Manual
}
current_mode: Optional[str] = None
rules_config: Dict[str, dict] = {
    "horario_automatico": {
        "enabled": True,
        "auto_execute": True,
        "type": "enclavamiento",
        "trigger": "IN_01_01",
        "blocked_if_active": ["IN_01_10"],
        "deactivate_modes": ["IN_01_02", "IN_01_03", "IN_01_04", "IN_01_05", "IN_01_06", "IN_01_07"],
        "activate_outputs": ["OUT_02_05", "OUT_02_06", "OUT_03_05", "OUT_03_06"],
        "deactivate_outputs": [],
    }
}
rules_runtime: Dict[str, dict] = {"horario_automatico": {"last_trigger_active": False, "last_executed_at": None}}


def add_event(level: str, message: str, board_id: int = 0) -> None:
    event_log.append(
        {
            "ts": datetime.now().strftime("%H:%M:%S"),
            "date": datetime.now().isoformat(),
            "type": level,
            "msg": message,
            "board": board_id,
        }
    )
    if len(event_log) > 1000:
        event_log.pop(0)


def get_client(board_id: int) -> ModbusTcpClient:
    cfg = BOARDS_CONFIG.get(board_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Placa {board_id} no configurada")
    client = clients.get(board_id)
    if client is None or not client.is_socket_open():
        raise HTTPException(status_code=503, detail=f"Placa {board_id} no conectada")
    return client


def _connect_board(board_id: int) -> bool:
    cfg = BOARDS_CONFIG[board_id]
    try:
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
                probe = client.read_holding_registers(address=REG_INPUT_START, count=1, device_id=candidate_slave)
                if probe.isError():
                    raise RuntimeError(f"Probe Modbus error: {probe}")
                # Handshake correcto: fijar slave_id detectado
                if cfg["slave_id"] != candidate_slave:
                    BOARDS_CONFIG[board_id]["slave_id"] = candidate_slave
                    add_event("INFO", f"slave_id autodetectado: {candidate_slave}", board_id)
                cfg = BOARDS_CONFIG[board_id]
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
                client.write_register(address=REG_IN_OUT_RELATION, value=0x0000, device_id=cfg["slave_id"])
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
    if not client or not client.is_socket_open():
        io_state[board_id]["connected"] = False
        return

    cfg = BOARDS_CONFIG[board_id]
    slave = cfg["slave_id"]
    try:
        res_out = client.read_holding_registers(address=REG_OUTPUT_START, count=12, device_id=slave)
        if not res_out.isError():
            io_state[board_id]["outputs"] = [bool(res_out.registers[i]) for i in range(12)]

        res_in = client.read_holding_registers(address=REG_INPUT_START, count=12, device_id=slave)
        if not res_in.isError():
            io_state[board_id]["inputs_raw"] = [bool(res_in.registers[i]) for i in range(12)]

        # Aplicar override de entradas para pruebas/lógica
        effective_inputs: List[bool] = []
        for idx in range(12):
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
    cfg = BOARDS_CONFIG[board_id]
    register = REG_OUTPUT_START + (channel - 1)
    value = CMD_OPEN if state else CMD_CLOSE
    result = client.write_register(address=register, value=value, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=f"Error Modbus escribiendo OUT{channel} en placa {board_id}: {result}")
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
    if board_id not in range(1, 4):
        raise HTTPException(status_code=400, detail=f"Placa inválida en {code}")
    if not 1 <= channel <= 12:
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


def _evaluate_horario_automatico(
    manual: bool = False,
    use_hardware_if_no_override: bool = True,
    apply_outputs_to_hardware: bool = True,
) -> dict:
    global current_mode
    key = "horario_automatico"
    rule = rules_config[key]
    runtime = rules_runtime[key]

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
        add_event("WARN", f"Horario Automatico bloqueado por {', '.join(blocked_active_codes)}", 1)
        return {
            "executed": False,
            "reason": f"Bloqueado por entradas activas: {', '.join(blocked_active_codes)}",
            "trigger_input_active": trigger_active,
        }

    mode_latches["IN_01_01"] = True
    for code in rule.get("deactivate_modes", []):
        mode_latches[code] = False
        board_id, channel = _parse_in_code(code)
        input_overrides[board_id][channel - 1] = False
    current_mode = "HORARIO_AUTOMATICO"

    for do_code in rule.get("activate_outputs", []):
        board_id, channel = _parse_out_code(do_code)
        if apply_outputs_to_hardware:
            if not io_state[board_id]["connected"]:
                _connect_board(board_id)
            _write_output(board_id, channel, True)
        else:
            # Modo simulación para pruebas con override, sin dependencia de red/hardware.
            io_state[board_id]["outputs"][channel - 1] = True
            add_event("INFO", f"SIMULADO {do_code} -> ON (sin hardware)", board_id)
    for do_code in rule.get("deactivate_outputs", []):
        board_id, channel = _parse_out_code(do_code)
        if apply_outputs_to_hardware:
            if not io_state[board_id]["connected"]:
                _connect_board(board_id)
            _write_output(board_id, channel, False)
        else:
            io_state[board_id]["outputs"][channel - 1] = False
            add_event("INFO", f"SIMULADO {do_code} -> OFF (sin hardware)", board_id)

    runtime["last_executed_at"] = datetime.now().isoformat()
    add_event("OK", "Regla Horario Automatico ejecutada", 1)
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


def _evaluate_auto_rules() -> None:
    if rules_config.get("horario_automatico", {}).get("auto_execute", True):
        try:
            _evaluate_horario_automatico(manual=False)
        except Exception as e:  # noqa: BLE001
            add_event("ERR", f"Error auto-evaluando Horario Automatico: {e}", 1)


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
                raise HTTPException(status_code=503, detail=f"No se pudo conectar placa {b} para {out_code}")
            _write_output(b, ch, True)
        else:
            io_state[b]["outputs"][ch - 1] = True

    for out_code in rule.get("deactivate_outputs", []):
        b, ch = _parse_out_code(out_code)
        if apply_outputs_to_hardware:
            if not io_state[b]["connected"]:
                _connect_board(b)
            if not io_state[b]["connected"]:
                raise HTTPException(status_code=503, detail=f"No se pudo conectar placa {b} para {out_code}")
            _write_output(b, ch, False)
        else:
            io_state[b]["outputs"][ch - 1] = False

    current_mode = rule_key.upper()
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


@router.get("/")
def root():
    return {"service": "ETD8A12 Panel API", "status": "running", "timestamp": datetime.now().isoformat()}


@router.get("/status")
def get_status():
    for board_id in range(1, 4):
        if io_state[board_id]["connected"]:
            _read_all_io(board_id)
    _evaluate_auto_rules()
    return {
        "boards": {
            str(bid): {
                "id": bid,
                "config": BOARDS_CONFIG[bid],
                **io_state[bid],
                "input_overrides": input_overrides[bid],
            }
            for bid in range(1, 4)
        },
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


@router.post("/boards/{board_id}/disconnect")
def disconnect_board(board_id: int):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    client = clients.get(board_id)
    if client:
        client.close()
        clients[board_id] = None
    io_state[board_id]["connected"] = False
    add_event("WARN", "Desconectado manualmente", board_id)
    return {"board_id": board_id, "connected": False}


@router.put("/boards/{board_id}/config")
def update_board_config(board_id: int, config: BoardConfig):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    BOARDS_CONFIG[board_id]["host"] = config.host
    BOARDS_CONFIG[board_id]["port"] = config.port
    BOARDS_CONFIG[board_id]["slave_id"] = config.slave_id
    if config.name:
        BOARDS_CONFIG[board_id]["name"] = config.name
    add_event("INFO", f"Config actualizada: {config.host}:{config.port} slave={config.slave_id}", board_id)
    return {"board_id": board_id, "config": BOARDS_CONFIG[board_id]}


@router.post("/boards/{board_id}/output")
def set_output(board_id: int, action: ChannelAction):
    if not 1 <= action.channel <= 12:
        raise HTTPException(status_code=400, detail="Canal debe estar entre 1 y 12")
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    register = REG_OUTPUT_START + (action.channel - 1)
    value = CMD_OPEN if action.state else CMD_CLOSE
    try:
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
    cfg = BOARDS_CONFIG[board_id]
    result = client.write_register(address=REG_OUTPUT_START, value=CMD_OPEN_ALL, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=str(result))
    io_state[board_id]["outputs"] = [True] * 12
    add_event("OK", "Todas las salidas ON", board_id)
    return {"board_id": board_id, "all_outputs": True}


@router.post("/boards/{board_id}/outputs/all_off")
def all_outputs_off(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    result = client.write_register(address=REG_OUTPUT_START, value=CMD_CLOSE_ALL, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=str(result))
    io_state[board_id]["outputs"] = [False] * 12
    add_event("OK", "Todas las salidas OFF", board_id)
    return {"board_id": board_id, "all_outputs": False}


@router.post("/boards/{board_id}/outputs/bitmask")
def set_outputs_bitmask(board_id: int, action: BitmaskAction):
    for ch in action.channels_on:
        if not 1 <= ch <= 12:
            raise HTTPException(status_code=400, detail=f"Canal {ch} inválido (1-12)")
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    bitmask = 0
    for ch in action.channels_on:
        bitmask |= (1 << (ch - 1))
    result = client.write_register(address=REG_OUTPUT_BITS, value=bitmask, device_id=cfg["slave_id"])
    if result.isError():
        raise HTTPException(status_code=502, detail=str(result))
    for i in range(12):
        io_state[board_id]["outputs"][i] = bool((bitmask >> i) & 1)
    add_event("OK", f"Bitmask 0x{bitmask:04X}", board_id)
    return {"board_id": board_id, "bitmask": hex(bitmask), "channels_on": sorted(action.channels_on)}


@router.get("/boards/{board_id}/inputs")
def read_inputs(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    res = client.read_holding_registers(address=REG_INPUT_START, count=12, device_id=cfg["slave_id"])
    if res.isError():
        raise HTTPException(status_code=502, detail="Error leyendo entradas")
    values_raw = [bool(res.registers[i]) for i in range(12)]
    io_state[board_id]["inputs_raw"] = values_raw
    values_effective = [values_raw[i] if input_overrides[board_id][i] is None else input_overrides[board_id][i] for i in range(12)]
    io_state[board_id]["inputs"] = values_effective
    return {
        "board_id": board_id,
        "inputs_raw": {f"IN{i+1}": values_raw[i] for i in range(12)},
        "inputs_effective": {f"IN{i+1}": values_effective[i] for i in range(12)},
        "input_overrides": {f"IN{i+1}": input_overrides[board_id][i] for i in range(12)},
    }


@router.get("/boards/{board_id}/outputs")
def read_outputs(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    res = client.read_holding_registers(address=REG_OUTPUT_START, count=12, device_id=cfg["slave_id"])
    if res.isError():
        raise HTTPException(status_code=502, detail="Error leyendo salidas")
    values = [bool(res.registers[i]) for i in range(12)]
    io_state[board_id]["outputs"] = values
    return {"board_id": board_id, "outputs": {f"OUT{i+1}": values[i] for i in range(12)}}


@router.get("/events")
def get_events(limit: int = 300, type_filter: Optional[str] = None):
    filtered = event_log
    if type_filter:
        filtered = [e for e in filtered if e["type"] == type_filter.upper()]
    return {"total": len(filtered), "events": list(reversed(filtered[-limit:]))}


@router.get("/inputs/override")
def get_input_overrides():
    return {
        "overrides": {
            str(board_id): {f"IN{i+1}": input_overrides[board_id][i] for i in range(12)}
            for board_id in range(1, 4)
        }
    }


@router.post("/inputs/override")
def set_input_override(action: InputOverrideAction):
    if action.board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    if not 1 <= action.channel <= 12:
        raise HTTPException(status_code=400, detail="Canal debe estar entre 1 y 12")
    idx = action.channel - 1
    input_overrides[action.board_id][idx] = action.state
    add_event("INFO", f"Override IN{action.channel:02d} = {action.state}", action.board_id)
    return {"board_id": action.board_id, "channel": action.channel, "override": action.state}


@router.delete("/inputs/override")
def clear_input_override(board_id: int, channel: int):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    if not 1 <= channel <= 12:
        raise HTTPException(status_code=400, detail="Canal debe estar entre 1 y 12")
    idx = channel - 1
    input_overrides[board_id][idx] = None
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


@router.post("/rules/evaluate")
def evaluate_rules_now(force_trigger_override: bool = True):
    """
    Evalúa reglas en modo manual.
    Por defecto en pruebas fuerza override del trigger para facilitar validación.
    """
    if force_trigger_override:
        trigger_code = rules_config.get("horario_automatico", {}).get("trigger", "IN_01_01")
        board_id, channel = _parse_in_code(trigger_code)
        input_overrides[board_id][channel - 1] = True
        add_event("INFO", f"Evaluate reglas: trigger {trigger_code} forzado por override", board_id)

    result = _evaluate_horario_automatico(
        manual=True,
        use_hardware_if_no_override=not force_trigger_override,
        apply_outputs_to_hardware=not force_trigger_override,
    )
    return {"ok": True, "results": {"horario_automatico": result}}
