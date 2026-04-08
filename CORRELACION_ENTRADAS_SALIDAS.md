# Correlación de entradas y salidas: nomenclatura antigua ↔ proyecto actual

En el sistema anterior se usaba la nomenclatura **SMCSE** con códigos del tipo `DI_01_01_01`, `DO_01_02_05`, etc. En este proyecto trabajamos con **3 módulos ETD8A12** (Placa 1 = Central, Placa 2 = Puerta Calle, Placa 3 = Puerta Oficina) y en código con `io_state[board_id]["inputs"][n]` / `io_state[board_id]["outputs"][n]` y registros Modbus.

Este documento define la equivalencia entre ambos para implementar las actuaciones sin perder el hilo con el Excel/tablas antiguas.

---

## 1. Convención antigua (SMCSE)

- **DI** = Digital Input (entrada).  
- **DO** = Digital Output (salida).  
- Formato: **`DI_XX_YY_ZZ`** o **`DO_XX_YY_ZZ`**  
  - **XX** = identificador de sistema/instalación (en nuestro caso siempre `01`).  
  - **YY** = **placa** (módulo físico): `01` = Central, `02` = Puerta Calle, `03` = Puerta Oficina.  
  - **ZZ** = **relé/canal** en esa placa: `01`..`12` (IN1–IN12 o OUT1–OUT12).

Ejemplos:

- `DI_01_01_01` = entrada, placa 1, relé 1 → **Módulo 1 Central, IN1**.  
- `DO_01_02_06` = salida, placa 2, relé 6 → **Módulo 2 Puerta Calle, OUT6**.  
- `DO_01_03_05` = salida, placa 3, relé 5 → **Módulo 3 Puerta Oficina, OUT5**.

---

## 2. Uso por placa en este proyecto

| Placa (YY) | Módulo           | Entradas        | Salidas                    |
|------------|------------------|-----------------|----------------------------|
| 01         | 1 – Central      | 01_01_01..01_01_12 (12 IN) | 01_01_01..01_01_04 (solo 4 OUT usadas) |
| 02         | 2 – Puerta Calle | 01_02_01..01_02_12 (12 IN) | 01_02_01..01_02_12 (7 OUT usadas, 5 libres) |
| 03         | 3 – Puerta Oficina | 01_03_01..01_03_12 (12 IN) | 01_03_01..01_03_12 (7 OUT usadas, 5 libres) |

- **Entradas:** en las tres placas se usan los 12 canales (rango 01..12).  
- **Salidas:**  
  - **Placa 1 (Central):** solo se usan 4 salidas (OUT1–OUT4); el resto quedan reservadas/libres.  
  - **Placas 2 y 3 (Puerta Calle y Puerta Oficina):** se usan 7 salidas (OUT1–OUT7); OUT8–OUT12 libres.

---

## 3. Tabla de correlación: entradas (DI)

### Módulo 1 – Central (board_id = 1)

| Código antiguo   | IN  | En código (PoC)           | Descripción (alcance)     |
|------------------|-----|---------------------------|---------------------------|
| DI_01_01_01      | IN1 | io_state[1]["inputs"][0]  | Horario Automático        |
| DI_01_01_02      | IN2 | io_state[1]["inputs"][1]  | Horario Esclusa           |
| DI_01_01_03      | IN3 | io_state[1]["inputs"][2]  | Horario Extendido         |
| DI_01_01_04      | IN4 | io_state[1]["inputs"][3]  | Horario Autoservicio      |
| DI_01_01_05      | IN5 | io_state[1]["inputs"][4]  | Horario Cerrado           |
| DI_01_01_06      | IN6 | io_state[1]["inputs"][5]  | Horario Carga Cajero      |
| DI_01_01_07      | IN7 | io_state[1]["inputs"][6]  | Horario Manual            |
| DI_01_01_08      | IN8 | io_state[1]["inputs"][7]  | Apertura Remota COCE Oficina |
| DI_01_01_09      | IN9 | io_state[1]["inputs"][8]  | Incendio                  |
| DI_01_01_10      | IN10| io_state[1]["inputs"][9]  | Alarma Conectada          |
| DI_01_01_11      | IN11| io_state[1]["inputs"][10] | Presencia Zaguán          |
| DI_01_01_12      | IN12| io_state[1]["inputs"][11] | Apertura Remota Calle     |

### Módulo 2 – Puerta Calle (board_id = 2)

