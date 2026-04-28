/**
 * ============================================================
 *  SAIMA SEGURIDAD — Control de Accesos Banco Santander
 *  Firmware Waveshare ESP32-S3-ETH — Señalización LED Zaguán
 *  Version 2.3 — OTA + rollback automático + flash confirmación
 * ============================================================
 *  Hardware:   Waveshare ESP32-S3-ETH (ESP32-S3R8 + W5500 SPI)
 *
 *  Canales LED (salidas):
 *    Canal 1 → GPIO 2  — Tira P1 exterior calle
 *    Canal 2 → GPIO 4  — Tira P2 exterior oficina
 *    Canal 3 → GPIO 5  — Tira pulsador interior P1
 *    Canal 4 → GPIO 6  — Tira pulsador interior P2
 *
 *  Pulsadores (entradas INPUT_PULLUP — activo LOW):
 *    Pulsador 1 → GPIO 15 — Canal 1
 *    Pulsador 2 → GPIO 16 — Canal 2
 *    Pulsador 3 → GPIO 17 — Canal 3
 *    Pulsador 4 → GPIO 18 — Canal 4
 *
 *  Pines W5500 (internos — NO modificar):
 *    SCK=13  MISO=12  MOSI=11  CS=14  IRQ=10  RST=9
 *
 *  Librerías requeridas:
 *    - FastLED
 *    - ArduinoJson  (Benoit Blanchon)
 *    - Preferences  (incluida en core ESP32)
 *    - HTTPClient   (incluida en core ESP32)
 *    - Update       (incluida en core ESP32)
 *
 *  OTA:
 *    POST /api/ota              — sube .bin directamente (multipart o raw)
 *    GET  /api/ota/version      — versión actual, anterior y estado OTA
 *    Rollback automático si no sincroniza con backend en 60s tras update
 *
 *  Flash de confirmación al pulsar:
 *    N destellos de color configurable al detectar pulsación válida
 *    POST /api/config/flash     — configura color, nFlashes y duración
 *
 *  API completa:
 *    POST /api/p{1-4}/estado    {"estado":"libre|ocupado|abriendo|apagado"}
 *    POST /api/config/red       {ip, gateway, subnet, backend_ip, backend_puerto,
 *                                backend_ruta, pulsacion_ruta}
 *    POST /api/config/canal     {canal, leds?, brillo?}
 *    POST /api/config/estado    {estado, canal?, color?, animacion?, velocidad?}
 *    POST /api/config/flash     {color?, n_flashes?, duracion_ms?}
 *    POST /api/ota              body = .bin raw
 *    GET  /api/config           configuración completa
 *    GET  /api/estado           estado actual 4 canales
 *    GET  /api/ping             health check
 *    GET  /api/ota/version      info de versión y OTA
 * ============================================================
 */

#include <ETH.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Update.h>
#include <SPI.h>
#include <Preferences.h>
#include <FastLED.h>
#include <ArduinoJson.h>
#include <esp_ota_ops.h>

// ── Versión del firmware ───────────────────────────────────
#define FIRMWARE_VERSION      "2.3.0"
#define FIRMWARE_VERSION_INT  230      // Para comparación numérica

// ── OTA: timeout de rollback ───────────────────────────────
// Si tras un update el ESP32 no sincroniza con el backend
// en este tiempo, vuelve al firmware anterior automáticamente
#define OTA_ROLLBACK_TIMEOUT_MS  60000   // 60 segundos

// ── Pines W5500 ────────────────────────────────────────────
#define W5500_SCK    13
#define W5500_MISO   12
#define W5500_MOSI   11
#define W5500_CS     14
#define W5500_INT    10
#define W5500_RST     9

// ── Pines LED ──────────────────────────────────────────────
#define PIN_C1   2
#define PIN_C2   4
#define PIN_C3   5
#define PIN_C4   6

// ── Pines pulsadores ───────────────────────────────────────
#define PIN_P1   15
#define PIN_P2   16
#define PIN_P3   17
#define PIN_P4   18

// ── Parámetros pulsadores ──────────────────────────────────
#define DEBOUNCE_MS    50
#define BLOQUEO_MS   2000

// ── Límites ────────────────────────────────────────────────
#define MAX_LEDS      100
#define NUM_CANALES     4
#define NUM_ESTADOS     4

// ── Sincronización backend ─────────────────────────────────
#define SYNC_MAX_INTENTOS   20
#define SYNC_INTERVALO_MS   5000

// ── Animaciones ────────────────────────────────────────────
enum Animacion { ANIM_FIJO=0, ANIM_RESPIRACION, ANIM_PARPADEO, ANIM_BARRIDO };

String animNombre(Animacion a) {
  switch(a) {
    case ANIM_RESPIRACION: return "respiracion";
    case ANIM_PARPADEO:    return "parpadeo";
    case ANIM_BARRIDO:     return "barrido";
    default:               return "fijo";
  }
}
Animacion animDesdeNombre(const String& s) {
  if (s=="respiracion") return ANIM_RESPIRACION;
  if (s=="parpadeo")    return ANIM_PARPADEO;
  if (s=="barrido")     return ANIM_BARRIDO;
  return ANIM_FIJO;
}

// ── Estados ────────────────────────────────────────────────
#define IDX_LIBRE    0
#define IDX_OCUPADO  1
#define IDX_ABRIENDO 2
#define IDX_APAGADO  3

int estadoIdx(const String& s) {
  if (s=="libre")    return IDX_LIBRE;
  if (s=="ocupado")  return IDX_OCUPADO;
  if (s=="abriendo") return IDX_ABRIENDO;
  return IDX_APAGADO;
}
String estadoNombre(int i) {
  switch(i) {
    case IDX_LIBRE:    return "libre";
    case IDX_OCUPADO:  return "ocupado";
    case IDX_ABRIENDO: return "abriendo";
    default:           return "apagado";
  }
}

// ══════════════════════════════════════════════════════════
//  ESTRUCTURAS DE CONFIGURACIÓN
// ══════════════════════════════════════════════════════════

struct ConfigEstado {
  CRGB      color;
  Animacion animacion;
  uint32_t  velocidad;
};

// Prototipo explícito — necesario para el precompilador Arduino IDE
void defaultEstados(ConfigEstado est[NUM_ESTADOS]);

struct ConfigCanal {
  uint8_t      leds;
  uint8_t      brillo;
  ConfigEstado estados[NUM_ESTADOS];
};

struct ConfigRed {
  String ip, gateway, subnet;
  String backend_ip;
  int    backend_puerto;
  String backend_ruta;
  String pulsacion_ruta;
};

