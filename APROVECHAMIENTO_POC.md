# Aprovechamiento del PoC (software de prueba)

**PoC** = software de prueba en `App Control de Puertas/3 Control de Accesos/software prueba_/`  
Backend: `src/server.py` (FastAPI + pymodbus). Conexión al ETD8A12 por Ethernet (Modbus TCP) ya probada en Windows.

Este documento resume **qué se reutiliza** del PoC en el proyecto final, para tenerlo a mano sin mezclarlo con la guía de subtasks.

---

## Qué se aprovecha del PoC

| Componente del PoC | Uso en el proyecto final |
|--------------------|--------------------------|
| **Conexión Modbus TCP** con `pymodbus` | Misma librería y flujo: conectar a las 3 placas por IP/puerto, gestionar clientes y reconexión. |
| **Constantes y registros ETD8A12** | Copiar/adaptar al módulo de hardware: `REG_OUTPUT_START` (0x0000), `REG_INPUT_START` (0x0080), `REG_OUTPUT_BITS` (0x0070), `CMD_OPEN`/`CMD_CLOSE`/`CMD_OPEN_ALL`/`CMD_CLOSE_ALL`, registro 0x00FA (relación IN/OUT). |
| **Lectura de 12 entradas y 12 salidas por placa** | Base del ciclo de lectura; en el proyecto final ajustar intervalo a &lt;100 ms para las 36 entradas (alcance). |
| **Escritura de salidas** (canal individual, bitmask, all_on/all_off) | Misma lógica de escritura de registros; reutilizable en la capa que ejecuta las actuaciones. |
| **Estructura de endpoints** (`/status`, `/boards/{id}/state`, `/boards/{id}/connect`, `/boards/{id}/output`, `/events`) | Referencia para la API; alinear nombres y rutas con alcance (p. ej. `/api/status`, `/api/doors`, `/api/modes`, `POST /api/mode`). |
| **FastAPI + CORS + lifespan** (polling en background) | Patrón de aplicación y tarea asíncrona en segundo plano; adaptar al ciclo de lectura definitivo. |
| **Configuración de placas** (IP, puerto, slave_id por placa) | Modelo de config de los 3 módulos; en el proyecto final llevarlo a archivo de configuración o BD. |
| **Log de eventos en memoria** | Idea reutilizable; en el proyecto final sustituir por persistencia en SQLite (histórico 180 días). |

---

## Qué no está en el PoC (se desarrolla en el proyecto)

- Lógica de los **7 modos operativos** y las **33 actuaciones** (Anexo A).
- API REST definitiva del alcance: Basic Auth, HTTPS, endpoints exactos y documentación OpenAPI.
- **SQLite**: histórico 180 días, eventos, configuración de horarios y calendario.
- **Servicio Windows** (auto-inicio, recuperación ante fallos &lt;30 s).
- **Interfaz web de configuración** (horarios, festivos, tiempos, usuarios, estado en tiempo real).
- **Mock/simulador** de ETD8A12 para desarrollo sin hardware.
- Optimización del ciclo de polling a &lt;100 ms (36 entradas).

---

## Ubicación del PoC

```
App Control de Puertas/3 Control de Accesos/software prueba_/
├── src/
│   ├── server.py          ← Backend a aprovechar (Modbus + API base)
│   ├── ETD8A12_Frontend.jsx
│   └── ...
└── README (1).md          ← Instrucciones de uso y comandos Modbus
```

Referencia de subtasks: ver `GUIA_SUBTASKS.md` (Subtask 5: migrar/refactorizar; Subtask 7: integrar capa ETD8A12).

---

## Ejemplo concreto: IN1 módulo 1 → OUT5 y OUT6 módulos 2 y 3

Este ejemplo sirve como plantilla para describir las actuaciones.

### Descripción funcional

- **Entrada que dispara la actuación:**
  - Módulo 1 (Central), `IN1`.
- **Acción a realizar:**
  - Activar `OUT5` y `OUT6` del **módulo 2** (Puerta Calle).
  - Activar `OUT5` y `OUT6` del **módulo 3** (Puerta Oficina).

En términos de los anexos de `alcance.md`:

- Origen: `IN1` del Módulo 1 (Central).
- Destino: `OUT5` y `OUT6` de Módulo 2 y Módulo 3.
- Condición: `IN1` activo (se puede añadir: modo, alarma, etc. si aplica).

### A nivel Modbus (PoC)

1. **Lectura de IN1 del módulo 1**

En el PoC, tras el polling:

- `io_state[1]["inputs"][0]` representa **IN1** del módulo 1 (`True` si está activo).

2. **Escritura de OUT5 y OUT6 en módulos 2 y 3**

