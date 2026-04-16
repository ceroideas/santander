"""
ETD8A12 Control Server — SAIMA SEGURIDAD / Banco Santander
FastAPI + pymodbus backend para control real de placas ETD8A12 via Modbus TCP

Uso:
    pip install fastapi uvicorn pymodbus
    python server.py

API disponible en: http://localhost:8000
Docs Swagger:      http://localhost:8000/docs
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

# ─────────────────────────────────────────────────────────────────────────────
# LOGGING
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ETD8A12")

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES MODBUS (de los docs del fabricante)
# ─────────────────────────────────────────────────────────────────────────────
CMD_OPEN      = 0x0100   # Activar relé individual
CMD_CLOSE     = 0x0200   # Desactivar relé individual
CMD_OPEN_ALL  = 0x0700   # Activar todos los relés
CMD_CLOSE_ALL = 0x0800   # Desactivar todos los relés

REG_OUTPUT_START = 0x0000   # Registros de salida: 0x0000 - 0x000B (12 canales)
REG_OUTPUT_BITS  = 0x0070   # Registro bitmask de salidas
REG_INPUT_START  = 0x0080   # Registros de entrada: 0x0080 - 0x008B (12 canales)
REG_INPUT_BITS   = 0x00C0   # Registro bitmask de entradas

MODBUS_PORT    = 5000
MODBUS_TIMEOUT = 9
SLAVE_ID       = 1
DISABLE_IN_OUT_RELATION_ON_CONNECT = False

# ─────────────────────────────────────────────────────────────────────────────
# ESTADO GLOBAL
# ─────────────────────────────────────────────────────────────────────────────
# Configuración de placas (editable desde la API)
BOARDS_CONFIG: Dict[int, dict] = {
    1: {"name": "Placa 1 — Central",       "host": "192.168.1.101", "port": MODBUS_PORT, "slave_id": SLAVE_ID},
    2: {"name": "Placa 2 — Puerta Calle",  "host": "192.168.1.102", "port": MODBUS_PORT, "slave_id": SLAVE_ID},
    3: {"name": "Placa 3 — Puerta Oficina","host": "192.168.1.103", "port": MODBUS_PORT, "slave_id": SLAVE_ID},
}

# Clientes Modbus activos
clients: Dict[int, Optional[ModbusTcpClient]] = {1: None, 2: None, 3: None}

# Cache de estado I/O (se actualiza con polling)
io_state: Dict[int, dict] = {
    i: {
        "connected": False,
        "outputs": [False] * 12,
        "inputs":  [False] * 12,
        "last_update": None,
        "error": None,
    }
    for i in range(1, 4)
}

# Log de eventos del sistema
event_log: List[dict] = []

def add_event(level: str, message: str, board_id: int = 0):
    event_log.append({
        "ts": datetime.now().strftime("%H:%M:%S"),
        "date": datetime.now().isoformat(),
        "type": level,
        "msg": message,
        "board": board_id,
    })
    # Retener solo los últimos 1000 eventos en memoria
    if len(event_log) > 1000:
        event_log.pop(0)
    logger = getattr(log, level.lower(), log.info)
    logger(f"[Placa {board_id}] {message}" if board_id else message)


# ─────────────────────────────────────────────────────────────────────────────
# MODBUS HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def get_client(board_id: int) -> ModbusTcpClient:
    """Devuelve cliente Modbus activo o lanza excepción."""
    cfg = BOARDS_CONFIG.get(board_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Placa {board_id} no configurada")
    client = clients.get(board_id)
    if client is None or not client.is_socket_open():
        raise HTTPException(status_code=503, detail=f"Placa {board_id} no conectada")
    return client


def _connect_board(board_id: int) -> bool:
    """Intenta conectar con una placa. Devuelve True si éxito."""
    cfg = BOARDS_CONFIG[board_id]
    try:
        # Cerrar cliente anterior si existe
        if clients[board_id]:
            try:
                clients[board_id].close()
            except Exception:
                pass

        candidates = [cfg["slave_id"]]
        for candidate in (1, 255):
            if candidate not in candidates:
                candidates.append(candidate)

        last_probe_error = None
        for candidate_slave in candidates:
            client = ModbusTcpClient(
                host=cfg["host"],
                port=cfg["port"],
                timeout=MODBUS_TIMEOUT,
            )
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

            # Handshake de lectura Modbus real para validar canal.
            try:
                probe = client.read_holding_registers(
                    address=REG_INPUT_START, count=1, device_id=candidate_slave
                )
                if probe.isError():
                    raise RuntimeError(f"Probe Modbus error: {probe}")

                if cfg["slave_id"] != candidate_slave:
                    BOARDS_CONFIG[board_id]["slave_id"] = candidate_slave
                    add_event("INFO", f"slave_id autodetectado: {candidate_slave}", board_id)
                cfg = BOARDS_CONFIG[board_id]
                break
            except Exception as probe_err:
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

        if DISABLE_IN_OUT_RELATION_ON_CONNECT:
            # Algunos equipos cortan socket al escribir 0x00FA justo al conectar.
            try:
                result = client.write_register(
                    address=0x00FA, value=0x0000, device_id=cfg["slave_id"]
                )
                if result.isError():
                    add_event("WARN", "No se pudo desactivar relación IN→OUT (reg 0x00FA)", board_id)
                else:
                    add_event("OK", "Relación IN→OUT desactivada — control exclusivo Python (reg 0x00FA=0x0000)", board_id)
            except Exception as e:
                add_event("WARN", f"Error escribiendo reg 0x00FA: {e}", board_id)
        return True
    except Exception as e:
        io_state[board_id]["connected"] = False
        io_state[board_id]["error"] = str(e)
        add_event("ERR", f"Excepción al conectar: {e}", board_id)
        return False


def _read_all_io(board_id: int):
    """Lee las 12 salidas y 12 entradas de una placa. Actualiza io_state."""
    client = clients.get(board_id)
    if not client or not client.is_socket_open():
        io_state[board_id]["connected"] = False
        return

    cfg = BOARDS_CONFIG[board_id]
    slave = cfg["slave_id"]

    try:
        # Leer 12 registros de salida
        res_out = client.read_holding_registers(
            address=REG_OUTPUT_START, count=12, device_id=slave
        )
        if not res_out.isError():
            # El registro vale 1 si el relé está activado
            io_state[board_id]["outputs"] = [
                bool(res_out.registers[i]) for i in range(12)
            ]

        # Leer 12 registros de entrada
        res_in = client.read_holding_registers(
            address=REG_INPUT_START, count=12, device_id=slave
        )
        if not res_in.isError():
            io_state[board_id]["inputs"] = [
                bool(res_in.registers[i]) for i in range(12)
            ]

        io_state[board_id]["connected"] = True
        io_state[board_id]["last_update"] = datetime.now().isoformat()
        io_state[board_id]["error"] = None

    except ModbusException as e:
        io_state[board_id]["connected"] = False
        io_state[board_id]["error"] = str(e)
        add_event("ERR", f"Error Modbus leyendo I/O: {e}", board_id)
    except Exception as e:
        io_state[board_id]["connected"] = False
        io_state[board_id]["error"] = str(e)
        add_event("ERR", f"Error general leyendo I/O: {e}", board_id)


# ─────────────────────────────────────────────────────────────────────────────
# POLLING BACKGROUND TASK
# ─────────────────────────────────────────────────────────────────────────────
async def polling_loop():
    """Lee entradas/salidas de todas las placas conectadas cada 500ms."""
    add_event("INFO", "Polling Modbus iniciado (intervalo: 500ms)")
    while True:
        for board_id in range(1, 4):
            if io_state[board_id]["connected"]:
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _read_all_io, board_id)
        await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    add_event("INFO", "ETD8A12 Control Server iniciado — SAIMA SEGURIDAD / Banco Santander")
    add_event("INFO", "Servidor HTTP listo en http://localhost:8000")
    add_event("INFO", "Swagger docs en http://localhost:8000/docs")
    add_event("WARN", "Placas no conectadas. Usa POST /boards/{id}/connect para conectar.")
    task = asyncio.create_task(polling_loop())
    yield
    task.cancel()
    for c in clients.values():
        if c:
            try:
                c.close()
            except Exception:
                pass
    add_event("INFO", "Servidor detenido. Conexiones cerradas.")


# ─────────────────────────────────────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ETD8A12 Control API",
    description="API REST para control de placas ETD8A12 via Modbus TCP — SAIMA SEGURIDAD",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # En producción: especificar origen del frontend
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────────────────────
class BoardConfig(BaseModel):
    host: str
    port: int = 5000
    slave_id: int = 1
    name: Optional[str] = None


class ChannelAction(BaseModel):
    channel: int          # 1-12
    state: bool           # True = ON, False = OFF


class BitmaskAction(BaseModel):
    channels_on: List[int]   # Lista de canales a activar (el resto se apagan)


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — STATUS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/", summary="Health check")
def root():
    connected_count = sum(1 for s in io_state.values() if s["connected"])
    return {
        "service": "ETD8A12 Control Server",
        "version": "1.0.0",
        "status": "running",
        "boards_connected": connected_count,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/status", summary="Estado completo del sistema")
def get_status():
    """Devuelve estado de todas las placas: conexión, entradas y salidas."""
    return {
        "boards": {
            str(bid): {
                "id": bid,
                "config": BOARDS_CONFIG[bid],
                **io_state[bid],
            }
            for bid in range(1, 4)
        },
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/boards/{board_id}/state", summary="Estado I/O de una placa")
def get_board_state(board_id: int):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    return {
        "board_id": board_id,
        "config": BOARDS_CONFIG[board_id],
        **io_state[board_id],
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — CONEXIÓN
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/boards/{board_id}/connect", summary="Conectar con una placa")
def connect_board(board_id: int):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    ok = _connect_board(board_id)
    if ok:
        _read_all_io(board_id)
    return {"board_id": board_id, "connected": ok, "state": io_state[board_id]}


@app.post("/boards/{board_id}/disconnect", summary="Desconectar una placa")
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


@app.put("/boards/{board_id}/config", summary="Cambiar IP/puerto de una placa")
def update_board_config(board_id: int, config: BoardConfig):
    if board_id not in range(1, 4):
        raise HTTPException(status_code=404, detail="board_id debe ser 1, 2 o 3")
    BOARDS_CONFIG[board_id]["host"] = config.host
    BOARDS_CONFIG[board_id]["port"] = config.port
    BOARDS_CONFIG[board_id]["slave_id"] = config.slave_id
    if config.name:
        BOARDS_CONFIG[board_id]["name"] = config.name
    add_event("INFO", f"Configuración actualizada: {config.host}:{config.port} slave={config.slave_id}", board_id)
    return {"board_id": board_id, "config": BOARDS_CONFIG[board_id]}


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — CONTROL DE SALIDAS
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/boards/{board_id}/output", summary="Activar o desactivar un canal de salida")
def set_output(board_id: int, action: ChannelAction):
    """
    Escribe CMD_OPEN (0x0100) o CMD_CLOSE (0x0200) en el registro del canal.
    channel: 1-12
    state: true=ON, false=OFF
    """
    if not 1 <= action.channel <= 12:
        raise HTTPException(status_code=400, detail="Canal debe estar entre 1 y 12")

    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    register = REG_OUTPUT_START + (action.channel - 1)
    value = CMD_OPEN if action.state else CMD_CLOSE

    try:
        result = client.write_register(
            address=register,
            value=value,
            device_id=cfg["slave_id"],
        )
        if result.isError():
            raise HTTPException(status_code=502, detail=f"Error Modbus: {result}")

        # Actualizar cache local inmediatamente
        io_state[board_id]["outputs"][action.channel - 1] = action.state
        add_event(
            "OK",
            f"CH{action.channel:02d} → {'ON' if action.state else 'OFF'}  (reg 0x{register:04X} = 0x{value:04X})",
            board_id,
        )
        return {
            "board_id": board_id,
            "channel": action.channel,
            "state": action.state,
            "register": hex(register),
            "value_sent": hex(value),
        }
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=f"Error Modbus: {e}")


@app.post("/boards/{board_id}/outputs/all_on", summary="Activar todas las salidas")
def all_outputs_on(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    try:
        result = client.write_register(
            address=REG_OUTPUT_START, value=CMD_OPEN_ALL, device_id=cfg["slave_id"]
        )
        if result.isError():
            raise HTTPException(status_code=502, detail=str(result))
        io_state[board_id]["outputs"] = [True] * 12
        add_event("OK", "Todas las salidas ON (CMD_OPEN_ALL 0x0700)", board_id)
        return {"board_id": board_id, "all_outputs": True}
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/boards/{board_id}/outputs/all_off", summary="Desactivar todas las salidas")
def all_outputs_off(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    try:
        result = client.write_register(
            address=REG_OUTPUT_START, value=CMD_CLOSE_ALL, device_id=cfg["slave_id"]
        )
        if result.isError():
            raise HTTPException(status_code=502, detail=str(result))
        io_state[board_id]["outputs"] = [False] * 12
        add_event("OK", "Todas las salidas OFF (CMD_CLOSE_ALL 0x0800)", board_id)
        return {"board_id": board_id, "all_outputs": False}
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/boards/{board_id}/outputs/bitmask", summary="Activar canales por bitmask")
def set_outputs_bitmask(board_id: int, action: BitmaskAction):
    """
    Activa exactamente los canales listados en channels_on, apaga el resto.
    Escribe un bitmask de 12 bits en REG_OUTPUT_BITS (0x0070).
    """
    for ch in action.channels_on:
        if not 1 <= ch <= 12:
            raise HTTPException(status_code=400, detail=f"Canal {ch} inválido (1-12)")

    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]

    bitmask = 0
    for ch in action.channels_on:
        bitmask |= (1 << (ch - 1))

    try:
        result = client.write_register(
            address=REG_OUTPUT_BITS, value=bitmask, device_id=cfg["slave_id"]
        )
        if result.isError():
            raise HTTPException(status_code=502, detail=str(result))

        # Actualizar cache
        for i in range(12):
            io_state[board_id]["outputs"][i] = bool((bitmask >> i) & 1)

        add_event("OK", f"Bitmask 0x{bitmask:04X} → canales ON: {sorted(action.channels_on)}", board_id)
        return {
            "board_id": board_id,
            "bitmask": hex(bitmask),
            "channels_on": sorted(action.channels_on),
            "outputs": io_state[board_id]["outputs"],
        }
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — LECTURA EXPLÍCITA
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/boards/{board_id}/inputs", summary="Leer entradas digitales")
def read_inputs(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    try:
        res = client.read_holding_registers(
            address=REG_INPUT_START, count=12, device_id=cfg["slave_id"]
        )
        if res.isError():
            raise HTTPException(status_code=502, detail="Error leyendo entradas")
        values = [bool(res.registers[i]) for i in range(12)]
        io_state[board_id]["inputs"] = values
        return {
            "board_id": board_id,
            "inputs": {f"IN{i+1}": values[i] for i in range(12)},
            "raw_registers": res.registers,
        }
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/boards/{board_id}/outputs", summary="Leer estado de salidas")
def read_outputs(board_id: int):
    client = get_client(board_id)
    cfg = BOARDS_CONFIG[board_id]
    try:
        res = client.read_holding_registers(
            address=REG_OUTPUT_START, count=12, device_id=cfg["slave_id"]
        )
        if res.isError():
            raise HTTPException(status_code=502, detail="Error leyendo salidas")
        values = [bool(res.registers[i]) for i in range(12)]
        io_state[board_id]["outputs"] = values
        return {
            "board_id": board_id,
            "outputs": {f"OUT{i+1}": values[i] for i in range(12)},
            "raw_registers": res.registers,
        }
    except ModbusException as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — EVENTOS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/events", summary="Histórico de eventos")
def get_events(limit: int = 200, type_filter: Optional[str] = None, board_id: Optional[int] = None):
    filtered = event_log
    if type_filter:
        filtered = [e for e in filtered if e["type"] == type_filter.upper()]
    if board_id:
        filtered = [e for e in filtered if e["board"] == board_id]
    return {
        "total": len(filtered),
        "events": list(reversed(filtered[-limit:])),
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  ETD8A12 Control Server — SAIMA SEGURIDAD")
    print("  Banco Santander — Control de Accesos")
    print("=" * 60)
    print("  API:    http://localhost:8000")
    print("  Docs:   http://localhost:8000/docs")
    print("  Status: http://localhost:8000/status")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
