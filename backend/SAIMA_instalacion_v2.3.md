SAIMA SEGURIDAD
Control de Accesos — Banco Santander
Guia de Instalacion y Puesta en Marcha
Waveshare ESP32-S3-ETH — 4 canales LED + 4 pulsadores — Zaguan Santander

Version 2.3  |  Firmware zaguan_led_firmware.ino  |  OTA TCP puerto 8266
 
1. Materiales necesarios
Verificar todos los componentes antes de comenzar la instalacion de cada acceso (par de puertas P1+P2).

#	Componente	Especificacion	Cant./acceso	Aprox.
1	Waveshare ESP32-S3-ETH	ESP32-S3R8, W5500 Ethernet, USB-C integrado	2 (1 por puerta)	17-22 EUR/ud
2	Tira LED WS2812B	5V, 60 LEDs/m, 1 metro, IP65	2 (1 por puerta)	10 EUR/ud
3	Pulsador NO	Normalmente abierto, industrial IP54	4 (1 por canal)	5-10 EUR/ud
4	Condensador electrolitico	1000 uF/6.3V proteccion picos WS2812B	2	1 EUR/ud
5	Resistencia 330 Ohm	0.25W linea datos GPIO a DI tira	4 (1 por canal)	menos 1 EUR
6	Cable USB-C	Para programar durante desarrollo	1	disponible
7	Switch PoE IEEE 802.3af	Puerto libre en la sucursal	1	en proyecto
8	Cable RJ45 Cat5e/6	Desde switch PoE hasta cada ESP32	2	variable

Un ESP32 por puerta
Cada puerta tiene su propio ESP32-S3-ETH con su tira LED y 2 pulsadores. Total por acceso: 2 dispositivos ESP32, 2 tiras LED, 4 pulsadores.
 
2. Conexionado fisico
2.1  Mapa de pines

GPIO	Funcion	Conexion	Notas
GPIO 2	Data LED canal 1	R330Ohm -> DI tira WS2812B C1	Cara calle exterior P1
GPIO 4	Data LED canal 2	R330Ohm -> DI tira WS2812B C2	Cara oficina exterior P2
GPIO 5	Data LED canal 3	R330Ohm -> DI tira WS2812B C3	Pulsador interior P1
GPIO 6	Data LED canal 4	R330Ohm -> DI tira WS2812B C4	Pulsador interior P2
GPIO 15	Pulsador canal 1	Pulsador NO -> GND	INPUT_PULLUP activo LOW al pulsar
GPIO 16	Pulsador canal 2	Pulsador NO -> GND	INPUT_PULLUP activo LOW al pulsar
GPIO 17	Pulsador canal 3	Pulsador NO -> GND	INPUT_PULLUP activo LOW al pulsar
GPIO 18	Pulsador canal 4	Pulsador NO -> GND	INPUT_PULLUP activo LOW al pulsar
5V header	Alimentacion tiras	+ tiras WS2812B + condensadores	Max 500mA desde PoE
GND	Masa comun	- tiras + condensadores + pulsadores	GND comun obligatorio
RJ45 + PoE	Ethernet + alimentacion	Switch PoE sucursal	Un solo cable por ESP32
GPIO 9-14	W5500 interno	NO conectar nada	Reservados chip Ethernet W5500

2.2  Diagrama de conexiones

  Waveshare ESP32-S3-ETH
  +----------------------------------------------+
  |  GPIO  2 ---[R330]---> DI tira LED canal 1   |
  |  GPIO  4 ---[R330]---> DI tira LED canal 2   |
  |  GPIO  5 ---[R330]---> DI tira LED canal 3   |
  |  GPIO  6 ---[R330]---> DI tira LED canal 4   |
  |                                              |
  |  GPIO 15 <---[Pulsador C1 NO]--- GND         |
  |  GPIO 16 <---[Pulsador C2 NO]--- GND         |
  |  GPIO 17 <---[Pulsador C3 NO]--- GND         |
  |  GPIO 18 <---[Pulsador C4 NO]--- GND         |
  |                                              |
  |  5V --------> +5V tiras (x4) + condensadores |
  |  GND -------> GND tiras + GND pulsadores     |
  |                                              |
  |  RJ45 <------> Switch PoE (datos + 48V)      |
  +----------------------------------------------+

  Condensador 1000uF: en paralelo con +5V/GND lo mas cerca de cada tira.
  Pulsadores: contacto NO entre el GPIO correspondiente y GND.

