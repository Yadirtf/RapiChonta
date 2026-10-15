# Contenedor único con la API (NestJS) y la web (Next.js) para SnapDeploy.
# La web atiende el puerto público y reenvía /api/* a la API en 127.0.0.1:4000.
# Guía: Docs/11-despliegue-snapdeploy.md

FROM node:22-bookworm-slim AS base
# Prisma necesita OpenSSL para su motor de consultas.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS api
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --include=dev
COPY api/ ./
RUN npx prisma generate && npm run build

FROM base AS web
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

FROM base
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_PORT=4000 \
    TRUST_PROXY=2
# API: se conservan las dependencias de desarrollo (CLI de Prisma para migrar, ts-node para el seed).
COPY --from=api /app/api/node_modules ./api/node_modules
COPY --from=api /app/api/dist ./api/dist
COPY --from=api /app/api/prisma ./api/prisma
COPY api/package.json api/tsconfig.json ./api/
# Web: servidor standalone de Next.js.
COPY --from=web /app/web/.next/standalone ./web
COPY --from=web /app/web/.next/static ./web/.next/static
COPY start.sh ./
RUN chmod +x start.sh
USER node
EXPOSE 3000
CMD ["./start.sh"]
