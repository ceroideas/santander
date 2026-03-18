# Explicación de actuaciones y modos — con ejemplos

Este documento explica **cómo funcionan las actuaciones** del sistema de control de accesos a partir de los Excel **250923 ACTUACIONES.XLSX** y **ENTRADAS Y SALIDAS.XLSX**.

---

## 1. Cómo leer las columnas del Excel de actuaciones

En cada fila del Excel tienes tres bloques que mandan en la lógica:

| Columna / concepto | Significado |
|--------------------|-------------|
| **ATACA / ORIGEN** | **Qué tiene que pasar** para que esta actuación se ejecute: qué entrada (IN) se activa o qué condición se cumple. |
| **DESACTIVA** | Relés (salidas) que el sistema **apaga** cuando esta actuación se ejecuta. |
| **ACTIVA** | Relés (salidas) que el sistema **enciende** cuando esta actuación se ejecuta. |
| **NO ACTUA SI ESTÁ ACTIVADO** | **Condición de bloqueo**: esta actuación **no se ejecuta** si alguna de esas entradas o salidas está activa. Es decir: “no hagas esta acción si está activo X”. |

Resumiendo:

- **Si se cumple la condición de “ATACA”** y **no se cumple “NO ACTUA SI ESTÁ ACTIVADO”** → el sistema **DESACTIVA** las salidas indicadas y **ACTIVA** las indicadas.
- Si **“NO ACTUA SI ESTÁ ACTIVADO”** está cumplido (alguna de esas señales está activa), esta actuación **no hace nada**.

---

## 2. Resumen de módulos y señales (del Excel ENTRADAS Y SALIDAS)

- **Módulo 1 – Central:** horarios (IN1–IN7), COCE, incendio, alarma, presencia zaguán, apertura remota. Salidas: alarma zaguán, locuciones (OUT1–OUT4), resto reservadas.
- **Módulo 2 – Puerta calle:** radares (IN1, IN2), inductivos (IN3, IN4), pulsadores (IN5, IN6), llamadas (IN7, IN8), etc. Salidas: llave echada (OUT1, OUT2), emergencias (OUT3, OUT4), anulaciones ICR/Winhouse (OUT5, OUT6), orden apertura (OUT7).
- **Módulo 3 – Puerta oficina:** misma distribución lógica que módulo 2 (IN1–IN12, OUT1–OUT12).

Los nombres largos (SMCSE_DI_01_01_01, SMCSE_DO_01_02_07, etc.) son solo identificadores; lo importante es **qué IN/OUT de qué módulo** son (Central 1, Calle 2, Oficina 3).

---

## 3. Los 7 modos (actuaciones 1–7): enclavamiento mutuo

Las **actuaciones 1 a 7** son los **7 modos horarios**. La lógica es la misma para todas:

- **ATACA:** Una entrada de horario del módulo Central (IN1=Automático, IN2=Esclusa, IN3=Extendido, IN4=Autoservicio, IN5=Cerrado, IN6=Carga cajero, IN7=Manual).
- **DESACTIVA:** Las salidas que “ponen” los otros modos (por ejemplo anulaciones ICR/Winhouse en ambas puertas: OUT5 y OUT6 en módulos 2 y 3), para que solo quede activo un modo.
- **ACTIVA:** Las salidas propias de ese modo (en varios modos son las mismas OUT5/OUT6 de Calle y Oficina; en Cerrado/Autoservicio/Carga/Manual también cierres de seguridad OUT1, OUT2 en uno o ambos módulos).
- **NO ACTUA SI ESTÁ ACTIVADO:** Condiciones que **impiden** que ese modo se pueda activar.

### Ejemplo 1: Modo AUTOMÁTICO (actuación 1)

