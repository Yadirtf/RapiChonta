# 08 · Despliegue en Render (alternativa)

> El entorno de pruebas actual está en SnapDeploy: ver [11 · Despliegue en SnapDeploy](11-despliegue-snapdeploy.md). Esta guía se conserva por si se vuelve a Render.

El archivo [`render.yaml`](../render.yaml) en la raíz describe toda la infraestructura de pruebas:

| Recurso | Tipo | Carpeta | Detalle |
| --- | --- | --- | --- |
| `rapichonta-db` | PostgreSQL 16 | — | PostGIS se activa con la primera migración |
| `rapichonta-api` | Web service Node | `api/` | Aplica migraciones al arrancar; health check en `/api/health` |
| `rapichonta-web` | Web service Node | `web/` | Next.js en modo servidor |

La app Flutter no se despliega en Render; se compila para las tiendas y apunta a la URL de la API con `--dart-define=API_URL=...`.

> Render detecta el blueprint con el nombre `render.yaml`. Por eso el archivo se llama así y no `render.yml`.

## Primer despliegue

1. En Render: **New → Blueprint**, conectar el repositorio `Yadirtf/RapiChonta` y elegir la rama `develop`.
2. Render pide los valores marcados como `sync: false`:
   - `CORS_ORIGIN` en la API: la URL de la web, por ejemplo `https://rapichonta-web.onrender.com`.
   - `NEXT_PUBLIC_API_URL` en la web: la URL de la API con versión, por ejemplo `https://rapichonta-api.onrender.com/api/v1`.
   Las URLs exactas aparecen al crear los servicios; si cambian, actualizar las variables y volver a desplegar la web (las variables `NEXT_PUBLIC_*` se fijan en el build).
3. Cargar datos de ejemplo una vez, desde la *Shell* del servicio `rapichonta-api`: `npm run prisma:seed` (o desde tu equipo con la *External Database URL*).
4. Abrir la web y permitir la ubicación.

## Despliegues siguientes

Cada merge a `develop` despliega automáticamente solo el servicio cuya carpeta cambió (`buildFilter`).

## Límites del plan gratuito

- Los servicios se duermen tras 15 minutos sin tráfico; la primera petición tarda unos 30–60 s en despertar.
- La base de datos gratuita vence a los 30 días y tiene 1 GB. Para el piloto (fase 2) conviene pasar a planes pagos *Starter* (API, web) y *Basic* (base de datos) con copias de seguridad.
- Para producción se recomienda duplicar el blueprint con servicios `-prod` desplegando desde `main`.
