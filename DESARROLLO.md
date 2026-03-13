# Cómo desarrollar y ejecutar el proyecto

Estructura del repositorio y modo de trabajo del **backend** (Python/FastAPI) y el **frontend** (React/Vite).

---

## Estructura de carpetas

```
santander/
├── backend/                    # Servicio Python (API REST + lógica de control)
│   ├── app/
│   │   ├── main.py             # Aplicación FastAPI
│   │   ├── core/               # Configuración
│   │   ├── api/routes/         # Endpoints por recurso (health, status, modes, events, config)
│   │   ├── db/                 # SQLite (session, futuros modelos)
│   │   └── hardware/           # Modbus ETD8A12
│   ├── data/                   # Creado al arrancar: SQLite y datos
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py                  # Arranque en desarrollo
│
├── frontend/                   # Interfaz web de configuración (React)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api/client.js       # Cliente HTTP hacia /api
│   │   └── ...
│   ├── index.html
│   ├── vite.config.js          # Proxy /api -> backend en dev
│   └── package.json
│
├── ARQUITECTURA.md
├── API_SPEC.md
├── MODELO_DATOS.md
├── GUIA_SUBTASKS.md
├── APROVECHAMIENTO_POC.md
├── alcance.md
└── DESARROLLO.md               # Este archivo
```

---

## Backend (Python / FastAPI)

### Requisitos

- Python 3.9 o superior
- Entorno virtual recomendado (`venv`)

### Instalación y arranque

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
python run.py
```

El servidor queda en **http://localhost:8000**.

- **Documentación interactiva:** http://localhost:8000/docs  
- **Health check:** http://localhost:8000/api/health  
- **Estado:** http://localhost:8000/api/status  

Variables de entorno: copiar `.env.example` a `.env` y ajustar (opcional).

---

## Frontend (React / Vite)

### Requisitos

- Node.js 18+ y npm (o pnpm/yarn)

### Instalación y arranque

```bash
cd frontend
npm install
npm run dev
```

La interfaz queda en **http://localhost:5173**.

En desarrollo, Vite hace **proxy** de `/api` (y `/docs`, `/redoc`) al backend en el puerto 8000, así que las peticiones del frontend a `fetch('/api/status')` van a `http://localhost:8000/api/status` sin CORS.

### Build para producción

```bash
npm run build
```

Genera la carpeta `frontend/dist` con HTML, JS y CSS estáticos. En producción, el **backend** puede servir estos archivos (FastAPI montando `StaticFiles` en `/` y sirviendo `index.html` para rutas SPA), de modo que todo quede en un solo origen y puerto.

---

## Cómo se relacionan frontend y backend

| Entorno    | Frontend              | Backend        | Comunicación |
|------------|------------------------|----------------|--------------|
| Desarrollo | http://localhost:5173  | http://localhost:8000 | El navegador pide a 5173; Vite reenvía `/api` a 8000 (proxy). |
| Producción | Mismo servidor         | Mismo servidor | Backend sirve el build estático del frontend y responde a `/api`. |

En desarrollo trabajas con dos procesos: uno para el backend (uvicorn) y otro para el frontend (vite). En producción se despliega solo el backend, que además sirve los ficheros estáticos del frontend (build).

---

## Producción: servir el frontend desde el backend

Cuando el desarrollo esté terminado, puedes desplegar **un solo servicio** (FastAPI) que atienda tanto la API como la interfaz web. Así no hace falta un servidor web aparte ni configurar CORS.

### Qué se consigue

- **Mismo origen y puerto:** Todo en `http://servidor:8000`: la API en `/api/*` y la web en `/`, `/config`, etc.
- **Un solo proceso:** Solo se ejecuta el backend; él sirve el build del frontend (HTML, JS, CSS).

### Pasos al terminar el desarrollo

1. **Generar el build del frontend**
   ```bash
   cd frontend
   npm run build
   ```
   Se crea la carpeta `frontend/dist/` con `index.html` y la carpeta `assets/` (JS y CSS).

2. **Arrancar el backend desde la raíz del proyecto**
   El backend ya está preparado para detectar si existe `frontend/dist`. Si existe:
   - Monta los estáticos en `/assets` (para que el navegador cargue los JS/CSS del build).
   - Cualquier ruta que no sea `/api`, `/docs` ni `/redoc` devuelve `index.html` (para que la SPA de React funcione al recargar o al entrar por URL directa).

   Desde la raíz del repo (o desde `backend` si en el servidor has copiado `dist` dentro de `backend/static`, ver más abajo):
   ```bash
   cd backend
   python run.py
   # o: uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   Abre `http://localhost:8000`: verás la interfaz web. La API sigue en `http://localhost:8000/api` y la doc en `/docs`.

3. **Despliegue en servidor (opcional)**  
   Si en el servidor no tienes la carpeta `frontend/` (solo subes el backend):
   - Copia el contenido de `frontend/dist/` a `backend/static/` (crea la carpeta `static` y pega ahí `index.html` y la carpeta `assets`).
   - En `app/main.py` se usa por defecto la ruta `../frontend/dist` respecto al backend; si solo existe `backend/static`, ajusta la variable `FRONTEND_DIST` en `app/main.py` para que apunte a `static` (o documenta en este archivo la ruta que uses).

### Comportamiento técnico (ya implementado en el backend)

- Si existe la carpeta de build (por defecto `santander/frontend/dist` respecto a la raíz del repo):
  - Se monta `StaticFiles` en `/assets` con esa carpeta `dist/assets`.
  - Se añade una ruta “catch-all” que devuelve `dist/index.html` para cualquier path que no sea `/api/*`, `/docs` o `/redoc`.
- Si no existe esa carpeta (solo desarrollas el backend), la ruta `/` sigue devolviendo JSON de información del servicio y no se monta nada del frontend.

Detalle del código: en `backend/app/main.py`, bloque “Servir frontend en producción”.

---

## Próximos pasos (Subtasks)

- **Subtask 7:** Integrar la capa Modbus (reutilizar PoC) y mock para desarrollo sin hardware.
- **Subtask 9:** Conectar API a SQLite (tablas en `MODELO_DATOS.md`) y a la lógica de modos/actuaciones.
- **Servicio Windows:** Script o instrucciones para instalar el backend como servicio (Subtask 6).

Documentos de referencia: `GUIA_SUBTASKS.md`, `API_SPEC.md`, `ARQUITECTURA.md`, `APROVECHAMIENTO_POC.md`.