- **ATACA:** IN1 del Central (Horario automático) — por consola/COCE/conmutador.
- **DESACTIVA:** OUT6 y OUT5 de Puerta Calle + OUT6 y OUT5 de Puerta Oficina (anulaciones ICR y Winhouse), para “soltar” los otros modos.
- **ACTIVA:** Las mismas OUT6 y OUT5 de Calle y Oficina (en este caso el Excel las pone como activar; el efecto neto con el enclavamiento es que solo el modo Automático manda).
- **NO ACTUA SI ESTÁ ACTIVADO:** IN10 (Alarma conectada).  
  **Interpretación:** Si la alarma está conectada, **no** se puede pasar a modo Automático (para evitar aperturas automáticas en festivos).

Si IN10 está activo → la actuación 1 **no se ejecuta**.  
Si IN10 no está activo e IN1 se activa → se ejecuta la actuación (enclavamiento: se desactivan otros modos y queda Automático).

### Ejemplo 2: Modo ESCLUSA (actuación 2)

- **ATACA:** IN2 del Central (Horario esclusa).
- **DESACTIVA:** OUT6 y OUT5 en Calle y Oficina (igual que antes).
- **ACTIVA:** Mismas OUT6 y OUT5.
- **NO ACTUA SI ESTÁ ACTIVADO:** IN10 (Alarma conectada).  
  Misma idea: con alarma conectada no se puede entrar en Esclusa.

### Ejemplo 3: Modo CERRADO (actuación 5)

- **ATACA:** IN5 del Central (Horario cerrado).
- **DESACTIVA:** Las otras entradas de modo (IN1–IN4, IN6, IN7) y las salidas OUT6/OUT5 de ambas puertas (otros modos).
- **ACTIVA:** Cierres de seguridad de **ambas** puertas: OUT1 y OUT2 en módulo 2 (Calle) y OUT1 y OUT2 en módulo 3 (Oficina).
- **NO ACTUA SI ESTÁ ACTIVADO:** (IN4 puerta calle) + (IN4 puerta oficina) — es decir, **si alguna puerta está abierta** (inductivo “puerta abierta”), no se activan los cierres.  
  **Interpretación:** Los cierres de seguridad solo se activan **si ambas puertas están cerradas**. Si una está abierta, esta actuación no enciende los cierres.

---

## 4. Incendio y emergencias (actuación 8 y pulsadores verdes)

### Ejemplo 4: Señal de INCENDIO (actuación 8)

- **ATACA:** IN9 del Central (Señal de incendio).
- **DESACTIVA:** Cierres de seguridad de ambas puertas (OUT1, OUT2 en módulos 2 y 3) para no bloquear la salida.
- **ACTIVA:** Salidas de “emergencia” que abren las puertas: OUT3 (emergencia incendio) y OUT4 (emergencia resto) en Calle y Oficina.
- **NO ACTUA SI ESTÁ ACTIVADO:** IN3, IN4, IN5, IN6 del Central (modos Extendido, Autoservicio, Cerrado, Carga cajero).  
  **Interpretación:** En esos modos no se permite que el incendio abra automáticamente (por seguridad o protocolo). Solo en Automático, Esclusa o Manual se abren las puertas por incendio.

### Ejemplo 5: Pulsador verde PUERTA CALLE (actuación 10)

- **ATACA:** IN6 del módulo 2 (Pulsador verde puerta calle).
- **DESACTIVA:** OUT1 y OUT2 de la puerta calle (cierres).
- **ACTIVA:** OUT3 de la puerta calle (emergencia).
- **NO ACTUA SI ESTÁ ACTIVADO:** (vacío en el Excel) — siempre que pulses, se ejecuta.

---

## 5. Radares en modo AUTOMÁTICO (actuaciones 13–16)

En modo Automático, los radares abren la puerta con un **pulso de 5 segundos**.

### Ejemplo 6: Radar interior puerta CALLE (actuación 15)

