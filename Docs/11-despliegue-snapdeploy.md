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
   | `SEED_DEMO_DATA` | `true` | Carga los establecimientos de ejemplo si la tabla está vacía. Se puede borrar después |

   No definir `PORT` ni `HOST` (los pone SnapDeploy), ni `NEXT_PUBLIC_API_URL` ni `CORS_ORIGIN` (no hacen falta con un solo dominio). Si SnapDeploy detecta otras variables en los `.env.example`, se pueden dejar vacías.
4. Desplegar. El primer build tarda unos minutos.
5. Verificar:
   - `https://<contenedor>.containers.snapdeploy.app/api/health` responde `{"status":"ok",...}`.
   - `https://<contenedor>.containers.snapdeploy.app/` muestra el mapa; al permitir la ubicación aparecen los establecimientos de ejemplo.

## Despliegues siguientes

Se trabaja en una rama `feature/*` y se abre un PR hacia `develop`. Al unirlo, SnapDeploy detecta el push y reconstruye el contenedor. Si la versión nueva no responde, sigue sirviendo la anterior y el despliegue queda marcado como fallido con el final del log.

- Cambiar una variable normal (como `DATABASE_URL`) no requiere redespliegue: se guarda en **Settings → Environment Variables** y SnapDeploy reinicia el contenedor sin cortar el servicio.
- Si un push llega mientras SnapDeploy está construyendo, lo rechaza; usar el botón *Deploy* del contenedor cuando termine.

## App Flutter

La app no se despliega en SnapDeploy; se compila para las tiendas y apunta a la API con `--dart-define=API_URL=https://<contenedor>.containers.snapdeploy.app/api/v1`.

## Límites del plan gratuito que afectan las pruebas

- **El contenedor se duerme** tras unos 15 minutos sin tráfico y **solo despierta cuando una persona abre la página en el navegador** (~60 s). Abrir la web despierta todo. La app Flutter no lo despierta: antes de probarla, abrir la web una vez.
- **100 horas de contenedor al mes.** El tiempo dormido no cuenta.
- **10 despliegues al día** (5 cada 12 horas), y los fallidos cuentan. Conviene probar el build en local antes de unir a `develop` (ver abajo).
- **512 MB de RAM y 0,25 vCPU.** Alcanza para el MVP.
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
