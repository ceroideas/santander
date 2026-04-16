# ETD8A12 Control System — SAIMA SEGURIDAD / Banco Santander

Sistema de control de accesos con comunicación Modbus TCP/IP real.

## Arquitectura

```
Navegador (React)  ──►  FastAPI Python (server.py)  ──►  ETD8A12 (Modbus TCP)
   localhost:5173           localhost:8000                192.168.0.10
```

---

## 1. INSTALAR DEPENDENCIAS PYTHON

```bash
pip install fastapi uvicorn pymodbus
```

---

## 2. ARRANCAR EL BACKEND

```bash
python server.py
```

Verás:
```
============================================================
  ETD8A12 Control Server — SAIMA SEGURIDAD
  API:    http://localhost:8000
  Docs:   http://localhost:8000/docs
============================================================
```

**Verificar que funciona:**
- Abre http://localhost:8000  → debe devolver JSON con status "running"
- Abre http://localhost:8000/docs → Swagger interactivo con todos los endpoints

---

## 3. CONECTAR LA PLACA

### Opción A: Desde la interfaz web
1. Abre la UI → Tab **PANEL** o **MÓDULOS I/O**
2. Pulsa **CONN** en el Módulo 1
3. Si la placa responde: LED verde + entradas/salidas reales aparecen

### Opción B: Desde Swagger (http://localhost:8000/docs)
```
POST /boards/1/connect
```

### Opción C: curl
```bash
curl -X POST http://localhost:8000/boards/1/connect
```

---

## 4. CAMBIAR LA IP DE LA PLACA

Si tu placa no está en 192.168.0.10, cambia la IP en:

**Opción A — UI:** Tab CONFIGURACIÓN → Módulo 1 → cambia IP → APLICAR CONFIG

**Opción B — Antes de arrancar:** edita `server.py` línea ~40:
```python
BOARDS_CONFIG: Dict[int, dict] = {
    1: {"name": "Placa 1", "host": "TU_IP_AQUI", "port": 5000, "slave_id": 1},
    ...
}
```

**Opción B — API en caliente:**
```bash
curl -X PUT http://localhost:8000/boards/1/config \
  -H "Content-Type: application/json" \
  -d '{"host":"192.168.1.50", "port":5000, "slave_id":1}'
```

---

## 5. CONTROL MANUAL VIA API

### Activar relé canal 3:
```bash
curl -X POST http://localhost:8000/boards/1/output \
  -H "Content-Type: application/json" \
  -d '{"channel": 3, "state": true}'
```

### Desactivar relé canal 3:
```bash
curl -X POST http://localhost:8000/boards/1/output \
  -H "Content-Type: application/json" \
  -d '{"channel": 3, "state": false}'
```

### Activar TODAS las salidas:
```bash
curl -X POST http://localhost:8000/boards/1/outputs/all_on
```

### Desactivar TODAS las salidas:
```bash
curl -X POST http://localhost:8000/boards/1/outputs/all_off
```

### Activar canales 1, 3 y 5 (bitmask):
```bash
curl -X POST http://localhost:8000/boards/1/outputs/bitmask \
  -H "Content-Type: application/json" \
  -d '{"channels_on": [1, 3, 5]}'
```

### Leer todas las entradas:
```bash
curl http://localhost:8000/boards/1/inputs
```

### Estado completo:
```bash
curl http://localhost:8000/status
```

---

## 6. ESTRUCTURA DEL PROYECTO

```
server.py              ← Backend FastAPI (este archivo)
ETD8A12_Frontend.jsx   ← Frontend React (abrir en claude.ai)
README.md              ← Este archivo
```

---

## 7. COMANDOS MODBUS UTILIZADOS

| Acción            | Registro       | Valor    |
|-------------------|----------------|----------|
| Activar canal N   | 0x0000 + (N-1) | 0x0100   |
| Desactivar canal N| 0x0000 + (N-1) | 0x0200   |
| Activar todos     | 0x0000         | 0x0700   |
| Desactivar todos  | 0x0000         | 0x0800   |
| Bitmask salidas   | 0x0070         | bitmask  |
| Leer salidas      | 0x0000–0x000B  | FC 03    |
| Leer entradas     | 0x0080–0x008B  | FC 03    |

---

## 8. TROUBLESHOOTING

**"Connection refused" al conectar la placa:**
- Verifica que la IP es correcta: `ping 192.168.0.10`
- Verifica que el puerto 5000 está abierto: `telnet 192.168.0.10 5000`
- Comprueba que estás en la misma red/subred

**El servidor no arranca:**
- `pip install fastapi uvicorn pymodbus` (verifica que se instalaron)
- Verifica que el puerto 8000 no está ocupado: `netstat -an | findstr 8000`

**La UI dice "API OFFLINE":**
- Verifica que `python server.py` está corriendo
- El backend debe estar en http://localhost:8000
- Comprueba el firewall de Windows no bloquea el puerto 8000

**Entradas no cambian:**
- El polling automático lee cada 500ms desde el servidor
- La UI refresca el estado cada 600ms
- Latencia total esperada: < 1.1 segundos