- Las salidas van de `OUT1` a `OUT12`, mapeadas a registros Modbus:
  - Registro de `OUTN` = `REG_OUTPUT_START + (N - 1)`  
    (con `REG_OUTPUT_START = 0x0000`).
- Para encender una salida se escribe `CMD_OPEN` (0x0100).  
  Para apagarla se usaría `CMD_CLOSE` (0x0200).

En código (esquema basado en `server.py`):

```python
def accion_in1_mod1_activa_out5y6_mod2_y_mod3():
    # IN1 del módulo 1 (Central)
    in1_mod1 = io_state[1]["inputs"][0]  # índice 0 → IN1

    if not in1_mod1:
        return  # no hay nada que hacer

    # Si IN1 está activo → activar OUT5 y OUT6 de módulo 2 y 3
    for board_id in (2, 3):
        client = clients.get(board_id)
        if not client or not client.is_socket_open():
            continue  # en implementación real: registrar error/evento

        reg_out5 = REG_OUTPUT_START + (5 - 1)  # OUT5
        reg_out6 = REG_OUTPUT_START + (6 - 1)  # OUT6

        # Activar OUT5
        client.write_register(
            address=reg_out5,
            value=CMD_OPEN,  # 0x0100 = ON
            device_id=BOARDS_CONFIG[board_id]["slave_id"],
        )

        # Activar OUT6
        client.write_register(
            address=reg_out6,
            value=CMD_OPEN,
            device_id=BOARDS_CONFIG[board_id]["slave_id"],
        )

        # Actualizar cache local de salidas
        io_state[board_id]["outputs"][5 - 1] = True
        io_state[board_id]["outputs"][6 - 1] = True
```

### Cómo usar este ejemplo para definir el resto de actuaciones

Para cada actuación del Excel (`250923_ACTUACIONES.xlsx`) necesitaremos rellenar, como mínimo:

- **Entradas que disparan:** módulo, número de IN y condición (flanco, nivel, combinación de varias).
- **Salidas a actuar:** módulo(s), número de OUT, si se activan, desactivan o se pulsan durante X segundos.
- **Condiciones adicionales:** modo activo, estado de otras entradas/salidas (esclusa, alarma, llaves, etc.).
- **Temporizaciones/enclavamientos:** cuánto dura la activación, qué actuaciones se anulan entre sí, prioridades.

Con ese formato podremos ir trasladando fila a fila las actuaciones a reglas similares a la del ejemplo, siempre reutilizando la misma forma de acceder a entradas (`io_state[mod]["inputs"][idx]`) y salidas (`write_register` sobre `REG_OUTPUT_START` o `REG_OUTPUT_BITS`).

---

## Detalle técnico del acceso Modbus en el PoC

Esta sección resume cómo el PoC accede a las entradas y salidas del ETD8A12 “en crudo”, para tenerlo a mano cuando definamos actuaciones.

### 1. Constantes Modbus usadas en el PoC

Tomadas de `server.py` del PoC:

```python
CMD_OPEN      = 0x0100   # Activar relé individual (salida ON)
CMD_CLOSE     = 0x0200   # Desactivar relé individual (salida OFF)
CMD_OPEN_ALL  = 0x0700   # Activar todos los relés
CMD_CLOSE_ALL = 0x0800   # Desactivar todos los relés

REG_OUTPUT_START = 0x0000   # Registros de salida: 0x0000 - 0x000B (12 canales)
REG_OUTPUT_BITS  = 0x0070   # Registro bitmask de salidas
REG_INPUT_START  = 0x0080   # Registros de entrada: 0x0080 - 0x008B (12 canales)
REG_INPUT_BITS   = 0x00C0   # Registro bitmask de entradas

REG_IN_OUT_RELATION = 0x00FA  # 0x0000 = IN y OUT sin relación (control exclusivo desde PC)
MODBUS_PORT         = 5000
MODBUS_TIMEOUT      = 3
SLAVE_ID            = 1
```

Idea clave:

- **OUTN** (N = 1..12) → registro `0x0000 + (N - 1)` (`REG_OUTPUT_START + (N-1)`).
- **INN** (N = 1..12) → registro `0x0080 + (N - 1)` (`REG_INPUT_START + (N-1)`).
- Bitmask de salidas en `0x0070` (12 bits → OUT1..OUT12).
- Bitmask de entradas en `0x00C0` (similar idea, si se usa).
- `0x00FA` a `0x0000` desactiva la relación hardware IN→OUT para que la lógica viva en Python.

### 2. Estado global en memoria en el PoC

En `server.py`:

```python
BOARDS_CONFIG: Dict[int, dict] = {
    1: {"name": "Placa 1 — Central",       "host": "192.168.0.10", "port": MODBUS_PORT, "slave_id": SLAVE_ID},
    2: {"name": "Placa 2 — Puerta Calle",  "host": "192.168.0.11", "port": MODBUS_PORT, "slave_id": SLAVE_ID},
    3: {"name": "Placa 3 — Puerta Oficina","host": "192.168.0.12", "port": MODBUS_PORT, "slave_id": SLAVE_ID},
}

clients: Dict[int, Optional[ModbusTcpClient]] = {1: None, 2: None, 3: None}

io_state: Dict[int, dict] = {
    i: {
        "connected": False,
        "outputs": [False] * 12,  # OUT1..OUT12
        "inputs":  [False] * 12,  # IN1..IN12
        "last_update": None,
        "error": None,
    }
    for i in range(1, 4)
}
```

Uso típico:

- `io_state[1]["inputs"][0]` → IN1 del módulo 1 (Central).
- `io_state[2]["outputs"][4]` → OUT5 del módulo 2 (índice 4 = 5-1).
- `io_state[3]["connected"]` → si el módulo 3 está conectado.

### 3. Conexión y configuración inicial de una placa

En `_connect_board(board_id)`:

- Crea `ModbusTcpClient(host, port, timeout)`.
- Llama a `client.connect()`.
- Si conecta:
  - Marca `io_state[board_id]["connected"] = True`.
  - Escribe en `REG_IN_OUT_RELATION` (0x00FA) el valor `0x0000`:

```python
result = client.write_register(
    address=0x00FA, value=0x0000, device_id=cfg["slave_id"]
)
```

Esto desactiva que las entradas activen salidas de forma autónoma en la placa, para que el control esté 100% en el software.

### 4. Lectura de entradas y salidas (polling)

En `_read_all_io(board_id)`:

```python
res_out = client.read_holding_registers(
    address=REG_OUTPUT_START, count=12, device_id=slave
)
if not res_out.isError():
    io_state[board_id]["outputs"] = [
        bool(res_out.registers[i]) for i in range(12)
    ]

res_in = client.read_holding_registers(
    address=REG_INPUT_START, count=12, device_id=slave
)
if not res_in.isError():
    io_state[board_id]["inputs"] = [
        bool(res_in.registers[i]) for i in range(12)
    ]
```

- Cada registro vale 0 o 1 → se mapea a `False`/`True` en las listas `outputs` e `inputs`.
- Esta función se llama periódicamente desde una tarea asíncrona (`polling_loop`) cada ~500 ms en el PoC.

### 5. Escritura de salidas

#### 5.1 Canal individual

Endpoint `POST /boards/{board_id}/output`:

```python
register = REG_OUTPUT_START + (action.channel - 1)
value = CMD_OPEN if action.state else CMD_CLOSE

result = client.write_register(
    address=register,
    value=value,
    device_id=cfg["slave_id"],
)
io_state[board_id]["outputs"][action.channel - 1] = action.state
```

- Canal N → registro `0x0000 + (N-1)`.
- ON = `CMD_OPEN` (0x0100), OFF = `CMD_CLOSE` (0x0200).

#### 5.2 Todas las salidas ON/OFF

```python
# Todas ON
client.write_register(
    address=REG_OUTPUT_START, value=CMD_OPEN_ALL, device_id=cfg["slave_id"]
)

# Todas OFF
client.write_register(
    address=REG_OUTPUT_START, value=CMD_CLOSE_ALL, device_id=cfg["slave_id"]
)
```

#### 5.3 Bitmask de salidas

Endpoint `POST /boards/{board_id}/outputs/bitmask`:

```python
bitmask = 0
for ch in action.channels_on:   # p.ej. [1, 3, 5]
    bitmask |= (1 << (ch - 1))

result = client.write_register(
    address=REG_OUTPUT_BITS, value=bitmask, device_id=cfg["slave_id"]
)

for i in range(12):
    io_state[board_id]["outputs"][i] = bool((bitmask >> i) & 1)
```

- Construye un entero donde cada bit 0..11 representa OUT1..OUT12.
- Escribe ese entero en el registro `0x0070` (`REG_OUTPUT_BITS`).
- Actualiza la cache `io_state[board_id]["outputs"]`.

---

Con todo esto, cuando definamos actuaciones del tipo:

- “Si INx de módulo y **se activa**, entonces OUTa/OUTb de módulo(s) p y q **se ponen a 1** durante N segundos…”

ya sabemos exactamente:

- Cómo leer `INx` → `io_state[mod]["inputs"][x-1]`.
- Cómo escribir `OUTa`/`OUTb` → `write_register` en `REG_OUTPUT_START + (canal-1)` con `CMD_OPEN`/`CMD_CLOSE`, o bien usando bitmask en `REG_OUTPUT_BITS`.
