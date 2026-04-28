SAIMA SEGURIDAD
Control de Accesos — Banco Santander
API de Integracion ESP32-S3-ETH
Guia tecnica para el equipo de desarrollo del software de control de accesos

Version 2.3  |  4 canales LED  |  4 pulsadores fisicos  |  OTA TCP
 
1. Introduccion
El dispositivo ESP32-S3-ETH es el nodo de senalizacion LED de cada acceso (zaguan). Expone una API HTTP REST en el puerto 80 para recibir ordenes del software, y notifica al backend cuando se pulsa un boton fisico.

1.1  Arquitectura del sistema

Componente	Rol	Comunicacion
Software de control	Cerebro del sistema — gestiona logica de puertas y modos	HTTP POST al ESP32 puerto 80
ESP32-S3-ETH	Nodo LED — controla tiras y lee pulsadores	HTTP POST al backend al pulsar
Backend FastAPI	API central — recibe pulsaciones y orquesta estados	Expone /zaguan/estado y /zaguan/pulsacion

1.2  Mapa de canales

Canal	GPIO LED	GPIO Pulsador	Ubicacion fisica	Flash activo	Flash apagado
Canal 1	GPIO 2	GPIO 15	Tira P1 exterior calle	N destellos blancos + POST	2 destellos rojos + POST
Canal 2	GPIO 4	GPIO 16	Tira P2 exterior oficina	N destellos blancos + POST	2 destellos rojos + POST
Canal 3	GPIO 5	GPIO 17	Tira pulsador interior P1	N destellos blancos + POST	2 destellos rojos + POST
Canal 4	GPIO 6	GPIO 18	Tira pulsador interior P2	N destellos blancos + POST	2 destellos rojos + POST

Logica entre puertas en el backend
El ESP32 notifica pulsaciones de forma independiente por canal. Toda la logica entre puertas (esclusa, antiatrapamiento, modos) debe implementarse en el backend cuando recibe el evento de pulsacion.
 
2. Estados LED
2.1  Estados disponibles

Estado	Animacion por defecto	Color por defecto	Uso tipico
libre	Respiracion suave ciclo 3s	Verde (0, 200, 0)	Zaguan libre — se puede entrar
ocupado	Parpadeo 800ms ON / 200ms OFF	Rojo (200, 0, 0)	Zaguan ocupado — esperar
abriendo	Barrido cometa naranja	Naranja (200, 100, 0)	Puerta en proceso de apertura
apagado	Fijo apagado negro	Negro (0, 0, 0)	Fuera de servicio o emergencia

Configurables en caliente
Los colores, animaciones y velocidades son configurables por canal mediante POST /api/config/estado sin recompilar el firmware. Los cambios persisten en NVS tras reinicios.

2.2  Cambiar estado de un canal

POST	/api/p1/estado	Canal 1 — tira exterior calle

POST	/api/p2/estado	Canal 2 — tira exterior oficina

POST	/api/p3/estado	Canal 3 — tira pulsador interior P1

POST	/api/p4/estado	Canal 4 — tira pulsador interior P2

// Body — igual para los 4 canales:
{ "estado": "libre" }   // libre | ocupado | abriendo | apagado

// Respuesta HTTP 200:
{ "ok": true, "canal": 1, "estado": "libre" }

// Errores posibles:
// 400 { "error": "Valores: libre|ocupado|abriendo|apagado" }

2.3  Ejemplos de flujos
Modo COMERCIAL — zaguan libre
POST /api/p1/estado {"estado":"libre"}
POST /api/p2/estado {"estado":"libre"}
POST /api/p3/estado {"estado":"libre"}
POST /api/p4/estado {"estado":"libre"}

Modo COMERCIAL — usuario entrando con esclusa activa
// 1. Apertura P1:
POST /api/p1/estado {"estado":"abriendo"}  // naranja barrido
POST /api/p2/estado {"estado":"ocupado"}   // rojo P2 bloqueada por esclusa

// 2. Tras cierre P1, zaguan ocupado:
POST /api/p1/estado {"estado":"ocupado"}

