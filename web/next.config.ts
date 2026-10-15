import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Servidor mínimo (.next/standalone) para la imagen Docker: menos memoria en el contenedor de 512 MB.
  output: "standalone",
};

export default withNextIntl(nextConfig);
