# 11 · Despliegue en SnapDeploy (entorno de pruebas)

[SnapDeploy](https://snapdeploy.dev) ejecuta contenedores Docker en AWS. Reemplaza a Render como entorno de pruebas para revisar cada implementación que entra a `develop`. La configuración de Render ([08](08-despliegue-render.md) y `render.yaml`) se conserva como alternativa.

## Qué se despliega

| Recurso | Dónde | Rama que despliega | Carpeta (*root directory*) | Detalle |
| --- | --- | --- | --- | --- |
| API | Contenedor SnapDeploy (gratis) | `deploy/api` | `api` | [`api/Dockerfile`](../api/Dockerfile). Aplica migraciones al arrancar; health en `/api/health` |
| Web | Contenedor SnapDeploy (gratis) | `deploy/web` | `web` | [`web/Dockerfile`](../web/Dockerfile). Next.js en modo *standalone* |
| Base de datos | [Neon](https://neon.com) (gratis) | — | — | PostgreSQL con PostGIS; la primera migración activa la extensión |

**Por qué la base de datos va fuera de SnapDeploy:** el plan gratuito de SnapDeploy no incluye bases de datos; su PostgreSQL es un complemento de pago (prueba de 1 USD por 12 horas) y su documentación no menciona PostGIS, que la API necesita. SnapDeploy permite conectarse a bases externas como Neon o Supabase por el puerto estándar 5432.

**Por qué ramas `deploy/*`:** SnapDeploy enlaza cada contenedor a una rama y redespliega en cada push a esa rama, sin mirar qué carpeta cambió. El workflow [`.github/workflows/snapdeploy-sync.yml`](../.github/workflows/snapdeploy-sync.yml) copia `develop` a `deploy/api` solo si cambió `api/`, y a `deploy/web` solo si cambió `web/`. Así un cambio en la web no gasta un despliegue de la API (el plan gratuito permite 10 al día, y los fallidos también cuentan). Nunca se trabaja directamente en las ramas `deploy/*`: el workflow las sobrescribe.

## Primer despliegue

Hacerlo en este orden, porque cada paso usa una URL del anterior.

### 1. Crear las ramas de despliegue

Con este cambio ya unido a `develop`, en GitHub: **Actions → Sincronizar ramas de SnapDeploy → Run workflow**, rama `develop`, servicio `ambos`. Al terminar existen `deploy/api` y `deploy/web`.

### 2. Base de datos en Neon

1. Crear una cuenta en [neon.com](https://neon.com) y un proyecto `rapichonta`. Región: una de AWS en Estados Unidos (SnapDeploy corre en AWS; mientras más cerca, menos latencia).
2. En **Connect**, desactivar *Connection pooling* y copiar la cadena de conexión directa. Tiene esta forma:
   `postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
   La conexión directa (sin `-pooler` en el host) es la que necesitan las migraciones de Prisma.
3. No hace falta crear tablas ni activar PostGIS a mano: la API ejecuta `prisma migrate deploy` al arrancar y la primera migración hace `CREATE EXTENSION postgis`.

### 3. Contenedor de la API

1. En SnapDeploy: **Deploy → Connect GitHub**, autorizar y elegir el repositorio `Yadirtf/RapiChonta`.
2. Rama: `deploy/api`. *Root directory*: `api`. SnapDeploy encuentra el `Dockerfile` y lo usa tal cual.
3. En la pantalla de variables de entorno:

   | Variable | Valor | Nota |
   | --- | --- | --- |
   | `DATABASE_URL` | La cadena de Neon del paso 2 | Secreto |
   | `JWT_SECRET` | Una cadena aleatoria larga, por ejemplo la salida de `openssl rand -hex 32` | Secreto |
   | `CORS_ORIGIN` | Por ahora `http://localhost:3001`; se corrige en el paso 5 | Varios orígenes separados por coma |
   | `SEED_DEMO_DATA` | `true` | Carga los establecimientos de ejemplo si la tabla está vacía. Se puede dejar o borrar después |

   No definir `PORT` ni `HOST`: los pone SnapDeploy y la API los respeta. `NODE_ENV=production` ya viene en la imagen.
4. Desplegar. Cuando termine, abrir `https://<contenedor-api>.containers.snapdeploy.app/api/health` en el navegador; debe responder `{"status":"ok",...}`. Anotar esa URL base.

Sin `DATABASE_URL` la API también arranca, pero con datos en memoria. Sirve para probar el contenedor antes de tener Neon.

### 4. Contenedor de la web

1. Nuevo despliegue desde el mismo repositorio. Rama: `deploy/web`. *Root directory*: `web`.
2. Variables (antes del primer build, porque se graban en el código del navegador):

   | Variable | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_API_URL` | `https://<contenedor-api>.containers.snapdeploy.app/api/v1` |
   | `NEXT_PUBLIC_MAP_STYLE_URL` | Opcional. Por defecto `https://tiles.openfreemap.org/styles/liberty` |

   SnapDeploy pasa las variables `NEXT_PUBLIC_*` al build automáticamente. No poner secretos en ellas: cualquiera las ve en el navegador, y si el nombre contiene `SECRET`, `PRIVATE` o `SERVICE_ROLE` el build falla a propósito.
3. Desplegar y anotar la URL de la web.

### 5. Cerrar el círculo (CORS)

En el contenedor de la API, **Settings → Environment Variables**: cambiar `CORS_ORIGIN` por la URL de la web, sin `/` al final (por ejemplo `https://rapichonta-web.containers.snapdeploy.app`). Guardar; SnapDeploy reinicia la API sin cortar el servicio en unos 2–3 minutos.

Abrir la web, permitir la ubicación y verificar que el mapa muestra los establecimientos de ejemplo.

## Despliegues siguientes

1. Se trabaja en una rama `feature/*` y se abre un PR hacia `develop`.
2. Al unir el PR, el workflow actualiza `deploy/api` y/o `deploy/web` según las carpetas que cambiaron.
3. SnapDeploy detecta el push y reconstruye solo ese contenedor. Si la versión nueva no responde, sigue sirviendo la anterior y el despliegue queda marcado como fallido con el final del log.

Para forzar un redespliegue sin cambios de código (por ejemplo, después de cambiar `NEXT_PUBLIC_API_URL`): **Actions → Sincronizar ramas de SnapDeploy → Run workflow** y elegir el servicio. Si el commit no cambió, usar el botón *Deploy* del contenedor en SnapDeploy. Las variables que no son `NEXT_PUBLIC_*` no requieren redespliegue: basta con guardarlas.

Si un push llega mientras SnapDeploy está construyendo, lo rechaza; hay que volver a ejecutar el workflow cuando termine.

## Límites del plan gratuito que afectan las pruebas

- **Los contenedores se duermen** tras unos 15 minutos sin tráfico y **solo despiertan cuando una persona abre la página en el navegador** (tarda ~60 s). Una petición `fetch` desde la web no despierta a la API: recibe un 503 sin cabeceras CORS y el navegador muestra un error de red. Antes de una prueba, abrir primero `https://<contenedor-api>.../api/health` en una pestaña, esperar el `ok`, y luego abrir la web. Lo mismo aplica a la app Flutter.
- **100 horas de contenedor al mes**, compartidas entre la API y la web. El tiempo dormido no cuenta.
- **10 despliegues al día** (5 cada 12 horas). Los fallidos cuentan. Por eso conviene probar el build en local antes de unir a `develop` (ver abajo).
- **512 MB de RAM y 0,25 vCPU** por contenedor. Alcanza para el MVP; la web usa ~100 MB en modo *standalone*.
- **Sin WebSockets ni dominios propios** en el plan gratuito. Cuando lleguen el chat estructurado y las notificaciones en tiempo real, o el dominio de RapiChonta, habrá que pasar el contenedor de la API a *Always-On* (desde 12 USD/mes, o 1 USD por 24 h para una prueba puntual).
- **100 peticiones por minuto por IP**, igual al límite que ya tiene la API.

## Probar la imagen en local antes de unir a `develop`

```bash
# API con PostGIS local
docker network create rc
docker run -d --name rc-db --network rc -e POSTGRES_USER=rc -e POSTGRES_PASSWORD=rc -e POSTGRES_DB=rc postgis/postgis:16-3.4
docker build -t rc-api api
docker run --rm --network rc -p 3000:3000 \
  -e DATABASE_URL=postgresql://rc:rc@rc-db:5432/rc -e SEED_DEMO_DATA=true -e CORS_ORIGIN=http://localhost:3001 rc-api

# Web
docker build -t rc-web --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1 web
docker run --rm -p 3001:3000 rc-web    # http://localhost:3001
```

Si la imagen construye y arranca en local, construirá en SnapDeploy.

## App Flutter

La app no se despliega en SnapDeploy; se compila para las tiendas y apunta a la API con `--dart-define=API_URL=https://<contenedor-api>.containers.snapdeploy.app/api/v1`.

## Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| La web carga pero el mapa no trae establecimientos | API dormida, o `CORS_ORIGIN` no coincide con la URL de la web | Abrir `/api/health` de la API en el navegador; revisar `CORS_ORIGIN` (sin `/` final) |
| La web llama a `localhost:3000` | `NEXT_PUBLIC_API_URL` no estaba definida en el build | Definirla y redesplegar la web |
| "Health check never passed" en la API | Error al conectar con la base o en una migración | Ver el final del log del despliegue; revisar `DATABASE_URL` y que tenga `sslmode=require` |
| `P1001: Can't reach database server` | Neon suspendido tardó en despertar, o cadena incorrecta | Redesplegar; confirmar la cadena directa (sin `-pooler`) |
| `type "geography" does not exist` | La base no permite PostGIS | Usar Neon o Supabase, que lo incluyen |
| El workflow falla con `403` al hacer push | Permisos de Actions en solo lectura | GitHub → Settings → Actions → General → *Workflow permissions* → *Read and write* |

## Referencias

- [Guía de despliegue de SnapDeploy](https://snapdeploy.dev/docs/deployment)
- [Despliegue desde GitHub (ramas, root directory)](https://snapdeploy.dev/docs/github)
- [Variables de entorno](https://snapdeploy.dev/docs/environment-variables)
- [Límites del plan gratuito](https://snapdeploy.dev/docs/free-tier)
- [Complementos y bases externas](https://snapdeploy.dev/docs/addon-services)
- [Planes de Neon](https://neon.com/pricing)
