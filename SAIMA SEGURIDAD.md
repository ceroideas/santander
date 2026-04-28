SAIMA SEGURIDAD
Control de Accesos — Banco Santander
API de Integración ESP32-S3-ETH
Guía técnica para el equipo de desarrollo del software de control de accesos

Version 2.2  |  Firmware zaguan_led_firmware.ino
Waveshare ESP32-S3-ETH  |  4 canales LED  |  4 pulsadores físicos
 
1. Introducción
El dispositivo ESP32-S3-ETH es un nodo inteligente de señalización LED instalado en cada acceso (zaguán) de las sucursales del Banco Santander. Su función es doble: recibir órdenes del software de control de accesos para actualizar la señalización visual de las puertas, y notificar al software cuando se pulsa un botón físico en alguna de las puertas.

El dispositivo se comunica exclusivamente por Ethernet (sin WiFi ni Bluetooth) y expone una API HTTP REST en el puerto 80. Toda la integración con el software de control se realiza mediante llamadas HTTP en la red local de la sucursal.

1.1  Arquitectura general

Componente	Rol	Comunicación
Software de control	Cerebro del sistema — gestiona lógica de puertas, modos y accesos	HTTP POST → ESP32
ESP32-S3-ETH	Nodo de señalización — controla LEDs y lee pulsadores	HTTP POST → Backend al pulsar
Backend FastAPI	API central del sistema — recibe pulsaciones y orquesta estados	Expone /zaguan/estado y /zaguan/pulsacion

1.2  Mapa de hardware por acceso

Canal	GPIO LED	GPIO Pulsador	Ubicación física
Canal 1	GPIO 2	GPIO 15	Tira LED exterior — cara calle P1
Canal 2	GPIO 4	GPIO 16	Tira LED exterior — cara oficina P2
Canal 3	GPIO 5	GPIO 17	Tira LED pulsador interior P1
Canal 4	GPIO 6	GPIO 18	Tira LED pulsador interior P2

Un ESP32 por acceso
Cada acceso (par de puertas P1+P2 con zaguán) tiene un único ESP32-S3-ETH que gestiona los 4 canales. La IP del dispositivo identifica unívocamente el acceso.
 
2. Configuración inicial del dispositivo
Tras instalar el firmware, el primer paso es configurar la IP del dispositivo y la dirección del backend FastAPI. Esta configuración se almacena en la memoria flash del ESP32 (NVS) y persiste tras reinicios y cortes de luz.

2.1  Configurar red y backend
Enviar una única llamada POST con todos los parámetros de red. Esto es suficiente para la puesta en marcha inicial:

POST	/api/config/red	Configura red y dirección del backend

// Petición:
POST http://192.168.10.20/api/config/red
Content-Type: application/json

{
  "ip":              "192.168.10.20",   // IP propia del ESP32
  "gateway":         "192.168.10.1",    // Puerta de enlace
  "subnet":          "255.255.255.0",   // Máscara de red
  "backend_ip":      "192.168.10.10",   // IP del servidor FastAPI
  "backend_puerto":  8000,              // Puerto del servidor FastAPI
  "backend_ruta":    "/zaguan/estado",  // GET al arrancar para sync
  "pulsacion_ruta":  "/zaguan/pulsacion"// Base para notificar pulsaciones
}

// Respuesta:
{ "ok": true, "ip": "192.168.10.20", "reconectando": true }

Cambio de IP en caliente
Si se cambia la IP del ESP32, el dispositivo se reconecta automáticamente con la nueva IP en menos de 2 segundos. No es necesario reiniciar. El software debe actualizar la IP de destino de sus llamadas para usar la nueva dirección.

2.2  Valores por defecto de fábrica

Parámetro	Valor por defecto
IP ESP32	192.168.10.20
Gateway	192.168.10.1
Subnet	255.255.255.0
Backend IP	192.168.10.10
Backend puerto	8000
Ruta estado	/zaguan/estado
Ruta pulsación	/zaguan/pulsacion
LEDs canales 1 y 2	60 LEDs por canal
LEDs canales 3 y 4	10 LEDs por canal
Brillo canales 1 y 2	150 / 255 (~60%)
Brillo canales 3 y 4	200 / 255 (~78%)
 
