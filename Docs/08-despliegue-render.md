# 08 · Despliegue en Render (entorno de pruebas)

> Render con la base en Neon es el entorno de pruebas actual. SnapDeploy ([11](11-despliegue-snapdeploy.md)) quedó en desuso; esa guía se conserva porque explica Sentry, notificaciones push y la prueba local de la imagen, que valen igual aquí.

El archivo [`render.yaml`](../render.yaml) en la raíz crea **un solo servicio Docker** (`rapichonta`) construido con el [`Dockerfile`](../Dockerfile) de la raíz:

| Recurso | Dónde | Detalle |
| --- | --- | --- |
| `rapichonta` | Render, web service Docker (gratis) | La web (Next.js) atiende el puerto público y reenvía `/api/*` a la API (NestJS) dentro del contenedor. Health check en `/api/health` |
| Base de datos | [Neon](https://neon.com) (gratis) | PostgreSQL con PostGIS. Render no crea ninguna base |

**Por qué así:**

- Render permite **una sola base gratuita por cuenta**. Si ya hay una, el blueprint falla con *"cannot have more than one active free tier database"* y cancela los servicios. Además vence a los 30 días. Neon no tiene ese límite y ya se usa en SnapDeploy.
- La cookie de sesión del panel es `SameSite=Strict`. `onrender.com` es un sufijo público, así que `rapichonta-web.onrender.com` y `rapichonta-api.onrender.com` serían sitios distintos y la sesión web se perdería al recargar. Con un solo servicio la web y la API comparten dominio y no hacen falta `CORS_ORIGIN` ni `NEXT_PUBLIC_API_URL`.
- Al arrancar, `start.sh` aplica las migraciones (`prisma migrate deploy`, la primera hace `CREATE EXTENSION postgis`) y la semilla idempotente. No hay que entrar a ninguna *Shell*.
- Consume ~215 MB de RAM, dentro de los 512 MB del plan gratuito.

La app Flutter no se despliega en Render: el flujo `app-android.yml` la compila con `API_URL` apuntando a este servicio (`https://rapichonta.onrender.com/api/v1`, valor `DEFAULT_API_URL` del flujo). Si la URL del servicio cambia, actualizar ese valor o definir la variable del repositorio `API_URL`, que tiene prioridad.

## Primer despliegue

### 1. Base de datos en Neon

Se puede usar la **misma base de SnapDeploy** (las migraciones y la semilla son idempotentes; los dos entornos verán los mismos datos) o una rama nueva de Neon (**Branches → New branch**) para tener datos separados.

En Neon, **Connect**, desactivar *Connection pooling* y copiar la cadena directa (sin `-pooler` en el host):
`postgresql://usuario:clave@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

Anotar la región (`us-east-2`, `us-east-1`…): el servicio de Render debe quedar en la misma. `render.yaml` usa `region: ohio` (= `us-east-2`). Si la base está en otra región, cambiar esa línea antes de crear el blueprint (`virginia` = `us-east-1`, `oregon` = `us-west-2`); la región no se puede cambiar después.

### 2. Blueprint en Render

1. **New → Blueprint**, conectar `Yadirtf/RapiChonta`, rama `develop`.
2. Render pide los valores marcados `sync: false`:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | La cadena de Neon del paso 1 |
   | `SEED_ADMIN_PHONE` | Celular del primer administrador, por ejemplo `3001234567` |
   | `SEED_ADMIN_PASSWORD` | Contraseña de al menos 10 caracteres |
   | `SEED_ADMIN_NAME` | Nombre del administrador |

   Si la base ya tiene ese administrador (por ejemplo, la misma de SnapDeploy), la semilla no lo duplica.
3. **Apply**. El primer build Docker tarda varios minutos.

Render genera solo `JWT_SECRET`, `OTP_PEPPER` y `FILES_SIGNING_SECRET`, y fija `OTP_PROVIDER=console`, `OTP_EXPOSE_CODE=true` (el código de acceso se ve en pantalla; **nunca en producción**) y `SEED_DEMO_DATA=true`. No definir `PORT`, `CORS_ORIGIN` ni `NEXT_PUBLIC_API_URL`.

Variables opcionales, desde **Environment** del servicio (mismos valores y explicación que en [11](11-despliegue-snapdeploy.md)):

- Sentry: `SENTRY_DSN` (API) y `NEXT_PUBLIC_SENTRY_DSN` (web). Render pasa las variables al build de Docker, así que la web las toma al compilar; después de agregarlas hay que redesplegar.
- Notificaciones push (E06): `FCM_SERVICE_ACCOUNT`, `HMS_APP_ID`, `HMS_CLIENT_SECRET`, `HMS_MESSAGE_CATEGORY`. Sin ellas los avisos quedan en la bandeja de la app.
- SMS: `OTP_PROVIDER=twilio` con `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- Fotos en R2: `FILE_STORAGE=s3` y las variables `S3_*`.

### 3. Verificar

- `https://rapichonta.onrender.com/api/health` (o `https://<servicio>.onrender.com` si el nombre cambia) responde `{"status":"ok",...}`.
- `https://<servicio>.onrender.com/` muestra el mapa; al permitir la ubicación aparecen los establecimientos de ejemplo.

### Si un blueprint anterior falló

El `render.yaml` anterior creaba `rapichonta-db`, `rapichonta-api` y `rapichonta-web`. Si quedó a medias (por ejemplo, solo `rapichonta-web` creado), borrar `rapichonta-web` (**Settings → Delete Web Service**) y el blueprint viejo (**Blueprints → … → Settings → Delete Blueprint**), y crear el blueprint nuevo. Ese servicio era Node, no Docker, y no se reutiliza.

## Despliegues siguientes

Cada merge a `develop` que toque `api/`, `web/`, `Dockerfile` o `start.sh` reconstruye la imagen y despliega (`buildFilter`). Los cambios solo en `app/` o `Docs/` no despliegan.

## Límites del plan gratuito

- El servicio se duerme tras 15 minutos sin tráfico; la primera petición tarda 30–60 s en despertar. Neon también se suspende y despierta en la primera consulta.
- 750 horas de instancia al mes por cuenta: alcanza para este único servicio.
- Para producción conviene un plan pago (*Starter*) y un servicio `-prod` desplegando desde `main`, con su propia base en Neon.

## Problemas comunes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| *cannot have more than one active free tier database* | Blueprint anterior con base de Render | Usar este `render.yaml` (sin base de Render) |
| `P1001: Can't reach database server` | Cadena incorrecta o Neon despertando | Revisar `DATABASE_URL` (directa, con `sslmode=require`) y redesplegar |
| `type "geography" does not exist` | La base no tiene PostGIS | Usar Neon |
| La sesión del panel se pierde al recargar | Web y API en dominios distintos | Usar el servicio único de este blueprint |