- **ATACA:** IN1 del módulo 2 (Radar interior puerta calle).
- **DESACTIVA:** (nada).
- **ACTIVA:** OUT7 del módulo 2 (Orden de apertura puerta calle) — **pulso 5 s**.
- **NO ACTUA SI ESTÁ ACTIVADO:** IN2, IN3, IN4, IN5, IN6, IN7 del Central.  
  **Interpretación:** Esta apertura por radar **solo** funciona en modo **Automático**. Si está en Esclusa, Extendido, Autoservicio, Cerrado, Carga cajero o Manual, el radar **no** abre la puerta.

---

## 6. Radares en modo ESCLUSA (actuaciones 17–20)

En Esclusa, la apertura por radar tiene una condición extra: que la otra puerta no esté “ocupada” (para que no se crucen personas).

### Ejemplo 7: Radar interior puerta OFICINA en modo Esclusa (actuación 17)

- **ATACA:** IN1 del módulo 3 (Radar interior puerta oficina).
- **DESACTIVA:** (nada).
- **ACTIVA:** OUT7 del módulo 3 (Orden de apertura puerta oficina) — pulso 5 s.
- **NO ACTUA SI ESTÁ ACTIVADO:** (OUT4 puerta calle) + (IN1 Central) + (IN3, IN4, IN5, IN6, IN7 Central).  
  **Interpretación:**  
  - No abre si está en modo Automático (IN1) ni en Extendido, Autoservicio, Cerrado, Carga cajero o Manual.  
  - Y **no abre si la puerta calle tiene activa OUT4** (emergencia resto / estado “puerta calle en uso” en esclusa). Es decir: primero debe estar “libre” la puerta calle para poder abrir la de oficina.

---

## 7. Pulsador de emergencia en puerta e interfono (ejemplos 21–22)

### Ejemplo 8: Pulsador emergencia puerta CALLE (actuación 21 en la lista de “pulso 5 sg”)

- **ATACA:** IN5 del módulo 2 (Pulsador emergencia puerta calle).
- **DESACTIVA:** Durante 5 segundos OUT1 y OUT2 de la puerta calle (cierres), para poder abrir.
- **ACTIVA:** OUT7 de la puerta calle (orden de apertura) — **pulso 5 s**.  
  **Interpretación:** Al pulsar, se anulan los cierres 5 s y se da orden de apertura; la puerta se abre.

---

## 8. Resumen en una frase por concepto

| Concepto | Frase resumida |
|----------|----------------|
| **ATACA** | “Cuando se activa esta entrada (o condición), se dispara esta actuación.” |
| **DESACTIVA** | “Al dispararse esta actuación, el sistema apaga estas salidas.” |
| **ACTIVA** | “Al dispararse esta actuación, el sistema enciende estas salidas.” |
| **NO ACTUA SI ESTÁ ACTIVADO** | “Esta actuación **no se ejecuta** si alguna de estas entradas/salidas está activa; es la condición de bloqueo.” |

Con esto puedes leer cualquier fila del Excel:  
**Si se cumple ATACA y no se cumple “NO ACTUA SI ESTÁ ACTIVADO”** → se aplican DESACTIVA y ACTIVA; en caso contrario, la actuación no hace nada.

---

## 9. Tipos de “orden” en el Excel

- **ENCLAVAMIENTO:** Actuaciones que se aseguran de que solo un modo esté activo (apagando/encendiendo las salidas de modo, p. ej. OUT5/OUT6).
- **PULSO 5 SG:** La salida que se activa (p. ej. orden de apertura) se mantiene **5 segundos** y luego se desactiva; a veces además se desactivan cierres durante esos 5 s.
- **ENCLAVADO:** Similar a enclavamiento; fija un estado (p. ej. apertura remota COCE) hasta que cambie la condición.

Si quieres, en el siguiente paso podemos bajar al detalle de **qué relé exacto (OUT) corresponde a cada función** en cada módulo usando la tabla ENTRADAS Y SALIDAS, o traducir más actuaciones una a una a "si pasa X y no está Y → apagar Z y encender W".

---

## 10. ¿Se abren las puertas / relés con direcciones y valores hexadecimales? (Modbus)