3. API de control — estados LED
El software envía el estado de cada canal de forma independiente. El ESP32 aplica inmediatamente la animación correspondiente a ese estado.

3.1  Estados disponibles

Estado	Animación por defecto	Color por defecto	Uso típico
libre	Respiración suave (3s ciclo)	Verde (0, 200, 0)	Zaguán libre — se puede entrar
ocupado	Parpadeo lento (1s ciclo)	Rojo (200, 0, 0)	Zaguán ocupado — esperar
abriendo	Barrido naranja	Naranja (200, 100, 0)	Puerta en proceso de apertura
apagado	Fijo apagado	Negro (0, 0, 0)	Fuera de servicio / emergencia

Animaciones y colores configurables
Los colores, tipo de animación y velocidad de cada estado son configurables en caliente desde el software sin necesidad de recompilar el firmware. Ver sección 5.

3.2  Cambiar estado de un canal

POST	/api/p1/estado	Canal 1 — tira exterior calle

POST	/api/p2/estado	Canal 2 — tira exterior oficina

POST	/api/p3/estado	Canal 3 — tira pulsador interior P1

POST	/api/p4/estado	Canal 4 — tira pulsador interior P2

// Petición (igual para p1, p2, p3 y p4):
POST http://192.168.10.20/api/p1/estado
Content-Type: application/json

{ "estado": "libre" }   // libre | ocupado | abriendo | apagado

// Respuesta:
{ "ok": true, "canal": 1, "estado": "libre" }

// Errores posibles:
// 400 { "error": "Valores: libre|ocupado|abriendo|apagado" }
// 400 { "error": "JSON invalido" }

3.3  Ejemplo de integración Python (zaguan_led.py)
El módulo zaguan_led.py incluye funciones de alto nivel para simplificar la integración:

from zaguan_led import set_estado, set_estado_puerta, set_estado_todos, EstadoLED

# Cambiar un canal individual:
await set_estado(1, EstadoLED.LIBRE)        # Canal 1 → verde
await set_estado(3, EstadoLED.OCUPADO)      # Canal 3 → rojo

# Cambiar los 2 canales de una puerta a la vez (en paralelo):
await set_estado_puerta(1, EstadoLED.OCUPADO)   # Canales 1 y 3 → rojo
await set_estado_puerta(2, EstadoLED.ABRIENDO)  # Canales 2 y 4 → naranja

# Apagar todos los canales (emergencia, fuera de horario):
await set_estado_todos(EstadoLED.APAGADO)

3.4  Ejemplo de integración C# / .NET
using var client = new HttpClient();
var content = new StringContent(
    "{"estado":"libre"}",
    Encoding.UTF8, "application/json");

var response = await client.PostAsync(
    "http://192.168.10.20/api/p1/estado", content);

string json = await response.Content.ReadAsStringAsync();
// json = { "ok": true, "canal": 1, "estado": "libre" }
 
4. Pulsadores físicos — notificación al backend
El ESP32 tiene 4 entradas físicas (una por canal) conectadas a pulsadores tipo NO (Normalmente Abierto). Cuando el usuario pulsa un botón, el ESP32 notifica inmediatamente al backend FastAPI mediante un HTTP POST (fire and forget — no espera respuesta).

4.1  Comportamiento de los pulsadores

Parámetro	Valor	Descripción
Debounce	50 ms	Tiempo mínimo que debe mantenerse pulsado para considerar la pulsación válida. Filtra rebotes mecánicos.
Bloqueo post-pulsación	2000 ms	Tiempo de espera tras una pulsación antes de aceptar la siguiente. Evita disparos múltiples.
Estado apagado	Ignorado	Si el canal está en estado apagado, la pulsación no se notifica al backend.
Tipo	Fire and forget	El ESP32 lanza el POST y continúa sin esperar respuesta del backend.

4.2  Endpoint que recibe el backend
El ESP32 llama a estas rutas cuando detecta una pulsación. El software debe implementar estos 4 endpoints:

POST	/zaguan/pulsacion/p1	Pulsación canal 1 (exterior calle)

POST	/zaguan/pulsacion/p2	Pulsación canal 2 (exterior oficina)