void defaultEstados(ConfigEstado est[NUM_ESTADOS]) {
  est[IDX_LIBRE]    = { CRGB(0,200,0),   ANIM_RESPIRACION, 3000 };
  est[IDX_OCUPADO]  = { CRGB(200,0,0),   ANIM_PARPADEO,    1000 };
  est[IDX_ABRIENDO] = { CRGB(200,100,0), ANIM_BARRIDO,     30   };
  est[IDX_APAGADO]  = { CRGB(0,0,0),     ANIM_FIJO,        0    };
}

struct ConfigFlash {
  CRGB     color;       // Color del destello — por defecto blanco
  uint8_t  n_flashes;   // Número de destellos — por defecto 3
  uint16_t duracion_ms; // Duración ON+OFF de cada destello — por defecto 120ms
};

// ── Variables globales ─────────────────────────────────────
ConfigCanal  cfg[NUM_CANALES];
ConfigRed    cfgRed;
ConfigFlash  cfgFlash;
Preferences  prefs;

int           estadoActual[NUM_CANALES];
int           animStep[NUM_CANALES];
unsigned long ultimaAnim[NUM_CANALES];

CRGB ledsC1[MAX_LEDS], ledsC2[MAX_LEDS];
CRGB ledsC3[MAX_LEDS], ledsC4[MAX_LEDS];
CRGB* buffers[NUM_CANALES] = { ledsC1, ledsC2, ledsC3, ledsC4 };
const int pinPulsadores[NUM_CANALES] = { PIN_P1, PIN_P2, PIN_P3, PIN_P4 };

WebServer          server(80);
bool          ethernetListo       = false;
bool          pendienteReconexion = false;
unsigned long tReconexion         = 0;

// ── Pulsadores ─────────────────────────────────────────────
bool          estadoPulsador[NUM_CANALES];
unsigned long tDebounce[NUM_CANALES];
unsigned long tBloqueo[NUM_CANALES];
bool          enDebounce[NUM_CANALES];
uint32_t      totalPulsaciones[NUM_CANALES];

// ── Flash de confirmación ──────────────────────────────────
bool          flashActivo[NUM_CANALES];
int           flashContador[NUM_CANALES];
bool          flashFase[NUM_CANALES];       // true=ON, false=OFF
unsigned long tFlash[NUM_CANALES];

// ── Sincronización backend ─────────────────────────────────
bool          syncCompletada   = false;
int           syncIntentos     = 0;
unsigned long tUltimoSync      = 0;
bool          syncEnBackground = false;

// ── OTA ───────────────────────────────────────────────────
bool          otaEnProgreso    = false;
String        otaVersionAnterior = "";
bool          otaPendienteRollback = false;
unsigned long tOtaArranque     = 0;

// ── FreeRTOS — tarea background en Core 1 ─────────────────
// Todas las llamadas HTTP al backend van al Core 1.
// El Core 0 queda libre para LEDs, pulsadores y servidor HTTP.
struct PulsacionPendiente { int canal; uint32_t ts; };
QueueHandle_t  colaPulsaciones    = nullptr;
TaskHandle_t   tareaBackendHandle = nullptr;
volatile bool  syncPedida         = false;  // Core 0 → Core 1: pedir sync
volatile bool  syncResultado      = false;  // Core 1 → Core 0: resultado sync

// ══════════════════════════════════════════════════════════
//  PERSISTENCIA NVS
// ══════════════════════════════════════════════════════════

void guardarConfigRed() {
  prefs.begin("red", false);
  prefs.putString("ip",      cfgRed.ip);
  prefs.putString("gw",      cfgRed.gateway);
  prefs.putString("sn",      cfgRed.subnet);
  prefs.putString("bip",     cfgRed.backend_ip);
  prefs.putInt   ("bpuerto", cfgRed.backend_puerto);
  prefs.putString("bruta",   cfgRed.backend_ruta);
  prefs.putString("pruta",   cfgRed.pulsacion_ruta);
  prefs.end();
}

void cargarConfigRed() {
  prefs.begin("red", true);
  cfgRed.ip             = prefs.getString("ip",      "192.168.10.20");
  cfgRed.gateway        = prefs.getString("gw",      "192.168.10.1");
  cfgRed.subnet         = prefs.getString("sn",      "255.255.255.0");
  cfgRed.backend_ip     = prefs.getString("bip",     "192.168.10.10");
  cfgRed.backend_puerto = prefs.getInt   ("bpuerto", 8000);
  cfgRed.backend_ruta   = prefs.getString("bruta",   "/zaguan/estado");
  cfgRed.pulsacion_ruta = prefs.getString("pruta",   "/zaguan/pulsacion");
  prefs.end();
  Serial.printf("[NVS] ESP32:%s Backend:%s:%d\n",
    cfgRed.ip.c_str(), cfgRed.backend_ip.c_str(), cfgRed.backend_puerto);
}

void guardarConfigCanal(int c) {
  char ns[8]; sprintf(ns,"ch%d",c);
  prefs.begin(ns, false);
  prefs.putUChar("leds",   cfg[c].leds);
  prefs.putUChar("brillo", cfg[c].brillo);
  for (int e=0;e<NUM_ESTADOS;e++) {
    char k[12];
    sprintf(k,"cr%d",e); prefs.putUChar(k, cfg[c].estados[e].color.r);
    sprintf(k,"cg%d",e); prefs.putUChar(k, cfg[c].estados[e].color.g);
    sprintf(k,"cb%d",e); prefs.putUChar(k, cfg[c].estados[e].color.b);
    sprintf(k,"an%d",e); prefs.putUChar(k, (uint8_t)cfg[c].estados[e].animacion);
    sprintf(k,"vl%d",e); prefs.putUInt (k, cfg[c].estados[e].velocidad);
  }
  prefs.end();
}

