# Modelo de datos – Sistema de Control de Accesos

Referencia: `alcance.md` (§4.2.1, §6.4).  
Objetivo: definir las entidades y relaciones para la base de datos SQLite (estado, configuración, histórico 180 días, auditoría).

---

## 1. Resumen

- **Motor:** SQLite (alcance).
- **Contenido principal:** Estado del sistema (modo activo, snapshot de I/O si se desea); configuración (horarios, festivos, tiempos, IPs de módulos); eventos (histórico 180 días); usuarios y auditoría de la interfaz web.
- **Retención:** Eventos y auditoría: 180 días; el resto según necesidad (configuración persistente, estado último).

---

## 2. Entidades principales

### 2.1 Modo operativo (catálogo fijo)

**Tabla (opcional):** `operational_modes`

Los 7 modos son fijos según alcance; no es obligatorio modelarlos como tabla si se codifican en aplicación. Si se quiere en BD:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | 1–7 |
| name | TEXT | AUTOMÁTICO, ESCLUSA, EXTENDIDO, AUTOSERVICIO, CERRADO, CARGA CAJERO, MANUAL |
| description | TEXT | Descripción corta |

---

### 2.2 Estado del sistema (persistencia cada 60 s)

**Tabla:** `system_state`

Almacena el último estado conocido para recuperación al reinicio.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | Siempre 1 (singleton) |
| current_mode_id | INTEGER | Modo activo (1–7) |
| state_json | TEXT | JSON con snapshot opcional de entradas/salidas por placa, estado de puertas, etc. |
| updated_at | TEXT (ISO 8601) | Última actualización |

---

### 2.3 Eventos (histórico 180 días)

**Tabla:** `events`

Registro de todos los eventos del sistema (cambios de modo, aperturas, alarmas, fallos, accesos). Retención 180 días; exportación CSV (alcance).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | TEXT PK | UUID o identificador único |
| timestamp | TEXT (ISO 8601) | Fecha/hora del evento |
| type | TEXT | mode_change, door_open, alarm, failure, access, config_change, … |
| detail | TEXT | Descripción legible (ej. "AUTOMÁTICO → ESCLUSA") |
| source | TEXT | system, tablet, web, modbus |
| board_id | INTEGER NULL | Módulo afectado (1–3) si aplica |
| extra_json | TEXT NULL | Datos adicionales en JSON |

Índices recomendados: `timestamp`, `type`, `(timestamp, type)` para consultas filtradas y purga por antigüedad.

---

### 2.4 Configuración de horarios (franjas por modo)

**Tabla:** `schedule_slots`

Define las franjas horarias en las que cada modo está activo (cambio automático por horario).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | |
| mode_id | INTEGER | 1–7 |
| day_of_week | INTEGER | 0=Dom, 1=Lun, …, 6=Sab (o rango) |
| start_time | TEXT | Hora inicio "HH:MM" |
| end_time | TEXT | Hora fin "HH:MM" |
| priority | INTEGER | Orden de prioridad si se solapan |
| enabled | INTEGER (bool) | 1 activo, 0 desactivado |
| created_at, updated_at | TEXT | Auditoría |

Alternativa: una sola fila por “programación diaria” con JSON que describa las franjas (más flexible, menos normalizado). La tabla anterior es un esquema posible; el diseño definitivo puede ajustarse al formato de la interfaz web.

---

### 2.5 Festivos (calendario)

**Tabla:** `holidays`

Festivos bancarios (nacional/autonómico) y días especiales.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | |
| date | TEXT | Fecha "YYYY-MM-DD" |
| name | TEXT | Nombre del festivo |
| scope | TEXT | nacional, autonómico, oficina |
| created_at | TEXT | Auditoría |

Índice en `date` para consultas por día.

---

### 2.6 Tiempos (retardos y pulsos)

**Tabla:** `config_timings`

Parámetros configurables: pulsos de apertura (ej. 5 s), retardos, etc.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| key | TEXT PK | Ej. "pulse_open_seconds", "delay_after_radar" |
| value | TEXT o REAL | Valor (guardar como string y parsear en app, o tipo numérico) |
| unit | TEXT | s, ms, … |
| updated_at | TEXT | Última modificación |

Alternativa: tabla clave-valor genérica `config` para todos los parámetros (horarios podrían ser otro tipo de clave con valor JSON).

---

### 2.7 Configuración de módulos ETD8A12

**Tabla:** `boards_config`

IP, puerto y slave_id de cada uno de los 3 módulos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| board_id | INTEGER PK | 1, 2, 3 |
| name | TEXT | "Central", "Puerta Calle", "Puerta Oficina" |
| host | TEXT | IP |
| port | INTEGER | Puerto Modbus TCP (ej. 5000) |
| slave_id | INTEGER | ID esclavo Modbus |
| updated_at | TEXT | Auditoría |

---

### 2.8 Usuarios (interfaz web)

**Tabla:** `users`

Usuarios que pueden autenticarse (Basic Auth o login web) para API e interfaz. Contraseñas con hash bcrypt (alcance).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | |
| username | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| role | TEXT | admin, operator, viewer (ejemplo) |
| active | INTEGER (bool) | 1 activo, 0 desactivado |
| created_at, updated_at | TEXT | Auditoría |

---

### 2.9 Auditoría de acciones web

**Tabla:** `audit_log`

Registro de accesos y cambios de configuración desde la interfaz web (alcance).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER PK | |
| timestamp | TEXT (ISO 8601) | |
| user_id | INTEGER FK | Quién realizó la acción |
| action | TEXT | login, logout, config_update, schedule_update, … |
| resource | TEXT | schedules, holidays, boards, … |
| detail | TEXT NULL | Descripción opcional |
| ip_address | TEXT NULL | IP del cliente (opcional) |

Retención: 180 días (misma política que eventos) o según criterio.

---

## 3. Diagrama de relaciones (resumen)

```
system_state (1 fila)
  └── current_mode_id → operational_modes(id) o constante 1–7

events
  └── board_id → boards_config(board_id) opcional

schedule_slots
  └── mode_id → modo 1–7 (u operational_modes)

holidays
  └── (independiente)

config_timings
  └── (clave-valor)

boards_config
  └── board_id 1, 2, 3

users
  └── (independiente)

audit_log
  └── user_id → users(id)
```

No se detallan aquí FKs en SQLite (pueden aplicarse a nivel de aplicación si se desea).

---

## 4. Políticas de purga

- **Eventos:** Borrar (o archivar) registros con `timestamp` anterior a 180 días. Tarea programada diaria o al arranque.
- **Auditoría:** Igual criterio si se aplica retención 180 días.
- **Estado:** Solo se mantiene la última fila (id=1).
- **Configuración:** Sin purga automática; solo borrado por acción del usuario (ej. festivo eliminado).

---

## 5. Exportación CSV (alcance)

La exportación de histórico (`GET /api/events/export`) leerá de la tabla `events` con los mismos filtros que `GET /api/events` (rango de fechas, tipo) y generará CSV con columnas: id, timestamp, type, detail, source, board_id (y opcionalmente campos de extra_json).

---

## 6. Documentos relacionados

- **Alcance:** `alcance.md`
- **Arquitectura:** `ARQUITECTURA.md`
- **API:** `API_SPEC.md`
- **Subtasks:** `GUIA_SUBTASKS.md`
