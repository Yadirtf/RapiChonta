# RapiChonta API

API REST de RapiChonta construida con **NestJS + TypeScript**, **PostgreSQL + PostGIS** y **Prisma**, organizada con arquitectura limpia por módulos.

## Estructura

```
src/
├── main.ts                     # Arranque: seguridad (helmet, CORS), validación, versionado /api/v1
├── app.module.ts
├── shared/                     # Código transversal
│   ├── domain/                 # Entity base, DomainError
│   └── infrastructure/         # Prisma, filtros de errores
└── modules/
    ├── health/                 # GET /api/health
    ├── establishments/         # Establecimientos cercanos (mapa)
    │   ├── domain/             # Entidades, value objects y puertos (interfaces). Sin dependencias externas.
    │   ├── application/        # Casos de uso. Dependen solo del dominio.
    │   ├── infrastructure/     # Adaptadores: Prisma/PostGIS, en memoria.
    │   └── presentation/       # Controladores HTTP y DTOs validados.
    └── orders/                 # Dominio del pedido y su máquina de estados (siguiente fase)
```

La regla de dependencia va siempre hacia adentro: `presentation → application → domain` e `infrastructure → domain`. El dominio no importa nada de NestJS, Prisma ni HTTP (salvo el decorador `@Injectable` en casos de uso, aceptado por pragmatismo).

## Desarrollo local

Requiere Node 24 LTS (24.9 o superior).

```bash
cp .env.example .env      # deja DATABASE_URL vacía para usar datos en memoria
npm install
npx prisma generate       # genera el cliente en src/generated/prisma (no se versiona)
npm run start:dev         # http://localhost:3000/api/health
```

Notas de versiones (NestJS 12, Prisma 7):

- NestJS 12 se publica solo como ESM. La API sigue compilando a CommonJS y Node carga Nest con `require(esm)`;
  Jest lo hace igual, por eso `npm test` corre con `--experimental-vm-modules` (necesita Node 24.9+).
- Prisma 7 lee la conexión de `prisma.config.ts` (CLI, con `.env` si existe) y el cliente se conecta con el
  adaptador `@prisma/adapter-pg` (`src/shared/infrastructure/prisma/prisma-adapter.ts`). Todo cliente nuevo se
  crea con `new PrismaClient({ adapter: prismaAdapter() })` e importa desde `src/generated/prisma/client`.

Con base de datos (PostgreSQL 15+ con PostGIS):

```bash
docker run -d --name rapichonta-db -p 5432:5432 \
  -e POSTGRES_USER=rapichonta -e POSTGRES_PASSWORD=rapichonta -e POSTGRES_DB=rapichonta \
  postgis/postgis:16-3.4
npm run prisma:deploy && npm run prisma:seed
```

## Endpoints actuales

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/health` | Estado del servicio |
| GET | `/api/v1/establishments/nearby?lat=&lng=&radius=&categories=FAST_FOOD,RESTAURANT` | Establecimientos cercanos ordenados por distancia |

## Pruebas

```bash
npm test
```
