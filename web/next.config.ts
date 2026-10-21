import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Servidor mínimo (.next/standalone) para la imagen Docker: menos memoria en el contenedor de 512 MB.
  output: "standalone",
  // Versión que Sentry asocia a cada error (H05.4); NEXT_PUBLIC_SENTRY_RELEASE la reemplaza.
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Contenedor único (Dockerfile raíz): la web reenvía /api/* a la API que corre en el mismo contenedor.
  // Se evalúa en el build; sin API_INTERNAL_URL (desarrollo, contenedores separados) no hay reenvío.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    return api ? [{ source: "/api/:path*", destination: `${api}/api/:path*` }] : [];
  },
};

export default withNextIntl(nextConfig);
