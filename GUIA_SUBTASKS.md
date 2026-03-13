# Guía de Subtasks – Fase 0 (Marzo)

Objetivo: *Establecer la base técnica definitiva del sistema y preparar el entorno de desarrollo.*

Resultado esperado: *Arquitectura técnica cerrada y base del sistema preparada para el desarrollo.*

---

## Contexto: alcance y software de prueba

- **Alcance oficial:** El documento `alcance.md` define el proyecto completo: 3 módulos ETD8A12 (12 DI + 12 DO cada uno), 7 modos operativos, 33 actuaciones, API REST (HTTPS + Basic Auth), interfaz web de configuración, SQLite con histórico 180 días, servicio Windows con auto-inicio y recuperación. Plataforma objetivo según contrato: **Windows IoT**. Detalles de entradas/salidas por módulo (Central, Puerta Calle, Puerta Oficina) y de las actuaciones están en `alcance.md` y en los anexos referenciados (p. ej. `250923_ACTUACIONES.xlsx`, `ENTRADAS_Y_SALIDAS.xlsx`).
- **Software de prueba:** En `App Control de Puertas/3 Control de Accesos/software prueba_/` hay un prototipo funcional que ya se conecta al ETD8A12 por **Ethernet (Modbus TCP)** desde **Windows**, sin problemas. Incluye:
  - Backend FastAPI + pymodbus (`src/server.py`): conexión a hasta 3 placas, lectura de 12 entradas y 12 salidas por placa, control de salidas (canal, bitmask, all_on/all_off), registro 0x00FA para control exclusivo desde Python, polling en background (~500 ms).
  - Frontend React para panel y configuración.
  - README con instrucciones de uso y comandos Modbus utilizados.
- **Uso de esta base:** Las subtasks siguientes asumen que la comunicación Modbus TCP con ETD8A12 está **probada en Windows**. Lo que queda es integrar esa capa en el producto final, cumplir alcance (3 módulos, 7 modos, 33 actuaciones, API definitiva, web, SQLite, servicio) y, si se confirma, preparar también despliegue en Linux/Ubuntu y acceso remoto vía ZeroTier. Detalle de **qué se aprovecha del PoC** (sin mezclarlo con las subtasks): ver **`APROVECHAMIENTO_POC.md`**.

---

## Resumen: qué hacer y en qué orden

| # | Subtask | Criterio de cierre (resumen) | Estado |
|---|---------|------------------------------|--------|
| 1 | Revisión del alcance funcional | Alcance cerrado y referenciado desde documentación (ej. `alcance.md` + anexos) | Pendiente |
| 2 | Definición de arquitectura (local + COCE) | Diagramas y documento de arquitectura (local + preparación COCE) | Definido → `ARQUITECTURA.md` |
| 3 | Diseño definitivo de la API REST | Especificación API alineada con alcance (status, doors, modes, events, config) | Definido → `API_SPEC.md` |
| 4 | Modelo de datos inicial | Modelo de datos / ER para modos, eventos, configuración, histórico 180 días | Definido → `MODELO_DATOS.md` |
| 5 | Configuración del proyecto backend (Python/FastAPI) | Proyecto base listo (estructura, deps, config por entorno) | Hecho → `backend/` + `frontend/` |
| 6 | Configuración del servicio del sistema local | Servicio Windows (y opcional Linux) documentado e instalable | Pendiente |
| 7 | Comunicación con hardware (Modbus TCP/IP) | Capa ETD8A12 integrada (3 módulos, ciclo &lt;100 ms) + mock para desarrollo | En parte probado (PoC) |
| 8 | Repositorios, entornos y estructura de proyecto | Repo GitHub, estructura y entornos documentados | Pendiente |
| 9 | Inicio del desarrollo del núcleo del sistema | Núcleo mínimo: salud, estado, primer flujo de modos/actuaciones | Pendiente |

---

## Detalle de cada subtask

### 1. Revisión completa del alcance funcional
**Qué hacer:** Tomar como referencia `alcance.md` y cerrar con el equipo la lista de funcionalidades para piloto y producción: 7 modos operativos, 33 actuaciones (Anexo A / `250923_ACTUACIONES.xlsx`), distribución de 36 entradas y 36 salidas en 3 ETD8A12 (Anexo B / `ENTRADAS_Y_SALIDAS.xlsx`), API REST, interfaz web, histórico 180 días, requisitos no funcionales (disponibilidad, latencias, seguridad).

**Entregable:** Alcance formalmente aceptado y referenciado (p. ej. `alcance.md` como fuente de verdad + índice de anexos en `documentacion.md` o `ALCANCE_FUNCIONAL.md`). Criterio de cierre: no hay dudas abiertas sobre qué está dentro/fuera del proyecto.

