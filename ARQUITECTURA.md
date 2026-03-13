# Arquitectura del sistema – Control de Accesos

Referencia: `alcance.md` (Banco Santander / SAIMA SEGURIDAD).  
Objetivo: definir la arquitectura del sistema local y la preparación para integración futura con COCE.

---

## 1. Visión general

El sistema se organiza en **tres capas**: interfaz de usuario (tablet), lógica de control (PC con servicio Python) y hardware de E/S (módulos ETD8A12). Todas las comunicaciones en red local son por Ethernet; el PC es el único elemento que habla tanto con la tablet (API REST) como con los módulos (Modbus TCP/IP).

---

## 2. Capas del sistema

### Capa 1: Interfaz de usuario

| Elemento | Descripción |
|----------|-------------|
| **Dispositivo** | Tablet Android Akuvox C319S (proporcionada por el cliente). |
| **Función** | Selección de modo operativo, visualización del estado del sistema en tiempo real. |
| **Desarrollo** | App Android en paralelo (fuera del alcance de este proyecto). |
| **Comunicación** | Cliente de la API REST expuesta por el PC (HTTPS, Basic Auth). |

### Capa 2: Lógica de control (este proyecto)

| Elemento | Descripción |
|----------|-------------|
| **Plataforma** | PC Industrial con Windows IoT, montaje en rack. |
| **Software** | Servicio Windows que ejecuta una aplicación Python. |
| **Responsabilidades** | Implementar las 33 actuaciones; gestionar los 7 modos operativos con exclusión mutua; aplicar horarios y calendario; exponer API REST para la tablet; servir la interfaz web de configuración; persistir estado y histórico en SQLite (180 días); comunicarse con los 3 ETD8A12 por Modbus TCP/IP. |
| **Persistencia** | Estado del sistema cada 60 s; recuperación al reinicio; watchdog y recuperación ante fallos (&lt;30 s). |

### Capa 3: Hardware de E/S

| Módulo | Rol | Entradas (12) | Salidas (12) |
|--------|-----|----------------|--------------|
| **ETD8A12 #1 – Central** | Señalización y control general | Horarios por modo (IN1–IN7), COCE (IN8), Incendio (IN9), Alarma (IN10), Presencia zaguán (IN11), Apertura remota calle (IN12) | Alarma zaguán, locuciones (OUT1–OUT4), reservadas (OUT5–12) |
| **ETD8A12 #2 – Puerta Calle** | Sensores y motorización puerta calle | Radares, inductivos, pulsadores, llamadas, bloqueo zaguán, ICR2, llave emergencia | EMICOM (llave echada, emergencias, anulaciones, orden apertura), reservadas |
| **ETD8A12 #3 – Puerta Oficina** | Sensores y motorización puerta oficina | Misma distribución lógica que Módulo 2 |

Detalle físico de entradas/salidas: `alcance.md` Anexo B y documento `ENTRADAS_Y_SALIDAS.xlsx`.

---

## 3. Comunicaciones

```
┌─────────────────┐         HTTPS (Basic Auth, <500 ms)         ┌─────────────────────────────┐
│  Tablet Android │ ◄──────────────────────────────────────────► │  PC Industrial (Windows IoT) │
│  Akuvox C319S   │         API REST (modo, estado, eventos)      │  Servicio Python             │
└─────────────────┘                                              │  API REST + Web config       │
                                                                  │  SQLite (estado + 180 días)  │
                                                                  └──────────────┬───────────────┘
                                                                                 │
                                                                                 │ Modbus TCP/IP (Ethernet)
                                                                                 │ IPs estáticas, <300 ms
                                                                                 │ Ciclo lectura <100 ms
                                                                                 ▼
                                                                  ┌──────────────┴───────────────┐
                                                                  │  Switch Ethernet (red local) │
                                                                  └──────────────┬───────────────┘
                                                    ┌─────────────────────────────┼─────────────────────────────┐
                                                    ▼                             ▼                             ▼
                                          ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
                                          │ ETD8A12 #1      │           │ ETD8A12 #2      │           │ ETD8A12 #3      │
                                          │ Central         │           │ Puerta Calle    │           │ Puerta Oficina  │
                                          └─────────────────┘           └─────────────────┘           └─────────────────┘
```

| Origen | Destino | Protocolo | Medio | Notas |
|--------|---------|-----------|------|--------|
| Tablet | PC | API REST HTTPS | Ethernet | Basic Auth, tiempo respuesta &lt;500 ms (p95). |
| Navegador (operador) | PC | HTTP/HTTPS | Ethernet | Interfaz web de configuración. |
| PC | ETD8A12 1, 2, 3 | Modbus TCP/IP | Ethernet | IPs estáticas; activación salidas &lt;300 ms; ciclo lectura 36 entradas &lt;100 ms. |

