# Especificación de la API REST – Sistema de Control de Accesos

Referencia: `alcance.md` (§4.2.2, §8.1).  
Uso: tablet Android, interfaz web de configuración y, en fase 2, integración con COCE.

---

## 1. General

| Aspecto | Especificación |
|---------|----------------|
| **Protocolo** | HTTPS (TLS 1.2+). Certificado autofirmado aceptable en red local. |
| **Autenticación** | HTTP Basic Auth. Credenciales configuradas en el sistema; usuarios web con hash bcrypt (gestión vía interfaz/API de config). |
| **Formato** | JSON en request/response (Content-Type: `application/json`). |
| **Tiempo de respuesta** | &lt;500 ms percentil 95 (alcance). |
| **Documentación** | Swagger/OpenAPI 3.0 generada y actualizada con el código. |
| **Prefijo** | Todas las rutas de la API bajo `/api` (ej. `/api/status`). |

---

## 2. Endpoints de estado (para tablet e integraciones)

### 2.1 Estado global del sistema

**GET /api/status**

Devuelve el estado general del sistema: salud, modo activo, conectividad con los módulos ETD8A12, timestamp.

**Respuesta 200:**

```json
{
  "status": "running",
  "current_mode": "AUTOMATICO",
  "mode_id": 1,
  "boards_connected": 3,
  "boards_total": 3,
  "last_state_save": "2026-03-12T10:30:00Z",
  "timestamp": "2026-03-12T10:30:05Z"
}
```

---

### 2.2 Estado de puertas / módulos

**GET /api/doors**

Devuelve el estado de las “puertas” (por módulo ETD8A12 o por puerta lógica Calle/Oficina): conexión del módulo, entradas y salidas relevantes (resumidas o completas según diseño).

**Respuesta 200:**

```json
{
  "doors": [
    {
      "id": "calle",
      "board_id": 2,
      "connected": true,
      "inputs": { "radar_interior": false, "radar_exterior": false, "puerta_abierta": false },
      "outputs": { "orden_apertura": false }
    },
    {
      "id": "oficina",
      "board_id": 3,
      "connected": true,
      "inputs": { "radar_interior": false, "radar_exterior": false, "puerta_abierta": false },
      "outputs": { "orden_apertura": false }
    }
  ],
  "timestamp": "2026-03-12T10:30:05Z"
}
```

*(Nombres de campos de inputs/outputs alineados con Anexo B de `alcance.md`; se pueden exponer también los 12 IN/12 OUT crudos por placa si se define un endpoint adicional, p. ej. `/api/boards/{id}/io`.)*

---

### 2.3 Modos operativos disponibles y activo

**GET /api/modes**

Lista los 7 modos y cuál está activo.

**Respuesta 200:**

```json
{
  "current_mode_id": 1,
  "current_mode_name": "AUTOMATICO",
  "modes": [
    { "id": 1, "name": "AUTOMATICO", "description": "Apertura automática por radares..." },
    { "id": 2, "name": "ESCLUSA", "description": "Apertura secuencial..." },
    { "id": 3, "name": "EXTENDIDO", "description": "Horario extendido..." },
    { "id": 4, "name": "AUTOSERVICIO", "description": "Cajeros operativos..." },
    { "id": 5, "name": "CERRADO", "description": "Instalación cerrada..." },
    { "id": 6, "name": "CARGA CAJERO", "description": "Recarga de cajeros..." },
    { "id": 7, "name": "MANUAL", "description": "Control manual..." }
  ],
  "timestamp": "2026-03-12T10:30:05Z"
}
```

---

## 3. Endpoints de control (tablet)

### 3.1 Cambio de modo operativo

**POST /api/mode**

Cambia el modo operativo (exclusión mutua: solo un modo activo).

**Cuerpo (ejemplo):**

```json
{
  "mode_name": "AUTOMATICO"
}
```

**Respuesta 200:**

```json
{
  "mode_id": 2,
  "mode_name": "ESCLUSA",
  "previous_mode_id": 1,
  "message": "Modo cambiado correctamente"
}
```

**Errores:** 400 (mode_id inválido o no permitido por condiciones), 401 (no autenticado), 500 (error interno).

---

## 4. Endpoints de eventos e histórico

### 4.1 Histórico de eventos

**GET /api/events**

Lista eventos con filtros y paginación. Retención 180 días (alcance).

**Query params (todos opcionales):**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `from` | ISO 8601 date/datetime | Fecha/hora inicial |
| `to` | ISO 8601 date/datetime | Fecha/hora final |
| `type` | string | Tipo: `mode_change`, `door_open`, `alarm`, `failure`, `access`, etc. |
| `limit` | int | Máximo de registros (default ej. 100, max ej. 1000) |
| `offset` | int | Desplazamiento para paginación |