POST	/zaguan/pulsacion/p3	Pulsación canal 3 (interior P1)

POST	/zaguan/pulsacion/p4	Pulsación canal 4 (interior P2)

// Petición que manda el ESP32 al backend:
POST http://192.168.10.10:8000/zaguan/pulsacion/p1
Content-Type: application/json

{
  "canal": 1,            // 1-4
  "ts": 1714123456789    // millis() del ESP32 — timestamp relativo al arranque
}

// El backend debe responder rápido (el ESP32 tiene timeout 1s):
{ "ok": true, "canal": "p1" }

// Si el backend no responde en 1s, el ESP32 continúa sin error.
// El fire-and-forget garantiza que la pulsación nunca bloquea los LEDs.

4.3  Implementación en FastAPI (zaguan_esp32.py)
El módulo zaguan_esp32.py implementa los 4 endpoints y un sistema de callback para conectar las pulsaciones con la lógica de apertura:

# En server.py — registrar el módulo y el callback:
from zaguan_esp32 import router as esp32_router, registrar_callback_pulsacion

app.include_router(esp32_router)

async def gestionar_pulsacion(canal: str, ts: int):
    """
    Se ejecuta cada vez que el ESP32 notifica una pulsación.
    canal → "p1" | "p2" | "p3" | "p4"
    ts    → millis() del ESP32 (timestamp relativo)
    """
    logger.info(f"Pulsacion en {canal}")

    # Aquí va la lógica de apertura de puerta:
    if canal == "p1":
        await abrir_puerta_exterior()   # lógica propia del sistema
    elif canal == "p3":
        await abrir_puerta_interior_p1()
    # ...

registrar_callback_pulsacion(gestionar_pulsacion)

Lógica entre puertas en el backend
El ESP32 notifica pulsaciones de forma ciega — no conoce el estado de la otra puerta ni aplica lógica de esclusa. Toda la lógica entre puertas (P1 no abre si P2 está abierta, antiatrapamiento, etc.) debe implementarse en el backend cuando recibe el evento de pulsación.
 
5. Sincronización de estado al arrancar
Al conectar el Ethernet, el ESP32 consulta automáticamente al backend para obtener el estado real de cada canal antes de iniciar las animaciones. Esto garantiza que los LEDs siempre reflejan el estado correcto, independientemente de quién arrancó primero.

5.1  Flujo de arranque

Paso	Acción	Duración
1	Arranque — test visual verde→rojo→apagado en todos los canales	1.2 segundos
2	Conectar Ethernet y obtener IP	2-5 segundos
3	GET al backend para obtener estado de los 4 canales	Inmediato
4a	Si el backend responde: aplica estados y arranca animaciones	Inmediato
4b	Si el backend no responde: reintenta cada 5s hasta 20 veces	Hasta 100s
5	Tras 20 fallos: arranca en APAGADO y sigue reintentando en background	Indefinido

5.2  Endpoint que debe implementar el backend

GET	/zaguan/estado	El ESP32 consulta este endpoint al arrancar

// El ESP32 hace GET a esta URL al conectar:
GET http://192.168.10.10:8000/zaguan/estado

// El backend debe responder con el estado actual de los 4 canales:
{
  "p1": "libre",     // Canal 1 — tira exterior calle
  "p2": "ocupado",   // Canal 2 — tira exterior oficina
  "p3": "libre",     // Canal 3 — tira pulsador interior P1
  "p4": "apagado"    // Canal 4 — tira pulsador interior P2
}

// Valores válidos para cada canal: libre | ocupado | abriendo | apagado
// Si falta alguna clave, ese canal queda en "apagado".

El backend debe mantener siempre actualizado el estado de los canales para que la respuesta a este endpoint sea correcta. El módulo zaguan_esp32.py proporciona la función actualizar_estado_canal() para ello:

from zaguan_esp32 import actualizar_estado_canal

# Llamar siempre que cambie el estado de un canal:
actualizar_estado_canal("p1", "ocupado")
actualizar_estado_canal("p2", "libre")

# Esto garantiza que el ESP32 obtenga el estado correcto
# si se reconecta o reinicia.

5.3  Consultar estado de sincronización

