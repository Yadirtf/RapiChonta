#!/bin/sh
# Arranque del contenedor de la API.
# Con DATABASE_URL: aplica migraciones (incluye CREATE EXTENSION postgis) y, si SEED_DEMO_DATA=true,
# carga los datos de ejemplo (solo si la tabla está vacía). Sin DATABASE_URL la API usa datos en memoria.
set -e

if [ -n "$DATABASE_URL" ]; then
  npx prisma migrate deploy
  if [ "$SEED_DEMO_DATA" = "true" ]; then
    npm run prisma:seed
  fi
fi

exec node dist/main.js