---

### 2. Definición final de arquitectura (sistema local + COCE)
**Qué hacer:** Definir y dibujar la arquitectura según `alcance.md`:
- **Capa 1:** Tablet Android (Akuvox C319S) — desarrollo paralelo.
- **Capa 2:** PC Industrial Windows IoT con servicio Python: lógica de control, API REST, interfaz web, SQLite.
- **Capa 3:** 3 módulos ETD8A12 (Central, Puerta Calle, Puerta Oficina) vía Modbus TCP/IP.
Incluir comunicaciones (Tablet ↔ PC, PC ↔ ETD8A12), y cómo se prepara la futura integración con COCE (sin implementarla aún).

**Entregable:** `ARQUITECTURA.md` con diagramas y decisiones. Opcional: diagrama de despliegue con ZeroTier si el acceso remoto al ETD8A12 está confirmado.

---

### 3. Diseño definitivo de la API REST del sistema local
**Qué hacer:** Especificar la API según alcance: HTTPS, Basic Auth, tiempo de respuesta &lt;500 ms. Endpoints indicados en alcance: estado (`/api/status`, `/api/doors`, `/api/modes`), control (`POST /api/mode`), eventos (`GET /api/events` con filtros), configuración de horarios. Incluir métodos HTTP, rutas, cuerpos, códigos de respuesta y documentación Swagger/OpenAPI 3.0.

**Entregable:** Especificación completa (por ejemplo `API_SPEC.md` y/o `openapi.yaml`). El PoC en `software prueba_` puede usarse como base para rutas de estado y eventos; alinear nombres y estructura con alcance.

---

### 4. Definición del modelo de datos inicial
**Qué hacer:** Definir entidades para: modos operativos, actuaciones/estado de puertas, eventos (cambios de modo, aperturas, alarmas, fallos, accesos), configuración (horarios, calendario festivos, tiempos), usuarios/permisos de la web. Considerar retención de 180 días y exportación CSV según alcance.

**Entregable:** `MODELO_DATOS.md` (o diagrama ER) con tablas/entidades y relaciones. Base de datos objetivo: SQLite (alcance).

---

### 5. Configuración del proyecto backend (Python / FastAPI)
**Qué hacer:** Crear el proyecto final de backend en Python (3.9+): estructura de carpetas (p. ej. `src/`, `app/`, tests, config), dependencias (`requirements.txt` o `pyproject.toml`), configuración por entorno (desarrollo/producción), arranque con `uvicorn`. Reutilizar donde aplique la experiencia del PoC (`software prueba_/src/server.py`): FastAPI, pymodbus, constantes Modbus del ETD8A12.

**Entregable:** Repositorio con proyecto base listo para desarrollar (sin duplicar el PoC; se puede migrar/refactorizar el código del PoC al nuevo árbol).

---

### 6. Configuración del servicio del sistema local
**Qué hacer:** Según alcance, el sistema debe ejecutarse como **servicio Windows** con auto-inicio y recuperación ante fallos (&lt;30 s). Opcional: si se confirma despliegue en Linux/Ubuntu, añadir unit systemd.

**Entregable:** Scripts o instrucciones para instalar y arrancar el servicio en Windows (p. ej. NSSM o servicio nativo). Documento corto (ej. `INSTALACION_SERVICIO.md`). Si aplica Linux: `LINUX_DEPLOY.md` con systemd.

---

### 7. Comunicación con hardware (Modbus TCP/IP) — ETD8A12
**Qué hacer:** La conexión al ETD8A12 por Ethernet (Modbus TCP) ya está probada en Windows con el `software prueba_`. Para cerrar la subtask:
- Integrar la capa Modbus en el backend definitivo (3 módulos, IPs configurables, mismo mapa de registros: salidas 0x0000–0x000B, entradas 0x0080–0x008B, 0x0070 bitmask, 0x00FA relación IN/OUT).
- Cumplir requisito de ciclo de polling &lt;100 ms para lectura de las 36 entradas (alcance).
- Incluir simulador/mock de ETD8A12 para desarrollo sin hardware (alcance, §9.2 Testing).
- Documentar configuración de IPs (y, si aplica, acceso vía ZeroTier) en configuración o en `RED_Y_ACCESO_REMOTO.md`.

**Entregable:** Módulo de comunicación ETD8A12 integrado en el proyecto, documentación de registros (p. ej. `ETD8A12_MODBUS.md`) y mock/simulador para tests.

---

### 8. Configuración de repositorios, entornos y estructura de proyecto
**Qué hacer:** Crear y configurar el repositorio en **GitHub** (ramas, protección si aplica). Definir estructura de carpetas (código, tests, docs, scripts de instalación/despliegue). Documentar entornos: desarrollo en Windows (local), staging/producción (Windows IoT; opcional Linux si se confirma), variables de configuración y secretos (IPs ETD8A12, Basic Auth, etc.).