void cargarConfigCanal(int c) {
  char ns[8]; sprintf(ns,"ch%d",c);
  prefs.begin(ns, true);
  cfg[c].leds   = (c<2) ? 60 : 10;
  cfg[c].brillo = (c<2) ? 150 : 200;
  defaultEstados(cfg[c].estados);
  if (prefs.isKey("leds")) {
    cfg[c].leds   = prefs.getUChar("leds",   cfg[c].leds);
    cfg[c].brillo = prefs.getUChar("brillo", cfg[c].brillo);
    for (int e=0;e<NUM_ESTADOS;e++) {
      char k[12];
      sprintf(k,"cr%d",e); cfg[c].estados[e].color.r   = prefs.getUChar(k, cfg[c].estados[e].color.r);
      sprintf(k,"cg%d",e); cfg[c].estados[e].color.g   = prefs.getUChar(k, cfg[c].estados[e].color.g);
      sprintf(k,"cb%d",e); cfg[c].estados[e].color.b   = prefs.getUChar(k, cfg[c].estados[e].color.b);
      sprintf(k,"an%d",e); cfg[c].estados[e].animacion = (Animacion)prefs.getUChar(k, cfg[c].estados[e].animacion);
      sprintf(k,"vl%d",e); cfg[c].estados[e].velocidad = prefs.getUInt(k,  cfg[c].estados[e].velocidad);
    }
  }
  prefs.end();
}

void guardarConfigFlash() {
  prefs.begin("flash", false);
  prefs.putUChar("cr",   cfgFlash.color.r);
  prefs.putUChar("cg",   cfgFlash.color.g);
  prefs.putUChar("cb",   cfgFlash.color.b);
  prefs.putUChar("n",    cfgFlash.n_flashes);
  prefs.putUShort("dur", cfgFlash.duracion_ms);
  prefs.end();
}

void cargarConfigFlash() {
  prefs.begin("flash", true);
  cfgFlash.color.r    = prefs.getUChar ("cr",  255);
  cfgFlash.color.g    = prefs.getUChar ("cg",  255);
  cfgFlash.color.b    = prefs.getUChar ("cb",  255);
  cfgFlash.n_flashes  = prefs.getUChar ("n",   3);
  cfgFlash.duracion_ms= prefs.getUShort("dur", 120);
  prefs.end();
  Serial.printf("[NVS] Flash: RGB(%d,%d,%d) x%d %dms\n",
    cfgFlash.color.r, cfgFlash.color.g, cfgFlash.color.b,
    cfgFlash.n_flashes, cfgFlash.duracion_ms);
}

// ══════════════════════════════════════════════════════════
//  FLASH DE CONFIRMACIÓN AL PULSAR
// ══════════════════════════════════════════════════════════

/**
 * Inicia la secuencia de N destellos en un canal.
 * No bloqueante — la animación se gestiona en actualizarFlash().
 */
void iniciarFlash(int c) {
  flashActivo[c]   = true;
  flashContador[c] = 0;
  flashFase[c]     = true;
  tFlash[c]        = millis();
  // Primer destello ON — buffer actualizado, show() lo hará el loop
  fill_solid(buffers[c], cfg[c].leds, cfgFlash.color);
}

void actualizarFlash(int c) {
  if (!flashActivo[c]) return;
  unsigned long ahora = millis();
  uint16_t mitad = cfgFlash.duracion_ms / 2;
  if (ahora - tFlash[c] < mitad) return;
  tFlash[c] = ahora;

  if (flashFase[c]) {
    fill_solid(buffers[c], cfg[c].leds, CRGB::Black);
    flashFase[c] = false;
  } else {
    flashContador[c]++;
    if (flashContador[c] >= cfgFlash.n_flashes) {
      flashActivo[c] = false;
      animStep[c]    = 0;
      ultimaAnim[c]  = 0;
      Serial.printf("[BTN] Flash C%d completado — vuelve a %s\n",
        c+1, estadoNombre(estadoActual[c]).c_str());
    } else {
      fill_solid(buffers[c], cfg[c].leds, cfgFlash.color);
      flashFase[c] = true;
    }
  }
  // show() lo hará el loop al detectar cambio en el buffer
}

// ══════════════════════════════════════════════════════════
//  PULSADORES
// ══════════════════════════════════════════════════════════

void dispararPulsacion(int c) {
  if (!ethernetListo) return;

  totalPulsaciones[c]++;

  if (estadoActual[c] == IDX_APAGADO) {
    // Opción B — canal apagado: flash rojo corto + notificar al backend
    Serial.printf("[BTN] C%d pulsado — canal APAGADO (#%lu) — flash rojo + notifica\n",
      c+1, totalPulsaciones[c]);

    // Flash rojo 2 destellos — visualmente distinto del flash blanco normal
    for (int i = 0; i < 2; i++) {
      fill_solid(buffers[c], cfg[c].leds, CRGB::Red);
      FastLED.show(); delay(80);
      fill_solid(buffers[c], cfg[c].leds, CRGB::Black);
      FastLED.show(); delay(80);
    }
    // El canal vuelve a apagado automáticamente (ya estaba apagado)

  } else {
    // Canal activo — flash normal de confirmación
    iniciarFlash(c);
    Serial.printf("[BTN] C%d pulsado (#%lu) — encolando POST\n",
      c+1, totalPulsaciones[c]);
  }

  // Encolar para que el Core 1 envíe el POST al backend
  // El backend distingue si el canal estaba apagado por el estado actual
  if (colaPulsaciones != nullptr) {
    PulsacionPendiente p = { c, (uint32_t)millis() };
    xQueueSend(colaPulsaciones, &p, 0);
  }
}

void gestionarPulsadores() {
  unsigned long ahora = millis();
  for (int c=0; c<NUM_CANALES; c++) {
    bool lectura = (digitalRead(pinPulsadores[c]) == LOW);
    if (ahora - tBloqueo[c] < BLOQUEO_MS) continue;
    if (!enDebounce[c]) {
      if (lectura && !estadoPulsador[c]) {
        enDebounce[c] = true;
        tDebounce[c]  = ahora;
      }
    } else {
      if (!lectura) {
        enDebounce[c] = false;
      } else if (ahora - tDebounce[c] >= DEBOUNCE_MS) {
        enDebounce[c]     = false;
        tBloqueo[c]       = ahora;
        estadoPulsador[c] = true;
        dispararPulsacion(c);
      }
    }
    if (!lectura) estadoPulsador[c] = false;
  }
}

// ══════════════════════════════════════════════════════════
//  OTA
// ══════════════════════════════════════════════════════════

/**
 * Marca el firmware actual como válido en el sistema OTA del ESP32.
 * Esto cancela cualquier posible rollback automático.
 * Se llama cuando la sincronización con el backend es exitosa.
 */
void confirmarFirmwareValido() {
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if (esp_ota_get_state_partition(running, &state) == ESP_OK) {
    if (state == ESP_OTA_IMG_PENDING_VERIFY) {
      esp_ota_mark_app_valid_cancel_rollback();
      Serial.println("[OTA] Firmware marcado como VALIDO — rollback cancelado");
      otaPendienteRollback = false;
    }
  }
}