| Código antiguo   | IN  | En código (PoC)           | Descripción (alcance)     |
|------------------|-----|---------------------------|---------------------------|
| DI_01_02_01      | IN1 | io_state[2]["inputs"][0]  | Radar Interior            |
| DI_01_02_02      | IN2 | io_state[2]["inputs"][1]  | Radar Exterior            |
| DI_01_02_03      | IN3 | io_state[2]["inputs"][2]  | Inductivo (Llave Echada)  |
| DI_01_02_04      | IN4 | io_state[2]["inputs"][3]  | Inductivo (Puerta Abierta/Cerrada) |
| DI_01_02_05      | IN5 | io_state[2]["inputs"][4]  | Pulsador Emergencia Puerta |
| DI_01_02_06      | IN6 | io_state[2]["inputs"][5]  | Pulsador Verde (Paralelo EMICOM) |
| DI_01_02_07      | IN7 | io_state[2]["inputs"][6]  | Llamada Interior          |
| DI_01_02_08      | IN8 | io_state[2]["inputs"][7]  | Llamada Exterior          |
| DI_01_02_09      | IN9 | io_state[2]["inputs"][8]  | Bloqueo Zaguán (Libre)    |
| DI_01_02_10      | IN10| io_state[2]["inputs"][9]  | Presencia Zaguán          |
| DI_01_02_11      | IN11| io_state[2]["inputs"][10] | ICR 2 (Libre)             |
| DI_01_02_12      | IN12| io_state[2]["inputs"][11] | Llave Emergencia          |

### Módulo 3 – Puerta Oficina (board_id = 3)

Misma distribución que Módulo 2 (Puerta Calle):

| Código antiguo   | IN  | En código (PoC)           |
|------------------|-----|---------------------------|
| DI_01_03_01 .. DI_01_03_12 | IN1..IN12 | io_state[3]["inputs"][0] .. io_state[3]["inputs"][11] |

(Descripciones: Radar Interior/Exterior, Inductivos, Pulsadores, Llamadas, Bloqueo Zaguán, Presencia, ICR 2, Llave Emergencia.)

---

## 4. Tabla de correlación: salidas (DO)

### Módulo 1 – Central (board_id = 1) — solo 4 salidas usadas

| Código antiguo   | OUT | En código (PoC)            | Descripción (alcance)     |
|------------------|-----|----------------------------|---------------------------|
| DO_01_01_01      | OUT1| io_state[1]["outputs"][0]  | Alarma Zaguán             |
| DO_01_01_02      | OUT2| io_state[1]["outputs"][1]  | Locución Cajero Ocupado   |
| DO_01_01_03      | OUT3| io_state[1]["outputs"][2]  | Locución Pase Por Favor   |
| DO_01_01_04      | OUT4| io_state[1]["outputs"][3]  | Locución Por Su Seguridad |
| DO_01_01_05 .. DO_01_01_12 | OUT5..OUT12 | [4]..[11] | Reservadas (no usadas en lógica estándar) |

### Módulo 2 – Puerta Calle (board_id = 2) — 7 usadas, 5 libres

| Código antiguo   | OUT | En código (PoC)            | Descripción (alcance)     |
|------------------|-----|----------------------------|---------------------------|
| DO_01_02_01      | OUT1| io_state[2]["outputs"][0]  | Llave Echada (EMICOM) Selector A |
| DO_01_02_02      | OUT2| io_state[2]["outputs"][1]  | Llave Echada (Alimentación Bobinas) |
| DO_01_02_03      | OUT3| io_state[2]["outputs"][2]  | Emergencia Incendio (EMICOM) Night Bank |
| DO_01_02_04      | OUT4| io_state[2]["outputs"][3]  | Emergencia Resto (EMICOM) Night Bank |
| DO_01_02_05      | OUT5| io_state[2]["outputs"][4]  | Anulación ICR 2 (EMICOM) Lock |
| DO_01_02_06      | OUT6| io_state[2]["outputs"][5]  | Anulación Alimentación Pila Winhouse |
| DO_01_02_07      | OUT7| io_state[2]["outputs"][6]  | Orden de Apertura (EMICOM) EM/OPEN/CLOSE |
| DO_01_02_08 .. DO_01_02_12 | OUT8..OUT12 | [7]..[11] | Reservadas / libres |

### Módulo 3 – Puerta Oficina (board_id = 3) — 7 usadas, 5 libres

Misma distribución que Módulo 2:

| Código antiguo   | OUT | En código (PoC)            |
|------------------|-----|----------------------------|
| DO_01_03_01 .. DO_01_03_07 | OUT1..OUT7 | io_state[3]["outputs"][0] .. io_state[3]["outputs"][6] |
| DO_01_03_08 .. DO_01_03_12 | OUT8..OUT12 | [7]..[11] (libres) |

---