**Sí.** En este proyecto la comunicación con los módulos ETD8A12 es por **Modbus TCP/IP**, y en Modbus las **direcciones de registros** y los **valores de mando** se usan en **hexadecimal**. Eso está documentado en el repo, sobre todo en **`APROVECHAMIENTO_POC.md`** y en **`GUIA_SUBTASKS.md`**.

### Dónde se dice

- **`APROVECHAMIENTO_POC.md`** — sección *"Detalle técnico del acceso Modbus en el PoC"*: constantes en hex (0x0000, 0x0080, 0x0100, 0x0200, 0x00FA, etc.) y cómo se lee/escribe con `write_register(address=..., value=...)`.
- **`GUIA_SUBTASKS.md`** — Subtask 7: se habla del *mapa de registros: salidas 0x0000–0x000B, entradas 0x0080–0x008B, 0x0070 bitmask, 0x00FA relación IN/OUT*.

### Resumen rápido (hex en Modbus)

| Uso | Hexadecimal | Significado |
|-----|-------------|-------------|
| **Registros de salida** (relés OUT1–OUT12) | 0x0000 – 0x000B | Dirección Modbus para cada salida. |
| **Registros de entrada** (IN1–IN12) | 0x0080 – 0x008B | Dirección Modbus para leer cada entrada. |
| **Activar relé (abrir / ON)** | **0x0100** | Valor que se escribe en el registro de la salida para encender el relé. |
| **Desactivar relé (cerrar / OFF)** | **0x0200** | Valor para apagar el relé. |
| **Registro relación IN/OUT** | 0x00FA | Se escribe 0x0000 para que el control sea solo desde el PC (Python). |

Es decir: **las puertas/relés se "abren" y "cierran" escribiendo en Modbus valores hexadecimales** (0x0100 para abrir, 0x0200 para cerrar) en las direcciones de registro correspondientes (0x0000, 0x0001, … según el canal). Todo eso está definido en **Modbus** y documentado en los .md del proyecto.

---

## 11. Nombres (SMCSE_DI_01_01_01…) vs hexadecimal (0x0080, 0x0100…): cómo se relacionan

### No es “en vez de”: son dos capas

- **SMCSE_DI_01_01_01**, **SMCSE_DO_01_02_07**, etc. son **nombres lógicos**: los usamos en el Excel, en la documentación y en la lógica del programa para saber **qué es** cada señal (horario automático, orden de apertura, etc.).
- **Los hexadecimales** (0x0000, 0x0080, 0x0100, 0x0200…) son **lo que entiende el hardware** por Modbus. El módulo ETD8A12 no entiende “SMCSE_DI_01_01_01”; solo entiende “lee el registro 0x0080” o “escribe 0x0100 en el registro 0x0006”.

Así que **se siguen usando los nombres** donde tú trabajas (Excel, reglas, código legible). Lo que pasa es que **cuando el programa habla con el módulo por Modbus**, traduce esos nombres a direcciones y valores en hexadecimal.

### Cómo se traduce el nombre → hexadecimal

La estructura del nombre es:

- **SMCSE_DI_01_XX_YY** = entrada (DI), módulo **XX** (01=Central, 02=Calle, 03=Oficina), entrada número **YY** (01–12).
- **SMCSE_DO_01_XX_YY** = salida (DO), mismo módulo **XX**, salida número **YY** (01–12).

En Modbus, **cada módulo** tiene su propia conexión (su IP). Dentro de un mismo módulo:

| Tipo | Nombre ejemplo | Número de canal (N) | Dirección Modbus (hex) |
|------|----------------|---------------------|-------------------------|
| **Entrada** | SMCSE_DI_01_**01**_01 → IN1 Central | N = 1 | 0x0080 + (N−1) = **0x0080** |
| **Entrada** | SMCSE_DI_01_01_**02** → IN2 Central | N = 2 | 0x0080 + 1 = **0x0081** |
| **Entrada** | SMCSE_DI_01_**02**_07 → IN7 Puerta Calle | N = 7 | 0x0080 + 6 = **0x0086** |
| **Salida** | SMCSE_DO_01_**02**_07 → OUT7 Puerta Calle | N = 7 | 0x0000 + (N−1) = **0x0006** |
| **Salida** | SMCSE_DO_01_03_**01** → OUT1 Puerta Oficina | N = 1 | 0x0000 + 0 = **0x0000** |

