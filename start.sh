#!/bin/bash
# Arranque del contenedor único (Dockerfile raíz): API interna + web pública.
# Si cualquiera de los dos procesos termina, el contenedor termina y la plataforma lo reinicia.
set -e

cd /app/api
if [ -n "$DATABASE_URL" ]; then
  npx prisma migrate deploy
  if [ "$SEED_DEMO_DATA" = "true" ]; then
    npm run prisma:seed
  fi
fi

# La API escucha solo en el puerto interno; PORT (público) es de la web.
PORT="$API_PORT" node dist/main.js &

cd /app/web
HOSTNAME=0.0.0.0 PORT="${PORT:-3000}" node server.js &

trap 'kill -TERM $(jobs -p) 2>/dev/null' TERM INT
wait -n
exit 1
