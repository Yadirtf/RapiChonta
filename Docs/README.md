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
| 08 | [Despliegue en Render](08-despliegue-render.md) | Alternativa: entorno de pruebas con `render.yaml` |
| 09 | [Convenciones de trabajo](09-convenciones.md) | Ramas, commits, PRs, pruebas y estilo |
| 10 | [Decisiones y preguntas abiertas](10-aspectos-adicionales.md) | Decisiones del negocio ya tomadas y lo que falta por definir |
| 11 | [Despliegue en SnapDeploy](11-despliegue-snapdeploy.md) | Cómo levantar el entorno de pruebas actual (un contenedor Docker + Neon) |

## Resumen de decisiones

- **Lanzamiento:** Villagarzón, Putumayo, con 2 operadores y 2 domiciliarios.
- **Modelo MVP:** el cliente pide de los menús que administra RapiChonta, un domiciliario verificado recibe la notificación y acepta, compra en el establecimiento y entrega. El cliente ve estados (no la ubicación del domiciliario), confirma la entrega y paga contra entrega. RapiChonta es intermediaria; los comercios no están integrados todavía.
- **Dinero:** caja diaria por domiciliario con trazabilidad, o domiciliario que compra con dinero propio; el domiciliario paga a RapiChonta un porcentaje de cada domicilio. Tarifas fijas por zona (barrios y veredas) configuradas en el panel.
- **Asignación:** el operador ve quién está cerca y envía el pedido a un domiciliario o a todos; el primero que acepta lo toma.
- **Idiomas:** español e inglés desde archivos JSON (web y app), con precios aproximados en USD/EUR.
- **Monorepo** con tres proyectos independientes: `api/`, `web/`, `app/`; un `Dockerfile` en la raíz despliega API y web juntas.
- **API:** NestJS + TypeScript, PostgreSQL 16 + PostGIS, Prisma.
- **Web:** Next.js + React + Tailwind CSS + Framer Motion + MapLibre.
- **App:** Flutter (Android, iOS, Huawei AppGallery y web desde un solo código).
- **Mapas:** OpenStreetMap / MapLibre, para no depender de Google (indispensable en Huawei) ni pagar por mapa cargado en el MVP.
- **Ramas:** `main` (producción), `develop` (integración y despliegue de pruebas en SnapDeploy), ramas `feature/*` hacia `develop`.

## Estado actual del código

La estructura base ya compila y funciona de punta a punta: la API expone `GET /api/health` y `GET /api/v1/establishments/nearby`, la web muestra el menú lateral con el mapa centrado en Villagarzón y los establecimientos cercanos, y la app Flutter tiene la misma pantalla con menú lateral (drawer en teléfono, fijo en tableta). El esquema de datos y la máquina de estados del pedido ya reflejan las decisiones del negocio.