Fórmula rápida:

- **Cualquier IN** del módulo → dirección Modbus = **0x0080 + (número de IN − 1)**.  
  Ejemplo: IN7 → 0x0080 + 6 = **0x0086**.
- **Cualquier OUT** del módulo → dirección Modbus = **0x0000 + (número de OUT − 1)**.  
  Ejemplo: OUT7 → 0x0000 + 6 = **0x0006**.

Para **activar** esa salida (abrir relé) se **escribe el valor 0x0100** en esa dirección. Para **desactivar** (cerrar relé), **0x0200**.

### Ejemplo completo con nombres y hex

En el Excel dice: “Al activar **SMCSE_DI_01_01_01** (Horario automático) se activan **SMCSE_DO_01_02_06** y **SMCSE_DO_01_02_05**…” (simplificado).

- En **nombres**:  
  - Entrada que dispara: **SMCSE_DI_01_01_01** = IN1 del módulo Central.  
  - Salidas a activar: **SMCSE_DO_01_02_05** = OUT5 Puerta Calle, **SMCSE_DO_01_02_06** = OUT6 Puerta Calle.

- En **Modbus (hex)** para el **módulo 2** (Puerta Calle):  
  - Leer si IN1 Central está activo → en el **módulo 1** leer registro **0x0080**.  
  - Activar OUT5 → escribir **0x0100** en registro **0x0004** (0x0000+4).  
  - Activar OUT6 → escribir **0x0100** en registro **0x0005** (0x0000+5).

El programa hace exactamente eso: usa los **nombres** para la lógica (igual que el Excel) y, cuando toca hablar con el hardware, **traduce** a **dirección hex + valor hex** por Modbus.

### Resumen en una frase

**SMCSE_DI_01_01_01 y similares** = nombres que usamos nosotros y en el Excel.  
**0x0080, 0x0006, 0x0100, 0x0200** = direcciones y valores que usa **Modbus** para hablar con el ETD8A12.  
No se sustituyen los nombres por hex; los nombres se **traducen** a hex solo en la comunicación con el módulo.

---

## 12. Ejemplo completo: Horario automático en hexadecimal

Aquí va un ejemplo **paso a paso** de lo que hace el sistema cuando está en **Horario automático**, usando solo **nombres lógicos** y su **traducción a hexadecimal** por Modbus.

---

### A) Activar el modo “Horario automático”

**En nombres (Excel):**

- **ATACA:** SMCSE_DI_01_01_01 (IN1 Central = “Horario automático”).
- **NO ACTUA SI ESTÁ ACTIVADO:** SMCSE_DI_01_01_10 (IN10 Central = “Alarma conectada”).
- **ACTIVA:** SMCSE_DO_01_02_05, SMCSE_DO_01_02_06 (OUT5 y OUT6 Puerta Calle) y SMCSE_DO_01_03_05, SMCSE_DO_01_03_06 (OUT5 y OUT6 Puerta Oficina).

**En hexadecimal (Modbus), lo que hace el programa:**

| Paso | Qué hace | Módulo | Acción Modbus (hex) |
|------|-----------|--------|----------------------|
| 1 | ¿Está activo Horario automático? | 1 (Central) | **Leer** registro **0x0080** (IN1). Si valor ≠ 0 → sí está activo. |
| 2 | ¿Está la alarma conectada? (si sí, no activamos este modo) | 1 (Central) | **Leer** registro **0x0089** (IN10). Si valor ≠ 0 → no ejecutar. |
| 3 | Activar salidas del modo en Puerta Calle | 2 (Calle) | **Escribir 0x0100** en registro **0x0004** (OUT5). **Escribir 0x0100** en registro **0x0005** (OUT6). |
| 4 | Activar salidas del modo en Puerta Oficina | 3 (Oficina) | **Escribir 0x0100** en registro **0x0004** (OUT5). **Escribir 0x0100** en registro **0x0005** (OUT6). |