GET	/api/ping	Health check — incluye estado de sincronización

GET http://192.168.10.20/api/ping

// Respuesta:
{ "pong": true, "sync": true }   // sync=false si aún no se ha sincronizado

GET	/api/estado	Estado completo de los 4 canales

GET http://192.168.10.20/api/estado

// Respuesta:
{
  "ip": "192.168.10.20",
  "sync": true,
  "canales": [
    { "canal": 1, "estado": "libre",   "pulsaciones": 3 },
    { "canal": 2, "estado": "ocupado", "pulsaciones": 1 },
    { "canal": 3, "estado": "libre",   "pulsaciones": 3 },
    { "canal": 4, "estado": "apagado", "pulsaciones": 0 }
  ]
}
// "pulsaciones" = contador total de pulsaciones desde el último arranque
 
6. Configuración avanzada — canales y estados
Todos los parámetros visuales son configurables en caliente desde el software sin recompilar el firmware. Los cambios se guardan en la memoria NVS del ESP32 y persisten tras reinicios.

6.1  Configurar número de LEDs y brillo por canal

POST	/api/config/canal	Configura LEDs y brillo de un canal

POST http://192.168.10.20/api/config/canal
Content-Type: application/json

{
  "canal":  1,    // 1-4 (obligatorio)
  "leds":   60,   // Número de LEDs activos (1-100, opcional)
  "brillo": 150   // Brillo 0-255 (opcional)
}

// Respuesta:
{ "ok": true, "canal": 1, "leds": 60, "brillo": 150 }

6.2  Configurar animación y color por estado

POST	/api/config/estado	Configura color, animación y velocidad de un estado

POST http://192.168.10.20/api/config/estado
Content-Type: application/json

{
  "estado":    "libre",          // libre|ocupado|abriendo|apagado (obligatorio)
  "canal":     1,                // 1-4 opcional — si se omite aplica a todos los canales
  "color":     [0, 220, 0],      // RGB 0-255 (opcional)
  "animacion": "respiracion",    // fijo|respiracion|parpadeo|barrido (opcional)
  "velocidad": 2000              // ms — significado según animación (opcional)
}

// Respuesta:
{ "ok": true, "estado": "libre" }

// Velocidad según animación:
//   respiracion → duración del ciclo completo en ms (default: 3000)
//   parpadeo    → duración del ciclo ON+OFF en ms (default: 1000)
//   barrido     → ms entre pasos del barrido (default: 30 = más rápido)
//   fijo        → ignorado

6.3  Animaciones disponibles

Animación	Descripción	Parámetro velocidad
fijo	Color fijo sin variación	No aplica
respiracion	El brillo oscila suavemente entre 15% y 100% de forma sinusoidal	Duración del ciclo en ms (ej: 3000 = ciclo de 3 segundos)
parpadeo	ON durante el 80% del ciclo, OFF durante el 20% restante	Duración del ciclo ON+OFF en ms (ej: 1000 = 1Hz)
barrido	Un cometa recorre la tira con cola de degradado de 8 LEDs	ms entre cada paso (ej: 30 = rápido, 100 = lento)

6.4  Consultar configuración completa

GET	/api/config	Devuelve toda la configuración del dispositivo

GET http://192.168.10.20/api/config

// Respuesta:
{
  "red": {
    "ip": "192.168.10.20",
    "gateway": "192.168.10.1",
    "subnet": "255.255.255.0",
    "backend_ip": "192.168.10.10",
    "backend_puerto": 8000,
    "backend_ruta": "/zaguan/estado",
    "pulsacion_ruta": "/zaguan/pulsacion"
  },
  "sync": { "completada": true, "intentos": 1, "background": false },
  "canales": [
    {
      "canal": 1, "leds": 60, "brillo": 150,
      "gpio_led": 2, "gpio_boton": 15,
      "estados": [
        { "estado": "libre",    "color": [0,200,0],   "animacion": "respiracion", "velocidad": 3000 },
        { "estado": "ocupado",  "color": [200,0,0],   "animacion": "parpadeo",    "velocidad": 1000 },
        { "estado": "abriendo", "color": [200,100,0], "animacion": "barrido",     "velocidad": 30   },
        { "estado": "apagado",  "color": [0,0,0],     "animacion": "fijo",        "velocidad": 0    }
      ]
    },
    // ... canales 2, 3 y 4 con la misma estructura
  ]
}
 
