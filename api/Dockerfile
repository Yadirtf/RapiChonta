# Imagen de la API para SnapDeploy (o cualquier plataforma de contenedores).
# Guía: Docs/08-despliegue-render.md
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Prisma necesita OpenSSL para elegir y ejecutar su motor de consultas.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Se conservan las dependencias de desarrollo: la CLI de Prisma aplica las migraciones
# al arrancar el contenedor (la semilla ya está compilada en dist/).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json tsconfig.json prisma.config.ts docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
USER node
# SnapDeploy detecta el puerto por EXPOSE e inyecta PORT; main.ts lo lee.
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
