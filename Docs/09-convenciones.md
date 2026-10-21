# 09 · Convenciones de trabajo

## Ramas (Git Flow simplificado)

| Rama | Para qué | Se despliega en |
| --- | --- | --- |
| `main` | Lo que está en producción. Solo recibe merges desde `develop` (o `hotfix/*`). | Producción (cuando exista) |
| `develop` | Integración de lo terminado. | SnapDeploy (pruebas) |
| `feature/<número>-<tema>` | Una historia o tarea (por ejemplo `feature/34-carrito`), sale de `develop` y vuelve por PR. | — |
| `hotfix/<tema>` | Corrección urgente, sale de `main` y vuelve a `main` y `develop`. | — |

### Protección de `main` y `develop` (H05.3)

Las dos ramas solo cambian por PR con el CI en verde. La regla está versionada en [`.github/rulesets/proteger-main-y-develop.json`](../.github/rulesets/proteger-main-y-develop.json) y se aplica una vez, a mano, porque GitHub no la toma del repositorio:

1. En GitHub: **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
2. Elegir el archivo `.github/rulesets/proteger-main-y-develop.json` y guardar (queda **Active**).

Qué exige:

| Regla | Efecto |
| --- | --- |
| Pull request obligatorio | Nadie hace push directo a `main` ni a `develop`, tampoco el administrador |
| Conversaciones resueltas | No se integra un PR con comentarios de revisión abiertos |
| Check `CI` en verde | El trabajo "CI" de [`ci.yml`](../.github/workflows/ci.yml) resume API, web, app e imagen Docker. Es el único check requerido: los trabajos de carpetas que el PR no toca no corren y cuentan como aprobados |
| Sin force push ni borrado | El historial de las ramas no se reescribe |

Aprobaciones requeridas: **0** mientras haya un solo responsable (GitHub no deja aprobar el PR propio). Cuando entre una segunda persona, subir `required_approving_review_count` a 1 en el archivo y volver a importarlo (o editar la regla en GitHub).

Si una emergencia exige saltarse la regla, se pasa a **Disabled** en Settings → Rules y se reactiva al terminar; el cambio queda en el registro de auditoría de GitHub.

### CI (H05.1)

[`ci.yml`](../.github/workflows/ci.yml) corre en cada PR y en cada push a `develop` y `main`:

| Trabajo | Corre si cambia | Pasos |
| --- | --- | --- |
| API | `api/` | `npm ci`, `npm audit` (altas), `prisma generate`, lint, pruebas unitarias, migraciones + semilla y pruebas contra PostgreSQL/PostGIS, build |
| Web | `web/` | `npm ci`, `npm audit` (altas), lint, typecheck, build |
| App | `app/` | `flutter analyze`, `flutter test` |
| Imagen Docker | `Dockerfile`, `start.sh`, `.dockerignore` o los `package*.json` | Construye la imagen del contenedor único sin publicarla |

Las dependencias, la caché de Next.js, Flutter y las capas de Docker se guardan en caché entre ejecuciones. `npm audit` revisa solo dependencias de producción y falla con vulnerabilidades altas o críticas; Dependabot ([`dependabot.yml`](../.github/dependabot.yml)) abre cada lunes PR hacia `develop` con las actualizaciones de npm, pub, Docker y Actions (H05.2). Las versiones mayores que dependen unas de otras llegan en un solo PR (NestJS con TypeScript, Next con ESLint, Jest con ts-jest), y Node con `@types/node` se suben a mano, juntos y solo a versiones LTS, cambiando a la vez `Dockerfile`, `ci.yml` y `package.json`. Antes de fusionar un PR de Dependabot, su check **CI** debe estar en verde: si `npm ci` falla por dependencias pares (`ERESOLVE`), el PR se cierra y la actualización se planea junto con sus pares.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/es/) en español: `feat(api): crear pedido`, `fix(web): centrar mapa`, `docs: actualizar roadmap`, `chore(app): actualizar dependencias`. El alcance es `api`, `web`, `app` o `docs`.

## Pull requests

- Un PR por historia o tarea, pequeño y revisable, con `Closes #<número>` para que el flujo mueva el issue ([12 · Flujo de trabajo](12-flujo-de-trabajo.md)).
- Descripción con antes/después y cómo probarlo.
- Si cambia una decisión documentada, el PR actualiza `Docs/` en el mismo cambio.

## Código

- **TypeScript** en modo estricto. **Dart** con `flutter_lints`.
- Nombres de código en inglés (entidades, funciones, variables); textos visibles y documentación en español.
- Nada de lógica de negocio en controladores, componentes ni widgets: va en casos de uso y dominio.
- Cada caso de uso nuevo lleva su prueba unitaria. El dominio se prueba sin base de datos.

## Comandos rápidos

| Proyecto | Desarrollo | Verificación |
| --- | --- | --- |
| `api/` | `npm run start:dev` | `npm run lint && npm test && npm run build` |
| `web/` | `npm run dev` | `npm run lint && npm run typecheck && npm run build` |
| `app/` | `flutter run` | `flutter analyze && flutter test` |