**Respuesta 200:**

```json
{
  "total": 42,
  "events": [
    {
      "id": "uuid",
      "timestamp": "2026-03-12T10:25:00Z",
      "type": "mode_change",
      "detail": "AUTOMÁTICO → ESCLUSA",
      "source": "tablet"
    },
    {
      "id": "uuid",
      "timestamp": "2026-03-12T10:24:55Z",
      "type": "door_open",
      "detail": "Puerta calle",
      "source": "system"
    }
  ]
}
```

---

### 4.2 Exportación CSV (alcance)

**GET /api/events/export**

Mismos filtros que `GET /api/events`; respuesta `Content-Type: text/csv` con cabeceras y filas de eventos (para descarga desde la interfaz web).

---

## 5. Endpoints de configuración (interfaz web / administración)

Estos endpoints permiten configurar horarios, calendario de festivos, tiempos (retardos, pulsos), IPs de los ETD8A12 y, si aplica, usuarios. Solo usuarios con permisos de configuración (Basic Auth con rol adecuado o equivalente).

### 5.1 Horarios (franjas por modo)

**GET /api/config/schedules**  
Devuelve la configuración de horarios (franjas horarias por modo).

**PUT /api/config/schedules**  
Actualiza la configuración de horarios. Cuerpo: estructura de franjas (por definir en modelo de datos).

---

### 5.2 Calendario de festivos

**GET /api/config/holidays**  
Lista festivos configurados (nacional/autonómico, fechas).

**POST /api/config/holidays**  
Añade festivo.  
**DELETE /api/config/holidays/{id}**  
Elimina festivo.

---

### 5.3 Tiempos (retardos, pulsos)

**GET /api/config/timings**  
Devuelve retardos y pulsos configurables (ej. pulso apertura 5 s).

**PUT /api/config/timings**  
Actualiza tiempos.

---

### 5.4 Configuración de módulos ETD8A12

**GET /api/config/boards**  
Devuelve IP, puerto y slave_id de los 3 módulos.

**PUT /api/config/boards**  
Actualiza configuración de módulos (IP, puerto, slave_id). Requiere reinicio o recarga de conexiones Modbus para aplicar.

---

### 5.5 Salud del sistema (monitorización)

**GET /api/health**  
Health check ligero para watchdog o balanceadores: estado OK/ERROR, versión, uptime. Sin necesidad de autenticación si se usa solo en red interna (opcional proteger igualmente).

**Respuesta 200:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime_seconds": 3600
}
```

---

## 6. Resumen de rutas

| Método | Ruta | Uso principal |
|--------|------|----------------|
| GET | /api/health | Health check |
| GET | /api/status | Estado global |
| GET | /api/doors | Estado puertas/módulos |
| GET | /api/modes | Modos y activo |
| POST | /api/mode | Cambiar modo |
| GET | /api/events | Histórico (filtros) |
| GET | /api/events/export | Export CSV |
| GET/PUT | /api/config/schedules | Horarios |
| GET/POST/DELETE | /api/config/holidays | Festivos |
| GET/PUT | /api/config/timings | Tiempos |
| GET/PUT | /api/config/boards | IPs ETD8A12 |

La gestión de usuarios/permisos de la interfaz web puede exponerse como **GET/POST/PUT/DELETE /api/config/users** (crear, listar, actualizar, desactivar usuarios con hash bcrypt); detalle en implementación.

---

## 7. Códigos HTTP y errores

- **200** OK con cuerpo según el recurso.
- **400** Bad Request: parámetros inválidos o operación no permitida (ej. cambio de modo no permitido).
- **401** Unauthorized: falta de autenticación o credenciales inválidas.
- **403** Forbidden: usuario sin permiso para la acción.
- **404** Not Found: recurso inexistente.
- **500** Internal Server Error: error no recuperable; cuerpo opcional con `{"detail": "mensaje"}`.

Respuestas de error en JSON con al menos: `{"detail": "descripción"}` (compatible con OpenAPI).

---

## 8. Documentos relacionados

- **Alcance:** `alcance.md`
- **Arquitectura:** `ARQUITECTURA.md`
- **Modelo de datos:** `MODELO_DATOS.md`
- **PoC (referencia de implementación):** `App Control de Puertas/3 Control de Accesos/software prueba_/` (rutas de estado y placas como base para `/api/status`, `/api/doors`, config de boards).