## 5. Direcciones de memoria Modbus (por placa)

### De dónde salen estas direcciones

Las direcciones **son fijas** y vienen del **fabricante del ETD8A12**. Están definidas en la documentación Modbus TCP/IP del dispositivo (manual del controlador, “ETD8A12 Modbus TCP IP Handbook” o equivalente). No las elegimos nosotros: el hardware responde en esos registros.

En el proyecto:

- **Documentación de referencia:** carpeta `App Control de Puertas/3 Control de Accesos/ETD8A12-12-channel.../ETD8A12 Modbus TCP IP Handbook/` (y ficheros tipo “Relay Demo” del fabricante). Ahí se especifica el mapa de registros.
- **En código:** el PoC (`software prueba_/src/server.py`) define constantes que replican ese mapa, para no usar “números mágicos”. Por ejemplo:
  - `REG_OUTPUT_START = 0x0000`
  - `REG_INPUT_START  = 0x0080`
  - `CMD_OPEN = 0x0100`, `CMD_CLOSE = 0x0200`
  - etc.

Resumen: **origen = documentación del fabricante ETD8A12 → fijas por hardware → reflejadas en nuestro código como constantes.** Si en el futuro usáis otro modelo de placa, el mapa podría cambiar y habría que ajustar solo esas constantes.

---

### Listado completo de direcciones (una placa ETD8A12)

Cada placa tiene el mismo mapa. El orden lógico es: primero **salidas (OUT)**, luego **entradas (IN)**, y al final los registros especiales. Todas las direcciones se dan en **hexadecimal** (como en el manual y en el código).

#### Salidas (DO) — escritura/lectura

| Dirección (hex) | Canal | Uso en proyecto |
|-----------------|-------|------------------|
| 0x0000 | OUT1 | Usado (Central: Alarma Zaguán; Calle/Oficina: Llave Echada, etc.) |
| 0x0001 | OUT2 | Usado |
| 0x0002 | OUT3 | Usado |
| 0x0003 | OUT4 | Usado |
| 0x0004 | OUT5 | Usado (Calle/Oficina); Central reservado |
| 0x0005 | OUT6 | Usado (Calle/Oficina); Central reservado |
| 0x0006 | OUT7 | Usado (Calle/Oficina); Central reservado |
| 0x0007 | OUT8 | Libre / reservado |
| 0x0008 | OUT9 | Libre / reservado |
| 0x0009 | OUT10 | Libre / reservado |
| 0x000A | OUT11 | Libre / reservado |
| 0x000B | OUT12 | Libre / reservado |

#### Entradas (DI) — solo lectura

| Dirección (hex) | Canal | Uso en proyecto |
|-----------------|-------|------------------|
| 0x0080 | IN1 | Usado |
| 0x0081 | IN2 | Usado |
| 0x0082 | IN3 | Usado |
| 0x0083 | IN4 | Usado |
| 0x0084 | IN5 | Usado |
| 0x0085 | IN6 | Usado |
| 0x0086 | IN7 | Usado |
| 0x0087 | IN8 | Usado |
| 0x0088 | IN9 | Usado |
| 0x0089 | IN10 | Usado |
| 0x008A | IN11 | Usado |
| 0x008B | IN12 | Usado |

#### Registros especiales

| Dirección (hex) | Nombre típico | Uso |
|-----------------|----------------|-----|
| 0x0070 | Bitmask salidas | Escribir un valor de 12 bits para poner OUT1..OUT12 de golpe (bit 0 = OUT1, …, bit 11 = OUT12). |
| 0x00C0 | Bitmask entradas | Lectura de las 12 entradas en un solo registro (opcional; también se leen 0x0080..0x008B). |
| 0x00FA | Relación IN→OUT | Escritura: 0x0000 = entradas y salidas sin relación (control solo desde PC); 0x0001 = relación directa IN→OUT en el hardware. |

---

### Resumen por tipo

| Uso | Dirección base | Fórmula | Registros |
|-----|----------------|---------|-----------|
| **Salidas (DO)** | `0x0000` | `0x0000 + (ZZ - 1)` | OUT1=0x0000 … OUT12=0x000B |
| **Entradas (DI)** | `0x0080` | `0x0080 + (ZZ - 1)` | IN1=0x0080 … IN12=0x008B |
| Bitmask salidas | `0x0070` | — | Un registro, 12 bits (OUT1..OUT12) |
| Bitmask entradas | `0x00C0` | — | Un registro, 12 bits (IN1..IN12) |
| Relación IN→OUT | `0x00FA` | — | 0x0000 = control solo desde PC |

### Ejemplos de dirección por código antiguo

