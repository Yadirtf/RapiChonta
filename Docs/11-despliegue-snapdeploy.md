# 11 · Despliegue en SnapDeploy (entorno de pruebas)

[SnapDeploy](https://snapdeploy.dev) ejecuta contenedores Docker en AWS. Reemplaza a Render como entorno de pruebas para revisar cada implementación que entra a `develop`. La configuración de Render ([08](08-despliegue-render.md) y `render.yaml`) se conserva como alternativa.

## Cómo queda

Igual que el `render.yaml` describía todo el entorno, el [`Dockerfile`](../Dockerfile) de la raíz construye **la API y la web en un solo contenedor**:

```
navegador / app ──HTTPS──▶ contenedor SnapDeploy
                           ├── web Next.js (puerto público)
                           │     /api/*  ──reenvía──▶  API NestJS (127.0.0.1:4000)
                           └──────────────────────────────┘
                                                          └──▶ PostgreSQL + PostGIS en Neon
```

- La web atiende el puerto público y reenvía todo lo que empieza por `/api/` a la API, que corre en el mismo contenedor. Web y API comparten dominio: no hay que configurar CORS ni URLs entre servicios.
- [`start.sh`](../start.sh) aplica las migraciones, carga los datos de ejemplo si se pide, y arranca los dos procesos. Si uno cae, el contenedor se reinicia.
- Un solo contenedor gasta la mitad de las horas gratuitas, un solo despliegue por cambio y, al abrir la web, despierta también la API.
- Consumo medido: ~215 MB de RAM entre los dos procesos, dentro de los 512 MB del plan gratuito.

**La base de datos va en [Neon](https://neon.com) (gratis):** el plan gratuito de SnapDeploy no incluye bases de datos; su PostgreSQL es un complemento de pago y su documentación no menciona PostGIS, que la API necesita. SnapDeploy permite conectarse a bases externas por el puerto 5432.

## Primer despliegue

### 1. Base de datos en Neon

1. Crear una cuenta en [neon.com](https://neon.com) y un proyecto `rapichonta`. Región: una de AWS en Estados Unidos (SnapDeploy corre en AWS).
2. En **Connect**, desactivar *Connection pooling* y copiar la cadena de conexión directa. Tiene esta forma:
   `postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
   La conexión directa (sin `-pooler` en el host) es la que necesitan las migraciones de Prisma.
3. No hace falta crear tablas ni activar PostGIS a mano: el contenedor ejecuta `prisma migrate deploy` al arrancar y la primera migración hace `CREATE EXTENSION postgis`.

### 2. Contenedor en SnapDeploy

SnapDeploy permite **un contenedor por repositorio y rama**. Si ya existe un contenedor enlazado a `develop` (por ejemplo, uno creado antes con *Root Directory* `api`), hay que reutilizarlo dejando vacío el *Root Directory*, o eliminarlo y crear uno nuevo. Si no, aparece el error *"Repository … (branch: develop) is already linked to container"*.

1. **Deploy → Connect GitHub**, elegir `Yadirtf/RapiChonta`, rama `develop`.
2. En *Advanced Options*, dejar el **Root Directory vacío**. SnapDeploy encuentra el `Dockerfile` de la raíz y lo usa tal cual.
3. Variables de entorno:

   | Variable | Valor | Nota |
   | --- | --- | --- |
   | `DATABASE_URL` | La cadena de Neon del paso 1 | Secreto. Sin ella la API arranca con datos en memoria |
   | `JWT_SECRET` | Una cadena aleatoria larga, por ejemplo la salida de `openssl rand -hex 32` | Secreto |
   | `OTP_PEPPER` | Otra cadena aleatoria (`openssl rand -hex 32`) | Secreto. Opcional; si falta, los códigos se firman con `JWT_SECRET` |
   | `OTP_PROVIDER` | `console` mientras no haya proveedor de SMS; `twilio` cuando lo haya | Con `console` el código se escribe en el log del contenedor |
   | `OTP_EXPOSE_CODE` | `true` solo en este entorno de pruebas | Devuelve el código en la respuesta y la pantalla lo muestra. **Nunca en producción** |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Datos de Twilio Verify | Secretos. Solo con `OTP_PROVIDER=twilio` (SMS y WhatsApp) |
   | `SEED_ADMIN_PHONE` | Celular del primer administrador, por ejemplo `3001234567` | Se crea al arrancar si el número no existe |
   | `SEED_ADMIN_PASSWORD` | Contraseña de al menos 10 caracteres | Secreto. Después de crear el administrador se puede borrar la variable |
   | `SEED_ADMIN_NAME` | Nombre del administrador | |
   | `SEED_DEMO_DATA` | `true` | Carga los establecimientos de ejemplo con su menú (`api/prisma/catalog/demo`) sin duplicar (exige el administrador inicial). Se puede borrar después |
   | `FILE_STORAGE` | `database` (o no definirla) | Fotos de productos y logos en la base de datos (Neon). Con `s3` van a Cloudflare R2; ver "Fotos en R2" abajo |
   | `FILES_SIGNING_SECRET` | Otra cadena aleatoria (`openssl rand -hex 32`) | Secreto. Opcional; firma las URLs de las fotos. Si falta se deriva de `JWT_SECRET` |
   | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | DSN del proyecto `rapichonta-api` en Sentry y `pruebas` | Opcional. Ver "Errores en Sentry y logs" abajo |
   | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | DSN del proyecto `rapichonta-web` y `pruebas` | Opcional. Se leen al **compilar** la imagen (argumentos de build del `Dockerfile`) |
   | `FCM_SERVICE_ACCOUNT`, `HMS_APP_ID`, `HMS_CLIENT_SECRET`, `HMS_MESSAGE_CATEGORY` | Credenciales de Firebase y de Huawei Push Kit | Opcional. Ver "Notificaciones push" abajo |

   La cookie de la sesión web va con `Secure` porque el `Dockerfile` usa `NODE_ENV=production`; solo para probar la imagen en local por `http://` se define `COOKIE_SECURE=false`.

   No definir `PORT` ni `HOST` (los pone SnapDeploy), ni `NEXT_PUBLIC_API_URL` ni `CORS_ORIGIN` (no hacen falta con un solo dominio). Si SnapDeploy detecta otras variables en los `.env.example`, se pueden dejar vacías.
4. Desplegar. El primer build tarda unos minutos.
5. Verificar:
   - `https://<contenedor>.containers.snapdeploy.app/api/health` responde `{"status":"ok",...}`.
   - `https://<contenedor>.containers.snapdeploy.app/` muestra el mapa; al permitir la ubicación aparecen los establecimientos de ejemplo.

### Una sola vez: reiniciar la base al llegar E01

E01 reemplazó la migración inicial por el esquema normalizado (`20261016000000_init`). Una base que ya tenía la migración anterior (`20261015000000_init`) no puede aplicarla, y el contenedor no arranca. Como esa base solo tenía datos de ejemplo, se vacía una vez desde el **SQL Editor** de Neon, antes del despliegue:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

Al arrancar, el contenedor vuelve a crear las extensiones, las tablas, los catálogos y el administrador inicial.

Las migraciones siguientes (E02 en adelante, `20261017000000_catalog_e02`) son aditivas: el contenedor las aplica solo al arrancar, sin borrar datos.

### Fotos en R2 (opcional)

Mientras haya pocas fotos, guardarlas en Neon es suficiente. Para pasarlas a Cloudflare R2:

1. Crear un bucket y un token de API de R2 con permiso de lectura y escritura sobre ese bucket.
2. En el bucket, **Settings → CORS policy**, permitir el origen del contenedor: `[{"AllowedOrigins":["https://<contenedor>.containers.snapdeploy.app"],"AllowedMethods":["PUT","GET"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]`. Sin esto el navegador no puede subir la foto.
3. Variables: `FILE_STORAGE=s3`, `S3_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (secretos) y `S3_REGION=auto`. Si falta alguna, la API no arranca y lo dice en el log.

Las fotos subidas antes en modo `database` siguen en Neon; el cambio aplica a las nuevas.

### Catálogo del piloto

Los locales se cargan desde el panel (`/panel/establecimientos`) o, para muchos a la vez, desde CSV con `npm run catalog:import -- <carpeta>` contra la `DATABASE_URL` de Neon. Columnas y reglas en [E02 · Carga inicial](14-base-de-datos/E02-establecimientos-y-menus.md#carga-inicial-h026).

## Despliegues siguientes

Se trabaja en una rama `feature/*` y se abre un PR hacia `develop`. Al unirlo, SnapDeploy detecta el push y reconstruye el contenedor. Si la versión nueva no responde, sigue sirviendo la anterior y el despliegue queda marcado como fallido con el final del log.

- Cambiar una variable normal (como `DATABASE_URL`) no requiere redespliegue: se guarda en **Settings → Environment Variables** y SnapDeploy reinicia el contenedor sin cortar el servicio.
- Si un push llega mientras SnapDeploy está construyendo, lo rechaza; usar el botón *Deploy* del contenedor cuando termine.

## Errores en Sentry y logs (H05.4)

Sin DSN no se envía nada a ningún lado; todo funciona igual. Para activarlo:

1. En [sentry.io](https://sentry.io) (el plan gratuito alcanza para el piloto) crear tres proyectos: `rapichonta-api` (Node.js), `rapichonta-web` (Next.js) y `rapichonta-app` (Flutter).
2. API: `SENTRY_DSN` y `SENTRY_ENVIRONMENT=pruebas` en las variables del contenedor.
3. Web: `NEXT_PUBLIC_SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_ENVIRONMENT=pruebas`. Como Next.js las fija al compilar, SnapDeploy tiene que pasarlas también como argumentos de build; si no lo permite, quedan solo los errores de la API.
4. App: variable del repositorio `SENTRY_DSN_APP` (GitHub → Settings → Secrets and variables → Actions → Variables). El flujo "App Android" la inyecta en el APK.

Qué se envía y qué no:

- Solo errores inesperados: en la API, respuestas 5xx (los errores de negocio, como "fuera de cobertura", no se reportan); en la web y la app, pantallas que fallaron.
- Cada evento lleva el entorno y la versión (`rapichonta-api@0.1.0`, `rapichonta-web@0.1.0`, la de la app con su número de compilación) y, en la API, el `request_id` de la petición.
- Nunca datos personales: sin usuario, IP, cookies, cuerpos ni la consulta de la URL (lleva la ubicación). Teléfonos, correos y números largos se tapan en los mensajes antes de enviarlos.

Logs de la API: con `NODE_ENV=production` cada línea es un JSON con `level`, `context`, `message` y `requestId`, más una línea por petición (`GET /api/v1/... 200 34 ms`, sin la consulta). La respuesta trae el mismo id en `X-Request-Id`, así un reporte de un cliente se encuentra en el log y en Sentry. `LOG_FORMAT=pretty` vuelve al formato legible.

## Notificaciones push (E06)

Sin credenciales todo funciona igual: los avisos quedan en la bandeja de la app (campana) y no llegan a la barra del teléfono. Con `PUSH_PROVIDERS_MODE=fake` la API escribe en el log lo que habría enviado.

**Firebase (FCM: Android con Google e iOS)**

1. En [console.firebase.google.com](https://console.firebase.google.com) crear el proyecto `rapichonta` y agregar una app Android con el paquete `com.rapichonta.rapichonta`.
2. API: Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada. El JSON completo (o en base64) va en `FCM_SERVICE_ACCOUNT` del contenedor. Es secreto.
3. App: de la misma configuración (app Android) se copian a las variables del repositorio `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID` y `FIREBASE_ANDROID_APP_ID`. No hace falta `google-services.json`: el flujo "App Android" las inyecta con `--dart-define`. Para iOS falta además subir la llave APNs a Firebase y `FIREBASE_IOS_APP_ID`.

**Huawei Push Kit (teléfonos Huawei sin Google)**

1. En [AppGallery Connect](https://developer.huawei.com/consumer/en/service/josp/agc/index.html) crear el proyecto y la app Android con el paquete `com.rapichonta.rapichonta`, y activar Push Kit (Crecer → Push Kit).
2. Registrar la huella SHA-256 del certificado con que se firma el APK (hoy, la clave de debug que genera el flujo; se ve con `keytool -list -v`). Sin ella el teléfono no entrega token.
3. API: `HMS_APP_ID` y `HMS_CLIENT_SECRET` (Mi proyecto → General → App ID y Client secret; `HMS_CLIENT_ID` solo si difiere del App ID).
4. App: descargar `agconnect-services.json` y pegar su contenido en la variable del repositorio `AGCONNECT_SERVICES_JSON`. El flujo lo copia al APK y compila con `HMS_PUSH_ENABLED=true`.
5. Pedir la **autoclasificación de mensajes** en Push Kit (categoría de pedidos/entregas, p. ej. `EXPRESS`) y ponerla en `HMS_MESSAGE_CATEGORY`. Sin aprobación, EMUI muestra los avisos como de marketing: sin sonido y con cupo diario.

La app prueba FCM primero y, si el teléfono no tiene servicios de Google, Huawei; recuerda el que funcionó. Registra el token al iniciar sesión (`PUT /me/push-token`) y lo borra al cerrarla.

## App Flutter

La app no se despliega en SnapDeploy; se compila para las tiendas y apunta a la API con `--dart-define=API_URL=https://<contenedor>.containers.snapdeploy.app/api/v1`. Los enlaces a los documentos legales abren la web; su dirección se deduce de `API_URL` y se puede cambiar con `--dart-define=WEB_URL=...`.

## Límites del plan gratuito que afectan las pruebas

- **El contenedor se duerme** tras unos 15 minutos sin tráfico y **solo despierta cuando una persona abre la página en el navegador** (~60 s). Abrir la web despierta todo. La app Flutter no lo despierta: antes de probarla, abrir la web una vez.
- **100 horas de contenedor al mes.** El tiempo dormido no cuenta.
- **10 despliegues al día** (5 cada 12 horas), y los fallidos cuentan. Conviene probar el build en local antes de unir a `develop` (ver abajo).
- **512 MB de RAM y 0,25 vCPU.** Alcanza para el MVP.
- **Máximo 2 etapas en el `Dockerfile`** en el plan gratuito. Por eso el `Dockerfile` raíz compila API y web en una sola etapa de build.
- **Sin WebSockets ni dominios propios** en el plan gratuito. Cuando lleguen el chat y las notificaciones en tiempo real, o el dominio de RapiChonta, habrá que pasar el contenedor a *Always-On* (desde 12 USD/mes, o 1 USD por 24 h para una prueba puntual).
- **100 peticiones por minuto por IP** en SnapDeploy, igual al límite que ya aplica la API. La API identifica la IP real del cliente a través del balanceador y de la web (`TRUST_PROXY=2` en el `Dockerfile`).

## Probar la imagen en local antes de unir a `develop`

```bash
docker network create rc
docker run -d --name rc-db --network rc -e POSTGRES_USER=rc -e POSTGRES_PASSWORD=rc -e POSTGRES_DB=rc postgis/postgis:16-3.4
docker build -t rapichonta .
docker run --rm --network rc -p 3000:3000 \
  -e DATABASE_URL=postgresql://rc:rc@rc-db:5432/rc -e SEED_DEMO_DATA=true rapichonta
# Web: http://localhost:3000   API: http://localhost:3000/api/health
```

Si la imagen construye y arranca en local, construirá en SnapDeploy.

## Separar API y web más adelante

Cuando el tráfico lo pida, `api/` y `web/` tienen su propio `Dockerfile` para desplegarlos como contenedores independientes (*Root Directory* `api` y `web`). Como SnapDeploy no enlaza dos contenedores a la misma rama, cada uno necesitaría su rama de despliegue, y en la web habría que definir `NEXT_PUBLIC_API_URL` con la URL de la API, y `CORS_ORIGIN` en la API.

## Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| *No application files found at the repository root* | La rama desplegada no tiene el `Dockerfile` raíz | Desplegar `develop` con este cambio ya unido |
| *Your Dockerfile has N build stages (limit: 2 for Small containers)* | El plan gratuito acepta como máximo 2 etapas `FROM` | Mantener el `Dockerfile` raíz en 2 etapas (build y runtime); no agregar etapas nuevas |
| *Repository … is already linked to container* | Ya hay un contenedor enlazado a esa rama | Reutilizarlo (Root Directory vacío) o eliminarlo |
| La web carga pero el mapa no trae establecimientos | La base está vacía o la API no conecta | Revisar el log; poner `SEED_DEMO_DATA=true` |
| "Health check never passed" | El contenedor no arranca, normalmente por la migración | Ver el final del log; revisar `DATABASE_URL` y que tenga `sslmode=require` |
| `P1001: Can't reach database server` | Neon tardó en despertar, o la cadena es incorrecta | Redesplegar; confirmar la cadena directa (sin `-pooler`) |
| `type "geography" does not exist` | La base no permite PostGIS | Usar Neon o Supabase, que lo incluyen |

## Referencias

- [Guía de despliegue de SnapDeploy](https://snapdeploy.dev/docs/deployment)
- [Despliegue desde GitHub (ramas, root directory)](https://snapdeploy.dev/docs/github)
- [Variables de entorno](https://snapdeploy.dev/docs/environment-variables)
- [Límites del plan gratuito](https://snapdeploy.dev/docs/free-tier)
- [Complementos y bases externas](https://snapdeploy.dev/docs/addon-services)
- [Planes de Neon](https://neon.com/pricing)
