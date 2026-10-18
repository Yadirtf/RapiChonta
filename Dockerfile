# Contenedor único con la API (NestJS) y la web (Next.js) para SnapDeploy.
# La web atiende el puerto público y reenvía /api/* a la API en 127.0.0.1:4000.
# Guía: Docs/11-despliegue-snapdeploy.md

# Dos etapas en total: el plan gratuito (Small) de SnapDeploy no acepta más.

# 1) Build: compila la API y la web en la misma etapa.
FROM node:22-bookworm-slim AS build
# Prisma necesita OpenSSL para generar el cliente con el motor correcto.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --include=dev
COPY api/ ./
RUN npx prisma generate && npm run build

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --include=dev
COPY web/ ./
# La web llama a la API en su mismo dominio; NEXT_PUBLIC_API_URL solo se cambia para apuntar a otra API.
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MAP_STYLE_URL=$NEXT_PUBLIC_MAP_STYLE_URL \
    API_INTERNAL_URL=http://127.0.0.1:4000 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2) Runtime: solo lo necesario para ejecutar.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_PORT=4000 \
    TRUST_PROXY=2
# API: se conservan las dependencias de desarrollo (CLI de Prisma para migrar; la semilla va compilada en dist/).
COPY --from=build /app/api/node_modules ./api/node_modules
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/prisma ./api/prisma
COPY api/package.json api/tsconfig.json ./api/
# Web: servidor standalone de Next.js.
COPY --from=build /app/web/.next/standalone ./web
COPY --from=build /app/web/.next/static ./web/.next/static
# El modo standalone no incluye public/: sin esta línea no se sirven las imágenes de marca.
COPY --from=build /app/web/public ./web/public
COPY start.sh ./
RUN chmod +x start.sh
USER node
EXPOSE 3000
CMD ["./start.sh"]