NUNCA conectar PoE y USB-C al mismo tiempo. Riesgo de dano en la placa o en el PC.
danger
 
3. Carga del firmware por USB
3.1  Configuracion Arduino IDE

Parametro	Valor requerido
Placa	ESP32S3 Dev Module
USB CDC On Boot	Enabled — necesario para Monitor Serie por USB-C
Flash Size	16MB (128Mb)
Partition Scheme	Minimo 3MB APP con espacio libre para OTA
PSRAM	OPI PSRAM
Upload Speed	921600

Partition Scheme
Si el sketch supera el 90% del espacio de flash, cambiar a una particion con mas espacio de APP. El OTA necesita espacio libre para la particion de actualizacion.

3.2  Librerias requeridas

Libreria	Autor	Instalacion
FastLED	Daniel Garcia	Gestor de librerias Arduino IDE
ArduinoJson	Benoit Blanchon	Gestor de librerias — version 6.x o 7.x
ETH, WebServer, HTTPClient, Update	Espressif	Incluidas en core ESP32 v3.x — no instalar
Preferences	Espressif	Incluida en core ESP32 v3.x — no instalar

3.3  Configurar IP antes de compilar
Editar en zaguan_led_firmware.ino antes de cargar en cada dispositivo:

// Linea 67 — Version (incrementar en cada build para OTA):
#define FIRMWARE_VERSION     "2.3.0"
#define FIRMWARE_VERSION_INT  230

// Linea 53 — IP estatica del ESP32:
IPAddress ip(192, 168, 10, 20);   // P1 exterior calle
IPAddress ip(192, 168, 10, 21);   // P2 exterior oficina
// Rango recomendado fuera del DHCP: 192.168.10.20 a 192.168.10.29

3.4  Pasos de carga por USB

1.	Conectar cable USB-C entre ESP32 y PC
2.	Arduino IDE: Herramientas -> Puerto -> seleccionar COM del ESP32
3.	Pulsar boton Subir (flecha ->)
4.	Si falla: mantener BOOT pulsado, conectar USB-C, soltar BOOT, reintentar
5.	Abrir Monitor Serie a 115200 baudios y pulsar RST en la placa

Salida esperada en el Monitor Serie:

[SAIMA] Firmware LED Zaguan v2.3.0
[SAIMA] 4 canales + OTA TCP + flash confirmacion
[LED] Test arranque OK
[OTA] Servidor TCP OTA en puerto 8266
[HTTP] Servidor listo en puerto 80
[ETH] IP obtenida — servidor HTTP activo
[SYNC] Intento 1/20 — GET http://192.168.10.10:8000/zaguan/estado

3.5  Configurar backend tras la primera carga
Una vez conectado el cable Ethernet, configurar la direccion del backend (solo en la primera instalacion):