Opcional (si se confirma): acceso al PC o a los ETD8A12 desde fuera de la red local vía **ZeroTier** u otra VPN; el diseño de la API y Modbus no cambia, solo la topología de red (documentar en `RED_Y_ACCESO_REMOTO.md`).

---

## 4. Flujo de datos resumido

1. **Tablet → PC:** Peticiones a la API (cambio de modo, consulta de estado, histórico). El PC valida Basic Auth y aplica la lógica de negocio.
2. **PC → ETD8A12:** Ciclo periódico de lectura de entradas (objetivo &lt;100 ms para las 36 entradas); escritura de salidas según las 33 actuaciones y el modo activo.
3. **PC → SQLite:** Persistencia del estado (modo activo, estado de puertas, etc.) cada 60 s; registro de todos los eventos (cambios de modo, aperturas, alarmas, fallos, accesos) con retención 180 días.
4. **Operador → PC:** Uso de la interfaz web para horarios, calendario de festivos, tiempos (retardos, pulsos), IPs de los ETD8A12 y gestión de usuarios; todo persistido en configuración/BD.

---

## 5. Persistencia: tablas SQLite (nombres)

La base de datos SQLite en el PC utiliza las siguientes tablas. Detalle de campos y relaciones en `MODELO_DATOS.md`.

| Tabla | Contenido |
|-------|-----------|
| **system_state** | Estado actual del sistema (singleton): modo activo, snapshot opcional de I/O; persistido cada 60 s. |
| **events** | Histórico de eventos (cambios de modo, aperturas, alarmas, fallos, accesos). Retención 180 días. |
| **schedule_slots** | Franjas horarias por modo (cambio automático por horario). |
| **holidays** | Calendario de festivos (nacional, autonómico, oficina). |
| **config_timings** | Parámetros de tiempos (retardos, pulsos, ej. apertura 5 s). |
| **boards_config** | Configuración de los 3 módulos ETD8A12: IP, puerto, slave_id, nombre. |
| **users** | Usuarios de la interfaz web (login, hash bcrypt, rol). |
| **audit_log** | Auditoría de acciones en la web (quién, qué, cuándo). Retención 180 días. |

Opcional (catálogo en BD): **operational_modes** — los 7 modos (id, name, description); si no se usa tabla, los modos se codifican en aplicación.

---

## 6. Preparación para COCE (fase 2, fuera de alcance actual)

La arquitectura debe permitir una futura integración con el Centro de Control (COCE) **sin rediseñar el núcleo**:

- **Eventos:** El histórico de eventos (cambios de modo, aperturas, alarmas, fallos) ya se almacena en SQLite; en fase 2 se podrá añadir un componente que envíe eventos a COCE (protocolo a definir).
- **Comandos remotos:** Las entradas IN8 (Apertura Remota COCE Oficina) e IN12 (Apertura Remota Calle) en el módulo Central ya contemplan actuaciones 31–32 (Anexo A); la lógica de actuaciones puede exponer puntos de extensión para comandos remotos sin cambiar la arquitectura de capas.
- **Monitorización:** Los endpoints de estado (`/api/status`, `/api/doors`, etc.) pueden ser consumidos por un agente o gateway que reporte a COCE.
- **Configuración remota:** La configuración (horarios, calendario, IPs) se gestiona vía API/interfaz web; en fase 2 se podría añadir un canal seguro para actualización remota desde COCE.

No se implementa en este proyecto: envío a COCE, recepción de comandos desde COCE ni actualización remota; solo se deja el diseño preparado (datos, endpoints, entradas de hardware ya definidas).

---

## 7. Decisiones de arquitectura

| Decisión | Justificación |
|----------|----------------|
| Servicio Windows en PC industrial | Alcance contractual; auto-inicio y recuperación ante fallos. |
| SQLite como única BD | Alcance; sin dependencia de servidor externo; adecuado para un solo nodo y histórico local. |
| API REST con Basic Auth | Alcance; compatibilidad con tablet y futuros consumidores (COCE). |
| Modbus TCP/IP (no RTU) | Alcance; Ethernet, IPs estáticas, menor complejidad de cableado. |
| Estado persistido cada 60 s | Alcance; recuperación al reinicio sin pérdida del modo y estado coherente. |
| Tres módulos ETD8A12 fijos | Alcance; distribución Central / Puerta Calle / Puerta Oficina. |

---

## 8. Documentos relacionados

- **Alcance:** `alcance.md`
- **Subtasks y orden de trabajo:** `GUIA_SUBTASKS.md`
- **API:** `API_SPEC.md`
- **Modelo de datos:** `MODELO_DATOS.md`
- **Registros Modbus ETD8A12:** `ETD8A12_MODBUS.md` (por crear en Subtask 7)
- **Acceso remoto (opcional):** `RED_Y_ACCESO_REMOTO.md` (si se usa ZeroTier)