7. Referencia completa de endpoints

7.1  Endpoints que el software llama en el ESP32

Método	URL	Descripción	Body requerido
POST	/api/p1/estado	Cambiar estado canal 1	{estado}
POST	/api/p2/estado	Cambiar estado canal 2	{estado}
POST	/api/p3/estado	Cambiar estado canal 3	{estado}
POST	/api/p4/estado	Cambiar estado canal 4	{estado}
POST	/api/config/red	Configurar red y backend	{ip, gateway, subnet, backend_ip, backend_puerto, backend_ruta, pulsacion_ruta}
POST	/api/config/canal	Configurar LEDs y brillo	{canal, leds?, brillo?}
POST	/api/config/estado	Configurar animación de estado	{estado, canal?, color?, animacion?, velocidad?}
GET	/api/config	Obtener configuración completa	—
GET	/api/estado	Obtener estado actual 4 canales	—
GET	/api/ping	Health check	—

7.2  Endpoints que el backend debe implementar
El ESP32 llama a estos endpoints del backend. El software debe implementarlos:

Método	URL en el backend	Cuándo la llama el ESP32	Body recibido
GET	/zaguan/estado	Al arrancar y en reintentos de sync	— (no tiene body)
POST	/zaguan/pulsacion/p1	Pulsación botón canal 1	{canal, ts}
POST	/zaguan/pulsacion/p2	Pulsación botón canal 2	{canal, ts}
POST	/zaguan/pulsacion/p3	Pulsación botón canal 3	{canal, ts}
POST	/zaguan/pulsacion/p4	Pulsación botón canal 4	{canal, ts}

7.3  Códigos de respuesta HTTP

Código	Significado	Cuándo ocurre
200 OK	Operación completada correctamente	Siempre que la petición es válida
204 No Content	Preflight CORS aceptado	Peticiones OPTIONS del navegador
400 Bad Request	Error en el body o parámetros	JSON inválido, estado desconocido, canal fuera de rango
 
8. Ejemplos de flujos completos

8.1  Flujo: usuario pulsa botón exterior (calle) para entrar

Paso	Actor	Acción	API
1	Usuario	Pulsa botón exterior P1 (canal 1)	—
2	ESP32	Detecta pulsación con debounce 50ms	—
3	ESP32	POST /zaguan/pulsacion/p1 al backend	Fire and forget
4	Backend	Evalúa lógica: ¿zaguán libre?	Lógica interna
5a	Backend	Si libre: POST /api/p1/estado {"estado":"abriendo"} al ESP32	Canal 1 → naranja
5b	Backend	Abre cerradura P1 (ETD8A12)	Modbus TCP
6	Backend	Tras delay: POST /api/p1/estado {"estado":"ocupado"} al ESP32	Canal 1 → rojo
7	Backend	actualizar_estado_canal("p1", "ocupado")	Estado sincronizado
8	Usuario	Entra en el zaguán	—
9	Backend	Al salir: POST /api/p1/estado {"estado":"libre"}	Canal 1 → verde

8.2  Flujo: modo emergencia — apagar todos los canales

// Desde Python (zaguan_led.py):
await set_estado_todos(EstadoLED.APAGADO)

// Equivalente en llamadas directas:
POST http://192.168.10.20/api/p1/estado { "estado": "apagado" }
POST http://192.168.10.20/api/p2/estado { "estado": "apagado" }
POST http://192.168.10.20/api/p3/estado { "estado": "apagado" }
POST http://192.168.10.20/api/p4/estado { "estado": "apagado" }

// Los pulsadores en estado "apagado" son ignorados por el ESP32.
// No se notifica ninguna pulsación al backend mientras estén apagados.

8.3  Flujo: cambiar brillo de todos los canales tras instalación

// Ajustar brillo de tiras grandes (canales 1 y 2) más tenue:
POST /api/config/canal { "canal": 1, "brillo": 120 }
POST /api/config/canal { "canal": 2, "brillo": 120 }