# PowerShell — configurar IP del backend en el ESP32:
Invoke-WebRequest -Uri http://192.168.10.20/api/config/red `
  -Method POST -ContentType "application/json" `
  -Body '{"backend_ip":"192.168.10.10","backend_puerto":8000,
  "backend_ruta":"/zaguan/estado","pulsacion_ruta":"/zaguan/pulsacion"}'
 
4. Actualizacion OTA por red
Una vez instalado el firmware inicial por USB, las actualizaciones posteriores se realizan por red sin acceso fisico al dispositivo.

4.1  Protocolo OTA — TCP puerto 8266

Paso	Actor	Accion
1	COCE	Conectar TCP a IP_ESP32:8266
2	ESP32	Responder OTA_READY
3	COCE	Enviar 4 bytes con el tamanio del .bin (little-endian uint32)
4	COCE	Enviar el .bin completo en chunks de 1KB
5	ESP32	LEDs azul fijo durante la recepcion del firmware
6	ESP32	LEDs verde fijo al completar la escritura en flash
7	ESP32	Responder OTA_OK o OTA_ERROR:descripcion
8	ESP32	Reiniciar automaticamente con el nuevo firmware

4.2  Script Python ota_update.py

# Sintaxis:
python ota_update.py <ip_esp32> <ruta_bin>

# Ejemplo:
python ota_update.py 192.168.10.20 C:\OTA\zaguan_led_firmware.ino.bin

# Salida esperada:
[OTA] Conectando a 192.168.10.20:8266...
[OTA] Firmware: 1258560 bytes
ESP32: OTA_READY
[OTA] Progreso: 1258560/1258560 bytes (100%)
ESP32: OTA_OK
[OTA] Actualizacion completada — ESP32 reiniciando...

Archivo correcto para OTA
Usar SOLO zaguan_led_firmware.ino.bin (NO el merged.bin). Recomendado: copiar a ruta sin espacios como C:\OTA\.

4.3  Rollback automatico
Si el firmware nuevo no consigue sincronizar con el backend en 60 segundos, el ESP32 vuelve automaticamente al firmware anterior. Protege ante actualizaciones defectuosas.

# Verificar version y estado tras OTA (esperar 20s al reboot):
Invoke-WebRequest http://192.168.10.20/api/ota/version

# Respuesta — firmware validado correctamente:
{"version":"2.3.1","particion_activa":"app1","pendiente_validacion":false}

# pendiente_validacion:false -> OK, rollback cancelado
# pendiente_validacion:true  -> esperando sync (60s para rollback automatico)
 
5. Lista de verificacion — firmar antes de instalar
Completar esta lista para cada dispositivo ESP32 antes de darlo por instalado en la sucursal.

#	Prueba	Procedimiento	Resultado esperado
1	Arranque LED	Conectar alimentacion y observar tira 3 segundos	Verde 400ms -> Rojo 400ms -> Apagado
2	Ping Ethernet	ping 192.168.10.2X desde PC sucursal	Respuesta menos de 2ms, 0% perdida
3	API ping	Invoke-WebRequest http://IP/api/ping	HTTP 200 — pong:true, version:2.3.0
4	Estado libre	POST /api/p1/estado {estado:libre}	Tira verde con respiracion suave
5	Estado ocupado	POST /api/p1/estado {estado:ocupado}	Tira roja parpadeando 1Hz
6	Estado abriendo	POST /api/p1/estado {estado:abriendo}	Cometa naranja recorriendo la tira
7	Estado apagado	POST /api/p1/estado {estado:apagado}	Todos los LEDs apagados
8	Pulsador activo	Canal en libre, pulsar GPIO 15	3 destellos blancos -> vuelve a verde respiracion
9	Pulsador apagado	Canal en apagado, pulsar GPIO 15	2 destellos rojos -> vuelve a apagado (negro)
10	Todos los canales	Repetir 4-9 para canales 2, 3 y 4	Mismo comportamiento en los 4 canales
11	OTA	Subir .bin con version incrementada	LED azul -> verde -> reboot -> nueva version
12	Respuesta rapida	POST estado desde software de control	LED cambia en menos de 100ms
 
6. Resolucion de problemas

Sintoma	Causa probable	Solucion
Tira no enciende en arranque	Cable DI desconectado o R330Ohm ausente	Verificar continuidad GPIO -> R330Ohm -> DI con multimetro
ESP32 se resetea al encender tira	Condensador ausente — pico de corriente	Instalar 1000uF en pads +5V/GND de la tira lo mas cerca posible
Puerto COM no aparece en Windows	Driver USB no instalado	Instalar driver desde pagina oficial Waveshare ESP32-S3-ETH
No responde al ping	IP en conflicto o switch sin PoE	Verificar LED link en RJ45. Confirmar IP libre en la LAN.
OTA: sin respuesta en puerto 8266	Firewall bloqueando TCP 8266	Verificar que el puerto 8266 TCP es accesible en la LAN
OTA: ESP32 no vuelve online	Rollback activado por fallo de sync	Verificar que el backend responde a /zaguan/estado correctamente
Pulsador no responde	Cable GPIO-GND mal conectado	Verificar pines: C1=GPIO15, C2=GPIO16, C3=GPIO17, C4=GPIO18
LEDs con colores aleatorios	GND no comun ESP32 y tira	Unir GND del ESP32 y GND de la tira en un punto fisico comun
Animaciones lentas	Firmware anterior a v2.3	Actualizar a v2.3 que usa show() unico por iteracion de loop


7. Referencia rapida

IPs: P1 exterior -> 192.168.10.20   P2 exterior -> 192.168.10.21
Puerto HTTP: 80    Puerto OTA TCP: 8266

Canales: C1(GPIO2/15)  C2(GPIO4/16)  C3(GPIO5/17)  C4(GPIO6/18)
Estados: libre | ocupado | abriendo | apagado

OTA: python ota_update.py <ip> <ruta.bin>

Flash confirmacion:
  POST /api/config/flash {"color":[128,128,128],"n_flashes":3,"duracion_ms":120}

Config brillo y LEDs:
  POST /api/config/canal {"canal":1,"leds":60,"brillo":150}

SAIMA Seguridad  |  jiglesias@inviasistemas.es  |  Firmware v2.3