/**
 * Comprueba si ha pasado el timeout de rollback.
 * Si el firmware nuevo no se valida en OTA_ROLLBACK_TIMEOUT_MS
 * tras el arranque, se activa el rollback al firmware anterior.
 */
void comprobarRollback() {
  if (!otaPendienteRollback) return;
  if (millis() - tOtaArranque > OTA_ROLLBACK_TIMEOUT_MS) {
    Serial.println("[OTA] Timeout rollback — volviendo al firmware anterior...");
    // Indicador visual: parpadeo rojo rápido en todos los canales
    for (int i=0; i<6; i++) {
      for (int c=0; c<NUM_CANALES; c++)
        fill_solid(buffers[c], cfg[c].leds, i%2==0 ? CRGB::Red : CRGB::Black);
      FastLED.show();
      delay(150);
    }
    esp_ota_mark_app_invalid_rollback_and_reboot();
    // El ESP32 reinicia con el firmware anterior automáticamente
  }
}

/**
 * Endpoint OTA — recibe el .bin y flashea.
 * El COCE sube el archivo con Content-Type: application/octet-stream.
 * Durante el flash los LEDs muestran progreso en azul.
 * Al terminar el ESP32 reinicia con el nuevo firmware.
 * Si no sincroniza en 60s → rollback automático al firmware anterior.
 */
// ── Servidor TCP OTA en puerto 8266 ───────────────────────
// Completamente independiente del WebServer HTTP.
// El COCE conecta directamente por TCP y envía el .bin raw.
// Protocolo:
//   1. COCE conecta a ESP32:8266
//   2. ESP32 envía "OTA_READY\n"
//   3. COCE envía tamaño del .bin como 4 bytes little-endian
//   4. COCE envía el .bin completo
//   5. ESP32 envía "OTA_OK\n" o "OTA_ERROR:mensaje\n"
//   6. ESP32 reinicia
WiFiServer otaTcpServer(8266);

void iniciarServidorOTA() {
  otaTcpServer.begin();
  Serial.println("[OTA] Servidor TCP OTA en puerto 8266");
}

void gestionarOtaTcp() {
  if (!ethernetListo) return;
  WiFiClient client = otaTcpServer.available();
  if (!client) return;

  Serial.println("[OTA] Cliente OTA conectado");

  // LEDs azul durante OTA
  for (int c=0; c<NUM_CANALES; c++)
    fill_solid(buffers[c], cfg[c].leds, CRGB::Blue);
  FastLED.show();

  // Enviar señal de listo
  client.println("OTA_READY");

  // Leer tamaño del firmware (4 bytes little-endian)
  uint8_t szBuf[4] = {0};
  unsigned long t0 = millis();
  int leidos = 0;
  while (leidos < 4 && millis()-t0 < 5000) {
    if (client.available()) szBuf[leidos++] = client.read();
  }
  if (leidos < 4) {
    client.println("OTA_ERROR:timeout esperando tamanio");
    client.stop();
    return;
  }

  uint32_t fwSize = szBuf[0] | (szBuf[1]<<8) | (szBuf[2]<<16) | (szBuf[3]<<24);
  Serial.printf("[OTA] Firmware size: %u bytes\n", fwSize);

  if (!Update.begin(fwSize, U_FLASH)) {
    String err = Update.errorString();
    client.println("OTA_ERROR:" + err);
    client.stop();
    return;
  }

  // Recibir y escribir en chunks de 1KB
  uint8_t buf[1024];
  uint32_t written = 0;
  t0 = millis();

  while (written < fwSize && client.connected()) {
    if (millis()-t0 > 60000) {
      client.println("OTA_ERROR:timeout recibiendo datos");
      Update.abort();
      client.stop();
      return;
    }
    int disponible = client.available();
    if (disponible <= 0) { delay(1); continue; }

    size_t toRead = min((size_t)disponible, sizeof(buf));
    toRead = min(toRead, (size_t)(fwSize - written));
    int n = client.read(buf, toRead);
    if (n <= 0) continue;

    Update.write(buf, n);
    written += n;
    t0 = millis();  // Reset timeout con cada chunk recibido

    // Progreso cada 10%
    if ((written * 10 / fwSize) > ((written-n) * 10 / fwSize)) {
      Serial.printf("[OTA] %u/%u bytes (%u%%)\n",
        written, fwSize, written*100/fwSize);
    }
  }

  if (!Update.end(true)) {
    String err = Update.errorString();
    client.println("OTA_ERROR:" + err);
    client.stop();
    return;
  }

  // LEDs verde — éxito
  for (int c=0; c<NUM_CANALES; c++)
    fill_solid(buffers[c], cfg[c].leds, CRGB::Green);
  FastLED.show();

  otaVersionAnterior = FIRMWARE_VERSION;
  client.println("OTA_OK");
  client.flush();
  client.stop();

  Serial.printf("[OTA] Completada — %u bytes — reiniciando\n", written);
  delay(500);
  ESP.restart();
}

/**
 * GET /api/ota/version
 * Devuelve información de versión y estado OTA del dispositivo.
 */
void handleOtaVersion() {
  server.sendHeader("Access-Control-Allow-Origin", "*");

  // Detectar si este arranque fue tras un OTA (firmware pendiente de validar)
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_VALID;
  esp_ota_get_state_partition(running, &state);

  bool pendienteValidacion = (state == ESP_OTA_IMG_PENDING_VERIFY);

  StaticJsonDocument<512> doc;
  doc["version"]              = FIRMWARE_VERSION;
  doc["version_int"]          = FIRMWARE_VERSION_INT;
  doc["version_anterior"]     = otaVersionAnterior.length() > 0
                                  ? otaVersionAnterior : "desconocida";
  doc["pendiente_validacion"] = pendienteValidacion;
  doc["rollback_timeout_s"]   = OTA_ROLLBACK_TIMEOUT_MS / 1000;
  doc["sync_completada"]      = syncCompletada;
  doc["uptime_s"]             = millis() / 1000;

  // Info de particiones OTA
  const esp_partition_t* boot = esp_ota_get_boot_partition();
  doc["particion_activa"]     = running->label;
  doc["particion_boot"]       = boot->label;

  String r; serializeJson(doc, r);
  server.send(200, "application/json", r);
}

// ══════════════════════════════════════════════════════════
//  SINCRONIZACIÓN CON BACKEND
// ══════════════════════════════════════════════════════════

