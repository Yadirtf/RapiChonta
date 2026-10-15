# Documentación de RapiChonta

Esta carpeta es la fuente de verdad del proyecto: qué se construye, con qué, cómo y en qué orden. Cada documento es corto y se puede ajustar antes de implementar cada fase. Si una decisión cambia, se cambia aquí primero.

| # | Documento | Qué responde |
| --- | --- | --- |
| 01 | [Visión y alcance](01-vision-y-alcance.md) | Qué es RapiChonta, para quién, qué entra y qué no entra en el MVP |
| 02 | [Stack tecnológico](02-stack-tecnologico.md) | Tecnologías elegidas para API, base de datos, web y app, con alternativas descartadas |
| 03 | [Arquitectura](03-arquitectura.md) | Cómo se organiza el sistema y cada proyecto con arquitectura limpia |
| 04 | [Modelo de datos](04-modelo-de-datos.md) | Entidades, relaciones y consultas geográficas |
| 05 | [Flujos y UX](05-flujos-y-ux.md) | Recorrido del cliente, del operador y del domiciliario; estados del pedido; lineamientos visuales |
| 06 | [Seguridad](06-seguridad.md) | Autenticación, roles, protección de datos y del dinero |
| 07 | [Roadmap por fases](07-roadmap.md) | Orden de implementación y criterio de "terminado" de cada fase |
| 08 | [Despliegue en Render](08-despliegue-render.md) | Cómo levantar el entorno de pruebas con `render.yaml` |
| 09 | [Convenciones de trabajo](09-convenciones.md) | Ramas, commits, PRs, pruebas y estilo |
| 10 | [Aspectos adicionales](10-aspectos-adicionales.md) | Temas que el negocio necesita y no estaban en la idea inicial |

## Resumen de decisiones

- **Modelo MVP:** el cliente pide a RapiChonta, un operador asigna manualmente al domiciliario disponible más cercano, el domiciliario compra en el establecimiento y entrega. RapiChonta es intermediaria; los comercios no están integrados todavía.
- **Monorepo** con tres proyectos independientes: `api/`, `web/`, `app/`, y `render.yaml` en la raíz.
- **API:** NestJS + TypeScript, PostgreSQL 16 + PostGIS, Prisma.
- **Web:** Next.js + React + Tailwind CSS + Framer Motion + MapLibre.
- **App:** Flutter (Android, iOS, Huawei AppGallery y web desde un solo código).
- **Mapas:** OpenStreetMap / MapLibre, para no depender de Google (indispensable en Huawei) ni pagar por mapa cargado en el MVP.
- **Ramas:** `main` (producción), `develop` (integración y despliegue de pruebas en Render), ramas `feature/*` hacia `develop`.

## Estado actual del código

La estructura base ya compila y funciona de punta a punta: la API expone `GET /api/health` y `GET /api/v1/establishments/nearby`, la web muestra el menú lateral con el mapa y los establecimientos cercanos, y la app Flutter tiene la misma pantalla con menú lateral (drawer en teléfono, fijo en tableta).
