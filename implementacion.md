# Implementacion backend (panel + API v1)

Este documento resume el comportamiento actual para operar y ajustar rapidamente el sistema.

## 1) Comportamiento de conexion de placas

### Transporte Modbus configurable: TCP o RS-485 (RTU)
- El backend ahora soporta dos modos de transporte:
  - `MODBUS_MODE=tcp` (comportamiento anterior)
  - `MODBUS_MODE=rtu` (bus RS-485 compartido)
- En `rtu`:
  - Se usa un único puerto serial (`MODBUS_SERIAL_PORT`, por ejemplo `COM7`).
  - Las 3 placas se diferencian por `slave_id` (1/2/3 en nuestro despliegue).
  - `host/port` de cada módulo se conservan en BD por compatibilidad, pero no se usan para la conexión física.
  - La desconexión manual de una placa cierra el bus RTU completo (mismo puerto compartido).

### Variables de entorno para RS-485 (RTU)
- `MODBUS_MODE=rtu`
- `MODBUS_SERIAL_PORT=COM7`
- `MODBUS_SERIAL_BAUDRATE=9600`
- `MODBUS_SERIAL_BYTESIZE=8`
- `MODBUS_SERIAL_PARITY=N`
- `MODBUS_SERIAL_STOPBITS=1`
- `MODBUS_TIMEOUT` (ya existente) también aplica a RTU.

### Volver a TCP (rollback)
- Para volver al comportamiento anterior por Ethernet/Modbus TCP:
  1. Configurar `MODBUS_MODE=tcp`
  2. Reiniciar el backend
  3. Verificar que cada módulo tenga `host/port` correctos en `/api/panel/modules`
- No requiere cambios de base de datos ni migraciones.

### `GET /api/panel/status`
- Por defecto **NO** intenta autoevaluar reglas ni reconectar placas caidas.
- Solo refresca I/O de placas que ya estan marcadas como `connected=true`.
- Nuevo parametro opcional:
  - `run_auto_rules=false` (default)
  - `run_auto_rules=true` -> ejecuta `_evaluate_auto_rules()` y puede provocar intentos de conexion si las reglas requieren leer hardware.

### Por que aparecian timeouts a `192.168.1.101`
- No venian del endpoint de eventos.
- Venian de la autoevaluacion de reglas durante `status`.
- Si una regla tiene `trigger`/`blocked_if_active` en placa 1 y no hay override, el backend intenta leer hardware y conecta esa placa.

### Como cambiar este comportamiento
- Si no quieres reconexion automatica:
  - Consumir `GET /api/panel/status` sin parametro, o con `?run_auto_rules=false`.
- Si quieres ejecutar reglas automaticas bajo demanda:
  - Llamar `GET /api/panel/status?run_auto_rules=true`.
- Si quieres forzar conexion manual:
  - `POST /api/panel/boards/{board_id}/connect`
  - `POST /api/panel/boards/{board_id}/disconnect`

### Diagnostico RS-485 (RTU)
- Nuevo endpoint:
  - `GET /api/panel/diagnostics/rtu-ping`
- Uso:
  - Sin parametros: prueba los `slave_id` definidos en BD.
  - Con `slave_ids`: prueba una lista concreta (`?slave_ids=1,2,3`).
  - Con `board_id`: usa el registro de probe del modulo indicado (`?board_id=2`).
  - Con `retries`: cantidad de reintentos por slave (`?retries=3`, max 5).
  - Con `timeout_s`: timeout por intento en segundos (`?timeout_s=1.5`, rango 0.2..5.0).
- Ejemplos:
  - `GET /api/panel/diagnostics/rtu-ping`
  - `GET /api/panel/diagnostics/rtu-ping?slave_ids=1,2,3&retries=2&timeout_s=1.0`
- Requisito:
  - Solo funciona con `MODBUS_MODE=rtu`; si estas en TCP devuelve 400.
  - Usa un cliente serial temporal de diagnostico para no quedar bloqueado por operaciones del bus principal.

## 2) API v1 (tablet/integraciones) con JWT

Prefijo base: `/api/v1`

### Rutas
- `POST /auth/register` (sin bearer; alta de usuario)
- `POST /auth/token` (sin bearer; login y devolucion JWT)
- `GET /modes` (bearer requerido)
- `GET /get_mode` (bearer requerido)
- `POST /set_mode` (bearer requerido)