bool sincronizarConBackend() {
  String url = "http://" + cfgRed.backend_ip + ":" +
               String(cfgRed.backend_puerto) + cfgRed.backend_ruta;
  Serial.printf("[SYNC] GET %s (intento %d)\n", url.c_str(), syncIntentos+1);

  HTTPClient http;
  http.begin(url);
  http.setTimeout(3000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[SYNC] Error HTTP %d\n", code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, body)) {
    Serial.println("[SYNC] JSON invalido");
    return false;
  }

  const char* claves[NUM_CANALES] = {"p1","p2","p3","p4"};
  for (int c=0; c<NUM_CANALES; c++) {
    if (doc.containsKey(claves[c])) {
      String s = doc[claves[c]].as<String>();
      setEstadoCanalInterno(c, estadoIdx(s));
      Serial.printf("[SYNC] Canal %d → %s\n", c+1, s.c_str());
    }
  }

  // Sincronización exitosa → marcar firmware como válido (cancela rollback OTA)
  confirmarFirmwareValido();

  Serial.printf("[SYNC] OK tras %d intento(s)\n", syncIntentos+1);
  return true;
}

// ══════════════════════════════════════════════════════════
//  ANIMACIONES LED
// ══════════════════════════════════════════════════════════

void setEstadoCanalInterno(int c, int nuevo) {
  estadoActual[c] = nuevo;
  animStep[c]     = 0;
  ultimaAnim[c]   = 0;
  if (nuevo == IDX_APAGADO) {
    fill_solid(buffers[c], cfg[c].leds, CRGB::Black);
    // show() lo hará el loop en la siguiente iteración
  }
}

void setEstadoCanal(int c, int nuevo) {
  setEstadoCanalInterno(c, nuevo);
  Serial.printf("[LED] Canal %d → %s\n", c+1, estadoNombre(nuevo).c_str());
}

// Escribe en el buffer del canal — devuelve true si hubo cambio.
// El show() lo hace el loop UNA sola vez para todos los canales.
// El brillo se aplica aquí directamente al calcular el color.
bool animarCanalBuffer(int c) {
  if (flashActivo[c]) return false;

  int           ei  = estadoActual[c];
  ConfigEstado& ce  = cfg[c].estados[ei];
  CRGB*         buf = buffers[c];
  int           n   = cfg[c].leds;
  uint32_t      vel = max((uint32_t)1, ce.velocidad);
  unsigned long ahora = millis();
  float         br  = cfg[c].brillo / 255.0f;

  auto dim = [&](CRGB col) -> CRGB {
    return CRGB((uint8_t)(col.r*br),(uint8_t)(col.g*br),(uint8_t)(col.b*br));
  };

  switch (ce.animacion) {
    case ANIM_FIJO:
      if (animStep[c]==0) {
        fill_solid(buf,n,dim(ce.color));
        animStep[c]=1;
        return true;
      }
      return false;

    case ANIM_RESPIRACION:
      if (ahora-ultimaAnim[c]<20) return false;
      ultimaAnim[c]=ahora;
      {
        float t=(ahora%vel)/(float)vel;
        float f=br*(0.15f+0.85f*(0.5f+0.5f*sinf(2.0f*PI*t)));
        fill_solid(buf,n,CRGB(
          (uint8_t)(ce.color.r*f),
          (uint8_t)(ce.color.g*f),
          (uint8_t)(ce.color.b*f)));
        return true;
      }

    case ANIM_PARPADEO:
      if (ahora-ultimaAnim[c]<20) return false;
      ultimaAnim[c]=ahora;
      fill_solid(buf,n,(ahora%vel)<(vel*8/10) ? dim(ce.color) : CRGB::Black);
      return true;

    case ANIM_BARRIDO:
      if (ahora-ultimaAnim[c]<vel) return false;
      ultimaAnim[c]=ahora;
      {
        fill_solid(buf,n,CRGB::Black);
        int pos=animStep[c]%n;
        buf[pos]=dim(ce.color);
        for (int i=1;i<=8&&i<n;i++) {
          int idx=(pos-i+n)%n;
          float f=br*(1.0f-(float)i/8.0f);
          buf[idx]=CRGB(
            (uint8_t)(ce.color.r*f),
            (uint8_t)(ce.color.g*f),
            (uint8_t)(ce.color.b*f));
        }
        animStep[c]++;
        return true;
      }
  }
  return false;
}

// ══════════════════════════════════════════════════════════
//  HELPERS HTTP
// ══════════════════════════════════════════════════════════

void corsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin",  "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

template<size_t N>
bool parseBody(StaticJsonDocument<N>& doc) {
  if (!server.hasArg("plain")) {
    server.send(400,"application/json","{\"error\":\"Body vacio\"}");
    return false;
  }
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400,"application/json","{\"error\":\"JSON invalido\"}");
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════
//  ENDPOINTS — ESTADO POR CANAL
// ══════════════════════════════════════════════════════════

void handleEstadoCanal(int canal) {
  corsHeaders();
  StaticJsonDocument<128> doc;
  if (!parseBody(doc)) return;
  String s = doc["estado"] | "";
  s.toLowerCase();
  if (s!="libre"&&s!="ocupado"&&s!="abriendo"&&s!="apagado") {
    server.send(400,"application/json","{\"error\":\"Valores: libre|ocupado|abriendo|apagado\"}");
    return;
  }
  setEstadoCanal(canal, estadoIdx(s));
  server.send(200,"application/json",
    "{\"ok\":true,\"canal\":"+String(canal+1)+",\"estado\":\""+s+"\"}");
}

// ══════════════════════════════════════════════════════════
//  ENDPOINTS — CONFIGURACIÓN
// ══════════════════════════════════════════════════════════

void handleConfigRed() {
  corsHeaders();
  StaticJsonDocument<512> doc;
  if (!parseBody(doc)) return;
  String nuevaIp = doc["ip"] | cfgRed.ip;
  IPAddress t; if (!t.fromString(nuevaIp)) {
    server.send(400,"application/json","{\"error\":\"IP invalida\"}"); return;
  }
  cfgRed.ip             = nuevaIp;
  cfgRed.gateway        = doc["gateway"]        | cfgRed.gateway;
  cfgRed.subnet         = doc["subnet"]         | cfgRed.subnet;
  cfgRed.backend_ip     = doc["backend_ip"]     | cfgRed.backend_ip;
  cfgRed.backend_puerto = doc["backend_puerto"] | cfgRed.backend_puerto;
  cfgRed.backend_ruta   = doc["backend_ruta"]   | cfgRed.backend_ruta;
  cfgRed.pulsacion_ruta = doc["pulsacion_ruta"] | cfgRed.pulsacion_ruta;
  guardarConfigRed();
  server.send(200,"application/json",
    "{\"ok\":true,\"ip\":\""+nuevaIp+"\",\"reconectando\":true}");
  pendienteReconexion=true; tReconexion=millis();
}