// Pulsadores interior (canales 3 y 4) más brillantes:
POST /api/config/canal { "canal": 3, "brillo": 220, "leds": 5 }
POST /api/config/canal { "canal": 4, "brillo": 220, "leds": 5 }

// Los cambios son inmediatos y persisten tras reinicios.

8.4  Flujo: personalizar color de estado libre solo en canal 1

// Verde más intenso y respiración más lenta solo en canal 1:
POST /api/config/estado
{
  "estado":    "libre",
  "canal":     1,
  "color":     [0, 255, 80],
  "animacion": "respiracion",
  "velocidad": 4000
}

// Sin "canal" → aplica el mismo cambio a los 4 canales:
POST /api/config/estado
{
  "estado":    "ocupado",
  "color":     [255, 0, 0],
  "animacion": "parpadeo",
  "velocidad": 500
}
 
9. Monitorización y diagnóstico

9.1  Health check desde el COCE
Para el Centro de Control (COCE), se recomienda hacer ping a cada ESP32 cada 30 segundos y alertar si no responde en 2 segundos:

from zaguan_led import ping

async def check_esp32(ip: str) -> bool:
    """Devuelve True si el ESP32 está online y sincronizado."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"http://{ip}/api/ping")
            data = r.json()
            return r.status_code == 200 and data.get("sync", False)
    except Exception:
        return False

9.2  Indicadores de estado en el Monitor Serie
Durante el desarrollo y puesta en marcha, conectar el USB-C al PC y abrir el Monitor Serie a 115200 baudios. Los mensajes de log permiten diagnosticar cualquier problema:

Mensaje	Significado	Acción si aparece
[LED] Test arranque OK	Todos los LEDs responden	OK — continuar
[ETH] IP: 192.168.10.20	Ethernet conectado con IP correcta	OK — continuar
[SYNC] GET ... (intento 1)	Intentando sincronizar con backend	Verificar que el backend está arrancado
[SYNC] OK tras 1 intento	Sincronización completada	OK — el sistema está listo
[SYNC] Error HTTP 404	Backend no tiene el endpoint /zaguan/estado	Implementar el endpoint en el backend
[SYNC] 20 intentos fallidos	Backend no responde — arranca en APAGADO	Verificar IP y puerto del backend
[BTN] C1 pulsado (#1)	Pulsador canal 1 detectado	OK — verificar que el backend recibe el POST
[BTN] canal APAGADO — ignorado	Pulsación ignorada por estar apagado	Normal si el canal está en modo apagado
[RED] Nueva IP aplicada	Cambio de IP completado	OK — usar nueva IP para las siguientes llamadas

9.3  Diagnóstico rápido desde PowerShell

# Verificar que el ESP32 responde:
Invoke-WebRequest http://192.168.10.20/api/ping

# Ver estado completo:
Invoke-WebRequest http://192.168.10.20/api/estado

# Probar estado libre en canal 1:
Invoke-WebRequest -Uri http://192.168.10.20/api/p1/estado `
  -Method POST -ContentType "application/json" `
  -Body '{"estado":"libre"}'

# Ver configuración completa:
Invoke-WebRequest http://192.168.10.20/api/config



10. Resumen rápido para el desarrollador

Checklist de integración
Los 5 puntos que el equipo de desarrollo debe implementar para una integración completa:

1.	Implementar GET /zaguan/estado en el backend — devuelve el estado de los 4 canales para la sincronización al arranque del ESP32.
2.	Implementar POST /zaguan/pulsacion/p{1-4} en el backend — recibe las notificaciones de pulsación del ESP32 y ejecuta la lógica de apertura.
3.	Llamar a POST /api/p{1-4}/estado en el ESP32 cada vez que cambia el estado de un canal (apertura, cierre, modo esclusa, emergencia, etc.).
4.	Llamar a actualizar_estado_canal() en el módulo zaguan_esp32.py cada vez que cambia el estado, para mantener el GET /zaguan/estado siempre actualizado.
5.	Configurar la IP del backend en el ESP32 con POST /api/config/red en la primera instalación. Repetir si cambia la IP del servidor.


SAIMA Seguridad  |  jiglesias@inviasistemas.es  |  Firmware v2.2
