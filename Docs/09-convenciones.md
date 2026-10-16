# 09 · Convenciones de trabajo

## Ramas (Git Flow simplificado)

| Rama | Para qué | Se despliega en |
| --- | --- | --- |
| `main` | Lo que está en producción. Solo recibe merges desde `develop` (o `hotfix/*`). | Producción (cuando exista) |
| `develop` | Integración de lo terminado. | SnapDeploy (pruebas) |
| `feature/<número>-<tema>` | Una historia o tarea (por ejemplo `feature/34-carrito`), sale de `develop` y vuelve por PR. | — |
| `hotfix/<tema>` | Corrección urgente, sale de `main` y vuelve a `main` y `develop`. | — |

Recomendado en GitHub: proteger `main` y `develop` (sin push directo, PR con al menos una aprobación y CI en verde).

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