void handleConfigCanal() {
  corsHeaders();
  StaticJsonDocument<128> doc;
  if (!parseBody(doc)) return;
  int c=(doc["canal"]|1)-1;
  if (c<0||c>=NUM_CANALES) {
    server.send(400,"application/json","{\"error\":\"Canal invalido (1-4)\"}"); return;
  }
  if (doc.containsKey("leds")) {
    int n=doc["leds"]; if (n<1||n>MAX_LEDS) {
      server.send(400,"application/json","{\"error\":\"leds fuera de rango\"}"); return;
    }
    cfg[c].leds=n;
  }
  if (doc.containsKey("brillo")) cfg[c].brillo=constrain((int)doc["brillo"],0,255);
  guardarConfigCanal(c);
  server.send(200,"application/json",
    "{\"ok\":true,\"canal\":"+String(c+1)+",\"leds\":"+String(cfg[c].leds)+",\"brillo\":"+String(cfg[c].brillo)+"}");
}

void handleConfigEstado() {
  corsHeaders();
  StaticJsonDocument<256> doc;
  if (!parseBody(doc)) return;
  String s=doc["estado"]|""; s.toLowerCase();
  if (s!="libre"&&s!="ocupado"&&s!="abriendo"&&s!="apagado") {
    server.send(400,"application/json","{\"error\":\"Estado invalido\"}"); return;
  }
  int ei=estadoIdx(s);
  int cD=0,cH=NUM_CANALES;
  if (doc.containsKey("canal")) {
    int c=(int)doc["canal"]-1;
    if (c<0||c>=NUM_CANALES) {
      server.send(400,"application/json","{\"error\":\"Canal invalido\"}"); return;
    }
    cD=c; cH=c+1;
  }
  for (int c=cD;c<cH;c++) {
    if (doc.containsKey("color")&&doc["color"].is<JsonArray>()) {
      JsonArray a=doc["color"].as<JsonArray>();
      if (a.size()==3) cfg[c].estados[ei].color=CRGB(
        constrain((int)a[0],0,255),constrain((int)a[1],0,255),constrain((int)a[2],0,255));
    }
    if (doc.containsKey("animacion")) cfg[c].estados[ei].animacion=animDesdeNombre(doc["animacion"].as<String>());
    if (doc.containsKey("velocidad")) cfg[c].estados[ei].velocidad=max(1,(int)doc["velocidad"]);
    guardarConfigCanal(c);
    if (estadoActual[c]==ei) animStep[c]=0;
  }
  server.send(200,"application/json","{\"ok\":true,\"estado\":\""+s+"\"}");
}

// POST /api/config/flash
// {"color":[255,255,255], "n_flashes":3, "duracion_ms":120}
void handleConfigFlash() {
  corsHeaders();
  StaticJsonDocument<128> doc;
  if (!parseBody(doc)) return;

  if (doc.containsKey("color")&&doc["color"].is<JsonArray>()) {
    JsonArray a=doc["color"].as<JsonArray>();
    if (a.size()==3) cfgFlash.color=CRGB(
      constrain((int)a[0],0,255),
      constrain((int)a[1],0,255),
      constrain((int)a[2],0,255));
  }
  if (doc.containsKey("n_flashes"))
    cfgFlash.n_flashes=constrain((int)doc["n_flashes"],1,10);
  if (doc.containsKey("duracion_ms"))
    cfgFlash.duracion_ms=constrain((int)doc["duracion_ms"],50,2000);

  guardarConfigFlash();

  server.send(200,"application/json",
    "{\"ok\":true,"
    "\"color\":["+String(cfgFlash.color.r)+","+String(cfgFlash.color.g)+","+String(cfgFlash.color.b)+"],"
    "\"n_flashes\":"+String(cfgFlash.n_flashes)+","
    "\"duracion_ms\":"+String(cfgFlash.duracion_ms)+"}");
}

void handleGetConfig() {
  corsHeaders();
  StaticJsonDocument<2048> doc;
  doc["version"] = FIRMWARE_VERSION;

  JsonObject red=doc.createNestedObject("red");
  red["ip"]=cfgRed.ip; red["gateway"]=cfgRed.gateway; red["subnet"]=cfgRed.subnet;
  red["backend_ip"]=cfgRed.backend_ip; red["backend_puerto"]=cfgRed.backend_puerto;
  red["backend_ruta"]=cfgRed.backend_ruta; red["pulsacion_ruta"]=cfgRed.pulsacion_ruta;

  JsonObject fl=doc.createNestedObject("flash");
  JsonArray fc=fl.createNestedArray("color");
  fc.add(cfgFlash.color.r); fc.add(cfgFlash.color.g); fc.add(cfgFlash.color.b);
  fl["n_flashes"]=cfgFlash.n_flashes; fl["duracion_ms"]=cfgFlash.duracion_ms;

  JsonObject sy=doc.createNestedObject("sync");
  sy["completada"]=syncCompletada; sy["intentos"]=syncIntentos; sy["background"]=syncEnBackground;

  JsonArray chs=doc.createNestedArray("canales");
  for (int c=0;c<NUM_CANALES;c++) {
    JsonObject ch=chs.createNestedObject();
    ch["canal"]=c+1; ch["leds"]=cfg[c].leds; ch["brillo"]=cfg[c].brillo;
    JsonArray es=ch.createNestedArray("estados");
    for (int e=0;e<NUM_ESTADOS;e++) {
      JsonObject est=es.createNestedObject();
      est["estado"]=estadoNombre(e); est["animacion"]=animNombre(cfg[c].estados[e].animacion);
      est["velocidad"]=cfg[c].estados[e].velocidad;
      JsonArray col=est.createNestedArray("color");
      col.add(cfg[c].estados[e].color.r); col.add(cfg[c].estados[e].color.g); col.add(cfg[c].estados[e].color.b);
    }
  }
  String r; serializeJson(doc,r);
  server.send(200,"application/json",r);
}

void handleGetEstado() {
  corsHeaders();
  StaticJsonDocument<512> doc;
  doc["ip"]=ETH.localIP().toString(); doc["sync"]=syncCompletada; doc["version"]=FIRMWARE_VERSION;
  JsonArray chs=doc.createNestedArray("canales");
  for (int c=0;c<NUM_CANALES;c++) {
    JsonObject ch=chs.createNestedObject();
    ch["canal"]=c+1; ch["estado"]=estadoNombre(estadoActual[c]);
    ch["pulsaciones"]=totalPulsaciones[c]; ch["flash_activo"]=flashActivo[c];
  }
  String r; serializeJson(doc,r);
  server.send(200,"application/json",r);
}