### Seguridad y alta de usuarios
- Usuarios en tabla SQLite: `tablet_api_users`.
- Password hash con bcrypt (`passlib`).
- Token JWT HS256 (`python-jose`).
- Variables de entorno:
  - `TABLET_JWT_SECRET`
  - `TABLET_JWT_EXPIRE_MINUTES`
  - `TABLET_SETUP_TOKEN`

Reglas de alta (`POST /auth/register`):
- Si `TABLET_SETUP_TOKEN` esta vacio:
  - Solo se permite crear el primer usuario sin cabecera extra.
  - Para usuarios adicionales, debes definir `TABLET_SETUP_TOKEN`.
- Si `TABLET_SETUP_TOKEN` esta definido:
  - Toda alta requiere cabecera `X-Tablet-Setup-Token` con ese valor.

## 3) Flujo recomendado de llamadas

## 3.1 Registrar usuario
```bash
curl -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"tablet01\",\"password\":\"Cambiar123!\"}"
```

Si ya existe setup token:
```bash
curl -X POST "http://localhost:8000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-Tablet-Setup-Token: TU_SETUP_TOKEN" \
  -d "{\"username\":\"tablet02\",\"password\":\"Cambiar123!\"}"
```

## 3.2 Obtener token JWT
```bash
curl -X POST "http://localhost:8000/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=tablet01&password=Cambiar123!"
```

Respuesta esperada:
```json
{
  "access_token": "....",
  "token_type": "bearer"
}
```

Guardar el token en variable (`TOKEN`) y usarlo en el resto.

## 3.3 Listar modos disponibles
```bash
curl -X GET "http://localhost:8000/api/v1/modes" \
  -H "Authorization: Bearer TOKEN"
```

Devuelve claves leidas desde `backend/data/panel_rules.json`:
- `key`
- `enabled`
- `type`
- `auto_execute`

## 3.4 Consultar modo actual
```bash
curl -X GET "http://localhost:8000/api/v1/get_mode" \
  -H "Authorization: Bearer TOKEN"
```

Respuesta:
```json
{ "current_mode": "mi_modo" }
```
o
```json
{ "current_mode": null }
```

## 3.5 Activar/desactivar modo o tocar salida

Activar modo:
```bash
curl -X POST "http://localhost:8000/api/v1/set_mode" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"set_rule\",\"rule_key\":\"horario_automatico\",\"active\":true}"
```

Si la regla queda bloqueada por `blocked_if_active`, devuelve `409` con razón explícita:
```json
{
  "detail": {
    "message": "No se pudo activar el modo horario_automatico",
    "reason": "Bloqueado por entradas activas: IN_02_11",
    "blocked_inputs": ["IN_02_11"]
  }
}
```

Desactivar modo (solo lo limpia si es el activo):
```bash
curl -X POST "http://localhost:8000/api/v1/set_mode" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"set_rule\",\"rule_key\":\"horario_automatico\",\"active\":false}"
```

Encender/apagar una salida:
```bash
curl -X POST "http://localhost:8000/api/v1/set_mode" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"set_output\",\"code\":\"OUT_01_03\",\"on\":true}"
```

Alternativa con `value`:
```json
{"action":"set_output","code":"OUT_01_03","value":1}
```

## 4) Archivos clave
- `backend/app/api/routes/panel.py`
- `backend/app/api/routes/tablet_v1.py`
- `backend/app/api/deps_tablet.py`
- `backend/app/db/tablet_users_store.py`
- `backend/app/services/tablet_jwt.py`
- `backend/app/core/config.py`
- `backend/.env.example`

## 5) Integracion desde React (token bearer)

Para `POST /api/v1/auth/token`, el backend espera `application/x-www-form-urlencoded`.
No usar query params para `username` y `password`.

Ejemplo con `fetch`:

```js
async function login(username, password) {
  const body = new URLSearchParams();
  body.append("username", username);
  body.append("password", password);

  const res = await fetch("/api/v1/auth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Error de autenticacion");
  }

  return res.json(); // { access_token, token_type }
}
```

Guardar token y usarlo en endpoints protegidos:

```js
const { access_token } = await login("ceroideas", "12345678");
localStorage.setItem("tablet_token", access_token);
```

Helper para llamadas autenticadas:

```js
async function apiV1(path, options = {}) {
  const token = localStorage.getItem("tablet_token");
  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

Ejemplo:

```js
const mode = await apiV1("/get_mode");
```