// 3. Tras salir del zaguan:
POST /api/p1/estado {"estado":"libre"}
POST /api/p2/estado {"estado":"libre"}

Modo CERRADO o EMERGENCIA
// En apagado: pulsadores hacen 2 destellos rojos y notifican al backend
POST /api/p1/estado {"estado":"apagado"}
POST /api/p2/estado {"estado":"apagado"}
POST /api/p3/estado {"estado":"apagado"}
POST /api/p4/estado {"estado":"apagado"}
 
3. Pulsadores — notificacion al backend
3.1  Comportamiento de los pulsadores

Parametro	Valor	Descripcion
Debounce	50 ms	Tiempo minimo de pulsacion para considerar valida. Filtra rebotes mecanicos.
Bloqueo post-pulsacion	2000 ms	Tiempo de espera tras cada pulsacion. Evita disparos multiples.
Canal activo	Flash blanco N veces + POST backend	Destellos blancos configurables. Notifica siempre al backend.
Canal apagado	2 destellos rojos + POST backend	Indica visualmente que el canal esta fuera de servicio. Notifica al backend.
Sin Ethernet	Flash visual sin notificacion	Si no hay red, el flash visual se hace pero no se notifica al backend.

3.2  Endpoints que debe implementar el backend

POST	/zaguan/pulsacion/p1	Pulsacion canal 1 — el ESP32 llama a este endpoint

POST	/zaguan/pulsacion/p2	Pulsacion canal 2

POST	/zaguan/pulsacion/p3	Pulsacion canal 3

POST	/zaguan/pulsacion/p4	Pulsacion canal 4

// Body que manda el ESP32 al backend:
{
  "canal":  1,          // 1-4
  "ts":     1714123456, // millis() del ESP32 relativo al arranque
  "estado": "libre"     // estado del canal al pulsar
                        // "apagado" indica canal fuera de servicio
}

// El backend debe responder en menos de 1 segundo (timeout del ESP32):
{ "ok": true, "canal": "p1" }

// Fire and forget: si el backend no responde, el ESP32 continua sin error.

3.3  Implementacion en FastAPI
from zaguan_esp32 import router as esp32_router, registrar_callback_pulsacion
app.include_router(esp32_router)

async def gestionar_pulsacion(canal: str, ts: int):
    # canal = "p1" | "p2" | "p3" | "p4"
    # ts = timestamp millis() del ESP32
    if canal == "p1":
        await abrir_puerta_exterior()
    # ...

registrar_callback_pulsacion(gestionar_pulsacion)
 
4. Sincronizacion al arrancar
Al conectar el Ethernet, el ESP32 consulta automaticamente al backend para obtener el estado real de cada canal antes de iniciar las animaciones.

4.1  Endpoint que debe implementar el backend

GET	/zaguan/estado	El ESP32 consulta este endpoint al arrancar y en reintentos de sync

// Respuesta esperada por el ESP32:
{
  "p1": "libre",
  "p2": "ocupado",
  "p3": "libre",
  "p4": "apagado"
}
// Valores validos: libre | ocupado | abriendo | apagado
// Si falta alguna clave, ese canal queda en apagado.

4.2  Logica de reintentos

Intentos	Intervalo	Comportamiento
1 al 20	Cada 5 segundos	Intenta GET /zaguan/estado. Si responde OK: aplica estados y arranca animaciones.
Intento 21+	Cada 5 segundos	Arranca en APAGADO. Sigue reintentando en background indefinidamente.
Cualquier exito	—	Aplica estados recibidos. Si es post-OTA, marca firmware como valido (cancela rollback).

4.3  Mantener el estado actualizado
from zaguan_esp32 import actualizar_estado_canal

# Llamar siempre que cambie el estado de un canal:
actualizar_estado_canal("p1", "ocupado")
actualizar_estado_canal("p2", "libre")

# Garantiza que el ESP32 obtenga el estado correcto
# si se reconecta, reinicia o hace rollback tras OTA.
 
5. Configuracion avanzada
5.1  Configurar brillo y LEDs por canal

POST	/api/config/canal	Configura brillo y numero de LEDs de un canal