void handlePing() {
  server.send(200,"application/json",
    "{\"pong\":true,\"sync\":"+String(syncCompletada?"true":"false")+
    ",\"version\":\""+FIRMWARE_VERSION+"\"}");
}

void handleOptions() { corsHeaders(); server.send(204); }

// ══════════════════════════════════════════════════════════
//  RECONEXIÓN EN CALIENTE
// ══════════════════════════════════════════════════════════

void aplicarNuevaIp() {
  IPAddress ip,gw,sn,dns;
  ip.fromString(cfgRed.ip); gw.fromString(cfgRed.gateway);
  sn.fromString(cfgRed.subnet); dns.fromString("8.8.8.8");
  ETH.config(ip,gw,sn,dns);
  ethernetListo=false; syncCompletada=false; syncIntentos=0; syncEnBackground=false;
}

// ══════════════════════════════════════════════════════════
//  EVENTOS ETHERNET
// ══════════════════════════════════════════════════════════

void onEthEvent(arduino_event_id_t event, arduino_event_info_t info) {
  switch(event) {
    case ARDUINO_EVENT_ETH_START:
      Serial.println("[ETH] Iniciando W5500...");
      ETH.setHostname("zaguan-led"); break;
    case ARDUINO_EVENT_ETH_CONNECTED:
      Serial.println("[ETH] Cable conectado"); break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      Serial.printf("[ETH] IP: %s\n", ETH.localIP().toString().c_str());
      ethernetListo=true; syncCompletada=false;
      syncIntentos=0; syncEnBackground=false; tUltimoSync=0;
      Serial.println("[ETH] IP obtenida — servidor HTTP activo"); break;
    case ARDUINO_EVENT_ETH_DISCONNECTED:
      Serial.println("[ETH] Cable desconectado");
      ethernetListo=false; break;
    default: break;
  }
}

// ══════════════════════════════════════════════════════════
//  DETECCIÓN DE ARRANQUE POST-OTA
// ══════════════════════════════════════════════════════════

void detectarArranqueOTA() {
  const esp_partition_t* running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if (esp_ota_get_state_partition(running, &state) == ESP_OK) {
    if (state == ESP_OTA_IMG_PENDING_VERIFY) {
      otaPendienteRollback = true;
      tOtaArranque = millis();
      Serial.println("[OTA] Arranque tras OTA detectado — esperando validacion...");
      Serial.printf("[OTA] Rollback en %ds si no hay sync con backend\n",
        OTA_ROLLBACK_TIMEOUT_MS/1000);
    }
  }
}

// ══════════════════════════════════════════════════════════
//  TAREA CORE 1 — Comunicación bloqueante con el backend
// ══════════════════════════════════════════════════════════

/**
 * Esta tarea corre en el Core 1 y gestiona TODAS las llamadas
 * HTTP bloqueantes al backend:
 *   - Envío de pulsaciones (POST fire-and-forget)
 *   - Sincronización de estado al arranque (GET /zaguan/estado)
 *
 * El Core 0 queda completamente libre para:
 *   - Leer pulsadores (sub-ms)
 *   - Actualizar LEDs (~2ms por show)
 *   - Responder peticiones HTTP entrantes
 */
