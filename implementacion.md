# Implementacion backend (panel + API v1)

Este documento resume el comportamiento actual para operar y ajustar rapidamente el sistema.

## 1) Comportamiento de conexion de placas

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