**Entregable:** Repo configurado, README con estructura del proyecto e instrucciones de clonado y entornos.

---

### 9. Inicio del desarrollo del núcleo del sistema
**Qué hacer:** Implementar el núcleo mínimo del sistema según alcance: salud del sistema (watchdog), persistencia del estado cada 60 s y restauración al reiniciar, primer conjunto de endpoints de API (p. ej. `/api/status`, `/api/doors`, `/api/modes`) y esqueleto de la lógica de los 7 modos y de las 33 actuaciones (puede ser parcial en esta fase). La capa Modbus ya probada en el PoC debe integrarse para lectura/escritura de los 3 ETD8A12.

**Entregable:** Núcleo ejecutable: servicio arranca, lee/escribe hardware (o mock), expone API de estado y modo, y tiene base para actuaciones y horarios.

---

## Nota: Windows vs Linux

- **Alcance contractual (`alcance.md`):** Plataforma obligatoria **Windows IoT** para el sistema de control en oficinas.
- **Desarrollo:** Se realiza en **Windows** (PCs de desarrollo); la conexión al ETD8A12 por Ethernet (Modbus TCP) ya está probada en el `software prueba_`.
- **Posible evolución:** Si más adelante se define despliegue en **Linux/Ubuntu** (p. ej. por coste o estandarización), se añadirá servicio systemd y documentación en `LINUX_DEPLOY.md`. Las subtasks se han definido priorizando Windows IoT según alcance.

---

## Detalle específico: ETD8A12, desarrollo en Windows y ZeroTier

### ETD8A12 – Módulo Modbus (base ya probada)

- **Hardware:** 3 módulos **ETD8A12** (12 DI + 12 DO cada uno), Modbus TCP/IP por Ethernet. Distribución: Módulo 1 Central, Módulo 2 Puerta Calle, Módulo 3 Puerta Oficina (ver `alcance.md` Anexo B).
- **PoC existente:** En `App Control de Puertas/3 Control de Accesos/software prueba_/` el backend (`server.py`) ya se conecta al ETD8A12 en Windows, usando pymodbus, registros 0x0000–0x000B (salidas), 0x0080–0x008B (entradas), 0x0070 (bitmask), 0x00FA (relación IN/OUT desactivada para control desde Python).
- **Tareas pendientes (subtask 7):** Integrar esta capa en el proyecto final; cumplir ciclo de lectura &lt;100 ms (36 entradas); proporcionar mock/simulador para desarrollo sin hardware; documentar mapa de registros en `ETD8A12_MODBUS.md`.

### Entorno de desarrollo en Windows

- Desarrollar y probar en **Windows** (FastAPI, pymodbus, tests). Usar el PoC para conectar a ETD8A12 real por Ethernet o usar mock cuando no haya hardware.
- Entornos virtuales (`venv`) y dependencias documentadas (p. ej. en README o `DEV_ENV_WINDOWS.md`).

### Acceso remoto (ZeroTier)

- Si el ETD8A12 está en red remota y se accede vía **ZeroTier**: documentar en `RED_Y_ACCESO_REMOTO.md` la configuración de red, la IP del equipo ETD8A12 accesible por ZeroTier y el puerto Modbus (p. ej. 5000). El backend debe permitir configurar host/puerto por entorno (archivo de config o variables) para usar la misma aplicación en local, laboratorio o remoto.

---

## Próximos pasos concretos

1. **Cerrar alcance (Subtask 1):** Usar `alcance.md` como referencia oficial; asegurar que los anexos (`250923_ACTUACIONES.xlsx`, `ENTRADAS_Y_SALIDAS.xlsx`) están disponibles y referenciados en la documentación.
2. **Arquitectura y API (Subtasks 2 y 3):** Redactar `ARQUITECTURA.md` y `API_SPEC.md` (o `openapi.yaml`) alineados con alcance; el PoC en `software prueba_` sirve de base para rutas de estado y configuración de placas.
3. **Backend y estructura (Subtasks 5 y 8):** Crear el proyecto final (estructura, dependencias, config) y migrar/refactorizar el código del `software prueba_` al nuevo árbol; configurar repo GitHub.
4. **Modbus y núcleo (Subtasks 7 y 9):** Integrar la capa ETD8A12 (optimizar polling a &lt;100 ms), añadir mock para desarrollo sin hardware, e iniciar la lógica de los 7 modos y las 33 actuaciones.

Si indicas por qué subtask quieres empezar, se pueden proponer archivos y pasos concretos en tu carpeta `santander`.