Resumen en hex:

- **Leer** 0x0080 y 0x0089 en el **módulo 1** (Central).
- **Escribir 0x0100** en 0x0004 y 0x0005 en el **módulo 2** (Calle).
- **Escribir 0x0100** en 0x0004 y 0x0005 en el **módulo 3** (Oficina).

(0x0100 = “activar relé”; 0x0004 = OUT5, 0x0005 = OUT6.)

---

### B) En Horario automático: radar abre la puerta (pulso 5 s)

**En nombres (Excel):**

- **ATACA:** SMCSE_DI_01_02_01 (IN1 módulo 2 = Radar interior puerta calle).
- **ACTIVA:** SMCSE_DO_01_02_07 (OUT7 = Orden de apertura puerta calle), **pulso 5 s**.

**En hexadecimal (Modbus), lo que hace el programa:**

| Paso | Qué hace | Módulo | Acción Modbus (hex) |
|------|-----------|--------|----------------------|
| 1 | ¿Modo automático activo? | 1 (Central) | **Leer** **0x0080** (IN1). Si ≠ 0 → estamos en automático. |
| 2 | ¿Radar interior puerta calle detecta presencia? | 2 (Calle) | **Leer** **0x0080** (IN1 del módulo 2). Si ≠ 0 → hay detección. |
| 3 | Dar orden de apertura puerta calle (5 s) | 2 (Calle) | **Escribir 0x0100** en registro **0x0006** (OUT7). Tras 5 s, **escribir 0x0200** en **0x0006** (apagar). |

Resumen en hex:

- **Leer** 0x0080 en módulo 1 (modo) y 0x0080 en módulo 2 (radar).
- **Escribir 0x0100** en registro **0x0006** (OUT7) en módulo 2 → puerta abre.
- A los 5 s, **escribir 0x0200** en **0x0006** → puerta deja de recibir orden de apertura.

(0x0100 = encender, 0x0200 = apagar; 0x0006 = OUT7.)

---

### C) Tabla de referencia para este ejemplo

| Nombre lógico | Módulo | Canal | Dirección Modbus (hex) | Valor para activar | Valor para desactivar |
|---------------|--------|-------|------------------------|--------------------|------------------------|
| SMCSE_DI_01_01_01 (IN1 Central) | 1 | IN1 | 0x0080 | (solo lectura) | — |
| SMCSE_DI_01_01_10 (IN10 Central) | 1 | IN10 | 0x0089 | (solo lectura) | — |
| SMCSE_DI_01_02_01 (IN1 Calle – radar) | 2 | IN1 | 0x0080 | (solo lectura) | — |
| SMCSE_DO_01_02_05 (OUT5 Calle) | 2 | OUT5 | 0x0004 | 0x0100 | 0x0200 |
| SMCSE_DO_01_02_06 (OUT6 Calle) | 2 | OUT6 | 0x0005 | 0x0100 | 0x0200 |
| SMCSE_DO_01_02_07 (OUT7 Calle – orden apertura) | 2 | OUT7 | 0x0006 | 0x0100 | 0x0200 |
| SMCSE_DO_01_03_05 (OUT5 Oficina) | 3 | OUT5 | 0x0004 | 0x0100 | 0x0200 |
| SMCSE_DO_01_03_06 (OUT6 Oficina) | 3 | OUT6 | 0x0005 | 0x0100 | 0x0200 |

Con esto tienes el ejemplo de **Horario automático** traducido a lecturas y escrituras en **hexadecimal** por Modbus.
