# COCE — Dashboard (POC)

Aplicación **React + Vite + TypeScript** para prototipo de **Centro de Control**: registro de sucursales (sistemas locales), consulta de modos del panel, modo activo, activación de reglas y estado de placas vía la misma API que usa la tableta y el panel web del backend `santander`.

## Arranque

```bash
cd coce-dashboard
npm install
npm run dev
```

Por defecto el servidor de desarrollo usa el puerto **5174** (el `frontend` habitual suele usar 5173).

## Funcionalidad

| Acción | API usada |
|--------|-----------|
| Login tableta | `POST /api/v1/auth/token` |
| Lista de modos / reglas | `GET /api/v1/modes` |
| Modo activo | `GET /api/v1/get_mode` |
| Activar modo | `POST /api/v1/set_mode` (`action: set_rule`, `rule_key`, `active: true`) |
| Placas (opcional) | `POST /api/auth/login` + `GET /api/panel/status` |

Las rutas son **fijas**; solo cambian host, puerto y protocolo (HTTP/HTTPS) por sucursal.

## Datos locales

Las sucursales y credenciales se guardan en **localStorage** del navegador. Es adecuado para demostración; en un COCE real habría servidor central, cifrado y políticas de acceso.

## CORS

Las peticiones van del navegador directamente al PC de cada oficina. El backend ya incluye `CORSMiddleware` con orígenes abiertos en desarrollo; en producción conviene restringir orígenes o servir este dashboard detrás del mismo dominio que decida el banco.

## Build estático

```bash
npm run build
```

Salida en `dist/`. Se puede servir con cualquier servidor estático o integrarse más adelante en un monorepo de despliegue.