{
  "canal":  1,    // 1-4 (obligatorio)
  "leds":   60,   // Numero de LEDs activos 1-100 (opcional)
  "brillo": 150   // Brillo 0-255 (opcional)
}
// Respuesta: { "ok": true, "canal": 1, "leds": 60, "brillo": 150 }

5.2  Configurar animacion y color por estado

POST	/api/config/estado	Configura color, animacion y velocidad de un estado

{
  "estado":    "libre",       // libre|ocupado|abriendo|apagado (obligatorio)
  "canal":     1,             // 1-4 opcional — sin canal aplica a todos
  "color":     [0, 220, 0],   // RGB 0-255 (opcional)
  "animacion": "respiracion", // fijo|respiracion|parpadeo|barrido (opcional)
  "velocidad": 2000           // ms — significado segun animacion (opcional)
}

// Velocidad segun animacion:
//   respiracion -> duracion del ciclo completo en ms (default: 3000)
//   parpadeo    -> duracion ON+OFF en ms (default: 1000)
//   barrido     -> ms entre pasos (default: 30 = rapido)
//   fijo        -> ignorado

5.3  Configurar flash de confirmacion al pulsar

POST	/api/config/flash	Configura el flash visual al pulsar un boton

{
  "color":       [128, 128, 128],  // RGB del destello (default: blanco suave)
  "n_flashes":   3,                // Numero de destellos 1-10 (default: 3)
  "duracion_ms": 120               // Duracion ON+OFF por destello (default: 120ms)
}

// Nota: el flash en canal apagado usa siempre rojo fijo (2 destellos),
// independientemente de esta configuracion.

5.4  Configurar red y backend

POST	/api/config/red	Configura red y direccion del backend — persiste en NVS

{
  "ip":              "192.168.10.20",    // IP propia del ESP32
  "gateway":         "192.168.10.1",     // Puerta de enlace
  "subnet":          "255.255.255.0",    // Mascara de red
  "backend_ip":      "192.168.10.10",    // IP del servidor FastAPI
  "backend_puerto":  8000,               // Puerto del servidor
  "backend_ruta":    "/zaguan/estado",   // GET al arrancar para sync
  "pulsacion_ruta":  "/zaguan/pulsacion" // Base POST al pulsar
}
// El ESP32 aplica la nueva IP en caliente y se reconecta automaticamente.
 
6. OTA — Actualizacion remota desde el COCE
6.1  Protocolo TCP puerto 8266
El OTA usa un protocolo TCP binario propio, disenado para manejar archivos grandes sin las limitaciones del WebServer HTTP del ESP32.

# Script Python ota_update.py:
python ota_update.py <ip_esp32> <ruta_bin>

# Ejemplo:
python ota_update.py 192.168.10.20 C:\OTA\zaguan_led_firmware.ino.bin

6.2  Endpoint de version

GET	/api/ota/version	Informacion de version y estado OTA del dispositivo

// Respuesta:
{
  "version":              "2.3.0",  // Version firmware actual
  "version_int":          230,       // Para comparacion numerica
  "version_anterior":     "2.2.0",  // Version antes del ultimo OTA
  "pendiente_validacion": false,     // true = rollback pendiente (60s)
  "rollback_timeout_s":   60,
  "sync_completada":      true,      // true = sincronizado con backend
  "uptime_s":             3600,      // Segundos desde ultimo arranque
  "particion_activa":     "app0"     // app0 o app1, alternan con cada OTA
}

6.3  Integracion en el COCE
from zaguan_ota import actualizar_sucursal, inventario_versiones

# Consultar versiones de todos los ESP32:
versiones = await inventario_versiones(["192.168.10.20", "192.168.10.21"])
# {"192.168.10.20": "2.3.0", "192.168.10.21": "2.3.0"}

# Actualizar todos los ESP32 de una sucursal en secuencia:
resultados = await actualizar_sucursal(
    ips=["192.168.10.20", "192.168.10.21"],
    bin_path="C:\\OTA\\zaguan_led_firmware.ino.bin",
    version_esperada="2.3.1"
)
 
7. Referencia completa de endpoints
7.1  Software llama al ESP32 (puerto 80 HTTP)