void tareaBackend(void* param) {
  Serial.println("[CORE1] Tarea backend arrancada en Core 1");

  for (;;) {
    // ── Procesar pulsaciones pendientes ────────────────────
    PulsacionPendiente p;
    while (xQueueReceive(colaPulsaciones, &p, 0) == pdTRUE) {
      if (!ethernetListo) continue;

      String url = "http://" + cfgRed.backend_ip + ":" +
                   String(cfgRed.backend_puerto) +
                   cfgRed.pulsacion_ruta + "/p" + String(p.canal+1);
      // Incluir estado del canal — el backend distingue pulsación normal vs apagado
      String body = "{\"canal\":" + String(p.canal+1) +
                    ",\"ts\":"    + String(p.ts) +
                    ",\"estado\":\"" + estadoNombre(estadoActual[p.canal]) + "\"}";

      HTTPClient http;
      http.begin(url);
      http.addHeader("Content-Type", "application/json");
      http.setTimeout(1000);
      int code = http.POST(body);
      http.end();
      Serial.printf("[CORE1] Pulsacion C%d (%s) → HTTP %d\n",
        p.canal+1, estadoNombre(estadoActual[p.canal]).c_str(), code);
    }

    // ── Sincronización con backend si está pedida ──────────
    if (syncPedida && ethernetListo) {
      syncPedida = false;
      syncResultado = sincronizarConBackend();
    }

    // Ceder CPU — 10ms de sleep para no saturar el Core 1
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ══════════════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[SAIMA] Firmware LED Zaguan v" FIRMWARE_VERSION);
  Serial.println("[SAIMA] 4 canales + OTA + flash confirmacion");

  // Detectar si es un arranque tras OTA antes de todo lo demás
  detectarArranqueOTA();

  WiFi.mode(WIFI_OFF);

  // Cargar configuración
  cargarConfigRed();
  cargarConfigFlash();
  for (int c=0;c<NUM_CANALES;c++) {
    cargarConfigCanal(c);
    estadoActual[c]=IDX_APAGADO;
    animStep[c]=animStep[c]=0;
    ultimaAnim[c]=0;
    estadoPulsador[c]=false; enDebounce[c]=false;
    tDebounce[c]=0; tBloqueo[c]=0; totalPulsaciones[c]=0;
    flashActivo[c]=false; flashContador[c]=0;
    flashFase[c]=false; tFlash[c]=0;
  }

  // Pines pulsadores
  int pines[NUM_CANALES]={PIN_P1,PIN_P2,PIN_P3,PIN_P4};
  for (int c=0;c<NUM_CANALES;c++) pinMode(pines[c],INPUT_PULLUP);
  Serial.println("[BTN] Pulsadores listos GPIO 15/16/17/18");

  // FastLED
  FastLED.addLeds<WS2812B,PIN_C1,GRB>(ledsC1,MAX_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.addLeds<WS2812B,PIN_C2,GRB>(ledsC2,MAX_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.addLeds<WS2812B,PIN_C3,GRB>(ledsC3,MAX_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.addLeds<WS2812B,PIN_C4,GRB>(ledsC4,MAX_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(150);
  FastLED.clear(); FastLED.show();

  // Test visual arranque — indica si es post-OTA con azul adicional
  if (otaPendienteRollback) {
    // Azul = arranque post-OTA, pendiente de validación
    for (int c=0;c<NUM_CANALES;c++) fill_solid(buffers[c],cfg[c].leds,CRGB::Blue);
    FastLED.show(); delay(600);
  }
  for (int c=0;c<NUM_CANALES;c++) fill_solid(buffers[c],cfg[c].leds,CRGB(0,150,0));
  FastLED.show(); delay(400);
  for (int c=0;c<NUM_CANALES;c++) fill_solid(buffers[c],cfg[c].leds,CRGB(150,0,0));
  FastLED.show(); delay(400);
  FastLED.clear(); FastLED.show(); delay(200);
  Serial.println("[LED] Test arranque OK");

  // Ethernet
  Network.onEvent(onEthEvent);
  IPAddress ip,gw,sn,dns;
  ip.fromString(cfgRed.ip); gw.fromString(cfgRed.gateway);
  sn.fromString(cfgRed.subnet); dns.fromString("8.8.8.8");
  ETH.begin(ETH_PHY_W5500,1,W5500_CS,W5500_INT,W5500_RST,
            SPI3_HOST,W5500_SCK,W5500_MISO,W5500_MOSI);
  ETH.config(ip,gw,sn,dns);

  // Endpoints
  server.on("/api/p1/estado",     HTTP_POST, []{ handleEstadoCanal(0); });
  server.on("/api/p2/estado",     HTTP_POST, []{ handleEstadoCanal(1); });
  server.on("/api/p3/estado",     HTTP_POST, []{ handleEstadoCanal(2); });
  server.on("/api/p4/estado",     HTTP_POST, []{ handleEstadoCanal(3); });
  server.on("/api/config/red",    HTTP_POST, handleConfigRed);
  server.on("/api/config/canal",  HTTP_POST, handleConfigCanal);
  server.on("/api/config/estado", HTTP_POST, handleConfigEstado);
  server.on("/api/config/flash",  HTTP_POST, handleConfigFlash);
  server.on("/api/config",        HTTP_GET,  handleGetConfig);
  server.on("/api/estado",        HTTP_GET,  handleGetEstado);
  server.on("/api/ping",          HTTP_GET,  handlePing);
  server.on("/api/ota/version",   HTTP_GET,  handleOtaVersion);

  // OTA sin credenciales — la seguridad la da la red local de la sucursal
  iniciarServidorOTA();

  const char* eps[]={
    "/api/p1/estado","/api/p2/estado","/api/p3/estado","/api/p4/estado",
    "/api/config/red","/api/config/canal","/api/config/estado","/api/config/flash"
  };
  for (auto ep:eps) server.on(ep,HTTP_OPTIONS,handleOptions);

  server.on("/",HTTP_GET,[](){
    server.send(200,"text/plain",
      "SAIMA Seguridad — LED Zaguan v" FIRMWARE_VERSION "\n"
      "4 canales + OTA TCP + flash confirmacion\n\n"
      "POST /api/p{1-4}/estado\n"
      "POST /api/config/red | /canal | /estado | /flash\n"
      "OTA:  TCP puerto 8266 (protocolo binario)\n"
      "GET  /api/config | /estado | /ping | /api/ota/version\n");
  });

  Serial.println("[HTTP] Endpoints registrados");

  // server.begin() SIEMPRE al final del setup
  server.begin();
  Serial.println("[HTTP] Servidor listo en puerto 80");

  // Inicializar cola de pulsaciones (capacidad 8 pulsaciones)
  colaPulsaciones = xQueueCreate(8, sizeof(PulsacionPendiente));

  // Arrancar tarea de comunicación en Core 1
  // Stack 8KB — suficiente para HTTPClient + JSON
  xTaskCreatePinnedToCore(
    tareaBackend,         // función
    "backend",           // nombre
    8192,                // stack bytes
    nullptr,             // parámetro
    1,                   // prioridad
    &tareaBackendHandle, // handle
    1                    // Core 1
  );

  Serial.println("[CORE1] Tarea backend asignada al Core 1");
  Serial.println("[SAIMA] Listo — esperando Ethernet...");
}

// ══════════════════════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════════════════════

void loop() {

  // Pulsadores — máxima prioridad
  gestionarPulsadores();

  // OTA TCP — puerto 8266
  gestionarOtaTcp();

  // Flash de confirmación + animaciones — un solo show() al final
  bool necesitaShow = false;
  for (int c=0;c<NUM_CANALES;c++) {
    bool flashCambio = false;
    unsigned long antesFlash = tFlash[c];
    actualizarFlash(c);
    if (tFlash[c] != antesFlash || (flashActivo[c] && flashContador[c]==0))
      flashCambio = true;
    if (!flashActivo[c] && animarCanalBuffer(c)) necesitaShow = true;
    if (flashCambio) necesitaShow = true;
  }
  if (necesitaShow) FastLED.show();

  // HTTP
  if (ethernetListo) server.handleClient();

  // Reconexión en caliente
  if (pendienteReconexion && millis()-tReconexion>1000) {
    pendienteReconexion=false;
    aplicarNuevaIp();
  }

  // Sincronización con backend — pedir al Core 1 que la haga
  if (ethernetListo && !syncCompletada) {
    unsigned long ahora=millis();
    if (tUltimoSync==0 || ahora-tUltimoSync>=SYNC_INTERVALO_MS) {
      tUltimoSync=ahora;

      // Si el Core 1 completó la sync → procesar resultado
      if (syncResultado) {
        syncResultado  = false;
        syncCompletada = true;
        syncEnBackground = false;
        Serial.printf("[SYNC] OK tras %d intento(s)\n", syncIntentos);
      } else {
        // Pedir al Core 1 que intente la sync (no bloqueante)
        syncIntentos++;
        syncPedida = true;

        if (!syncEnBackground && syncIntentos >= SYNC_MAX_INTENTOS) {
          syncEnBackground = true;
          Serial.printf("[SYNC] %d intentos fallidos — arrancando en APAGADO\n",
            SYNC_MAX_INTENTOS);
        } else if (syncEnBackground) {
          Serial.printf("[SYNC] Background intento %d\n", syncIntentos);
        } else {
          Serial.printf("[SYNC] Intento %d/%d\n", syncIntentos, SYNC_MAX_INTENTOS);
        }
      }
    }
  }

  // Rollback OTA — comprueba timeout
  comprobarRollback();
}
