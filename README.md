# RapiChonta

Plataforma móvil y web para pedir comida rápida, productos de supermercado y artículos de tiendas, con RapiChonta como intermediaria: un domiciliario hace la compra en el establecimiento y la lleva al cliente.

La documentación del proyecto vive en [`Docs/`](Docs/README.md).

## Estructura

| Carpeta | Proyecto | Tecnología |
| --- | --- | --- |
| [`api/`](api/README.md) | Backend REST | NestJS, PostgreSQL + PostGIS, Prisma |
| [`web/`](web/README.md) | Web para clientes, operadores y administradores | Next.js, Tailwind CSS, MapLibre |
| [`app/`](app/README.md) | App móvil (Android, iOS, Huawei) | Flutter |
| [`Docs/`](Docs/README.md) | Documentación del proyecto | Markdown |
| `api/Dockerfile`, `web/Dockerfile` | Imágenes del entorno de pruebas en SnapDeploy ([guía](Docs/11-despliegue-snapdeploy.md)) | Docker |
| `render.yaml` | Alternativa: infraestructura en Render | Blueprint |

## Ramas

`main` es producción, `develop` es integración y se despliega en SnapDeploy. El trabajo se hace en ramas `feature/*` que entran a `develop` por pull request. Ver [convenciones](Docs/09-convenciones.md).