| Código | Placa | Canal ZZ | Dirección Modbus | Operación |
|--------|-------|----------|------------------|-----------|
| DI_01_01_01 | 1 | 01 | **0x0080** | Lectura (read_holding_registers) |
| DI_01_01_12 | 1 | 12 | **0x008B** | Lectura |
| DI_01_02_06 | 2 | 06 | **0x0085** | Lectura (placa 2) |
| DO_01_01_01 | 1 | 01 | **0x0000** | Escritura 0x0100 (ON) o 0x0200 (OFF) |
| DO_01_01_04 | 1 | 04 | **0x0003** | Escritura |
| DO_01_02_05 | 2 | 05 | **0x0004** | Escritura (placa 2) |
| DO_01_02_06 | 2 | 06 | **0x0005** | Escritura (placa 2) |
| DO_01_03_05 | 3 | 05 | **0x0004** | Escritura (placa 3) |

Fórmula resumida:

- **DI_01_YY_ZZ** → placa **YY**, dirección **0x0080 + (ZZ - 1)** (lectura).
- **DO_01_YY_ZZ** → placa **YY**, dirección **0x0000 + (ZZ - 1)** (escritura con valor 0x0100 = ON, 0x0200 = OFF).

En código (PoC):

```python
# Leer DI_01_02_06 (Placa 2, IN6)
# → client (placa 2).read_holding_registers(address=0x0080 + (6-1), count=1)  # o leer 12 de una vez
# → io_state[2]["inputs"][5]

# Escribir DO_01_02_06 = 1 (Placa 2, OUT6 ON)
# → client (placa 2).write_register(address=0x0000 + (6-1), value=0x0100, device_id=slave_id)
# → address = 0x0005, value = CMD_OPEN (0x0100)
```

---

## 6. Regla rápida para traducir en código

- **Leer entrada antigua** `DI_01_YY_ZZ`:  
  `io_state[YY]["inputs"][ZZ - 1]`  
  (YY = 1, 2 o 3 según placa; ZZ = 01..12.)  
  Dirección Modbus (lectura): **0x0080 + (ZZ - 1)** en la placa YY.

- **Escribir salida antigua** `DO_01_YY_ZZ`:  
  Dirección Modbus: **0x0000 + (ZZ - 1)** en la placa `YY`, valor `0x0100` (ON) o `0x0200` (OFF).  
  En PoC: `board_id = YY`, `channel = ZZ`, `REG_OUTPUT_START + (ZZ - 1)`.

Así, cuando en las actuaciones aparezca “ATACA: DI_01_01_01” o “ACTIVA 1: DO_01_02_05, DO_01_02_06, DO_01_03_05, DO_01_03_06”, se puede pasar directamente a índices y canales del proyecto.

---

## 7. Ejemplo: las 3 primeras actuaciones (resumen)

| Actuación | ATACA (disparo) | ACTIVA 1 (salidas a 1) | DESACTIVA 0 (a 0) |
|-----------|------------------|-------------------------|---------------------|
| 1 – Horario Automático | DI_01_01_01 | DO_01_02_05, DO_01_02_06, DO_01_03_05, DO_01_03_06 | DI_01_01_02..07 (otros modos); no actuar si DI_01_01_10 (Alarma) activa |
| 2 – Horario Esclusa   | DI_01_01_02 | DO_01_02_05, DO_01_02_06, DO_01_03_05, DO_01_03_06 | DI_01_01_01, 03..07 y los mismos DO a 0 antes de activar; no actuar si DI_01_01_10 |
| 3 – Horario Extendido | DI_01_01_03 | (ninguna en la tabla) | DI_01_01_01, 02, 04..07 y varias DI/DO de módulos 2 y 3 |

Traducción a nuestro sistema:

- **ATACA DI_01_01_01** → si `io_state[1]["inputs"][0]` es True.  
- **ACTIVA 1 DO_01_02_05, DO_01_02_06, DO_01_03_05, DO_01_03_06** → escribir OUT5 y OUT6 a 1 en módulos 2 y 3 (como en el ejemplo de `APROVECHAMIENTO_POC.md`).  
- **DESACTIVA 0** sobre **DO** → escribir esas salidas a 0; sobre **DI** → en nuestro sistema las entradas son solo lectura (el “desactivar” será lógico: no considerar ese modo activo, o simular según especificación).

---

## 8. Documentos relacionados

- **Alcance (Anexo B):** `alcance.md` — descripción funcional de cada IN/OUT.  
- **Acceso Modbus y ejemplo de actuación:** `APROVECHAMIENTO_POC.md` — constantes, `io_state`, lectura/escritura.