Metodo	URL	Body / Respuesta	Descripcion
POST	/api/p1/estado	{estado} / {ok,canal,estado}	Cambiar estado canal 1
POST	/api/p2/estado	{estado} / {ok,canal,estado}	Cambiar estado canal 2
POST	/api/p3/estado	{estado} / {ok,canal,estado}	Cambiar estado canal 3
POST	/api/p4/estado	{estado} / {ok,canal,estado}	Cambiar estado canal 4
POST	/api/config/red	{ip,gateway,subnet,backend_ip,...}	Configurar red y backend
POST	/api/config/canal	{canal,leds?,brillo?}	Configurar LEDs y brillo de un canal
POST	/api/config/estado	{estado,canal?,color?,animacion?,velocidad?}	Configurar visual de un estado
POST	/api/config/flash	{color,n_flashes,duracion_ms}	Configurar flash de confirmacion
GET	/api/config	— / config completa JSON	Consultar toda la configuracion del dispositivo
GET	/api/estado	— / {ip,sync,canales[]}	Estado actual de los 4 canales + pulsaciones
GET	/api/ping	— / {pong,sync,version}	Health check rapido
GET	/api/ota/version	— / {version,pendiente,...}	Info de version y estado OTA
TCP:8266	—	Protocolo binario OTA	Actualizacion de firmware por red

7.2  ESP32 llama al backend

Metodo	URL en el backend	Cuando	Body recibido
GET	/zaguan/estado	Al arrancar y en reintentos de sync	Sin body
POST	/zaguan/pulsacion/p1	Pulsacion boton canal 1	{canal,ts,estado}
POST	/zaguan/pulsacion/p2	Pulsacion boton canal 2	{canal,ts,estado}
POST	/zaguan/pulsacion/p3	Pulsacion boton canal 3	{canal,ts,estado}
POST	/zaguan/pulsacion/p4	Pulsacion boton canal 4	{canal,ts,estado}

Campo estado en pulsaciones
El campo "estado" en el body de pulsaciones indica si el canal estaba activo o apagado al pulsar. El backend puede usar este campo para distinguir una pulsacion normal de una pulsacion en zona fuera de servicio y actuar en consecuencia.
 
8. Checklist de integracion — 5 puntos obligatorios

1.	Implementar GET /zaguan/estado en el backend — devuelve el estado de los 4 canales para la sincronizacion al arranque del ESP32.
2.	Implementar POST /zaguan/pulsacion/p{1-4} en el backend — recibe notificaciones de pulsacion con los campos canal, ts y estado.
3.	Llamar a POST /api/p{1-4}/estado en el ESP32 cada vez que cambia el estado de un canal en el sistema de control.
4.	Llamar a actualizar_estado_canal() en zaguan_esp32.py tras cada cambio para mantener el GET /zaguan/estado siempre actualizado.
5.	Configurar la IP del backend en el ESP32 con POST /api/config/red en la primera instalacion o cuando cambie la IP del servidor.


9. Referencia rapida para desarrolladores

# Importar modulos Python:
from zaguan_led   import set_estado, set_estado_puerta, set_estado_todos, EstadoLED
from zaguan_esp32 import router, registrar_callback_pulsacion, actualizar_estado_canal
from zaguan_ota   import actualizar_sucursal, inventario_versiones

# Cambiar estado:
await set_estado(1, EstadoLED.LIBRE)           # canal 1 -> verde
await set_estado_puerta(1, EstadoLED.OCUPADO)  # canales 1 y 3 -> rojo
await set_estado_todos(EstadoLED.APAGADO)      # emergencia global

# Registrar callback de pulsacion:
registrar_callback_pulsacion(mi_funcion_apertura)

# OTA desde el COCE:
await actualizar_sucursal(["192.168.10.20","192.168.10.21"], "C:\\OTA\\fw.bin")

# Estados: libre | ocupado | abriendo | apagado
# Canales: 1=P1ext  2=P2ext  3=PulsIntP1  4=PulsIntP2
# Puerto HTTP ESP32: 80    Puerto OTA TCP: 8266

SAIMA Seguridad  |  jiglesias@inviasistemas.es  |  Firmware v2.3
