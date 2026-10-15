import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Idioma: 1) el que el usuario eligió (cookie), 2) el del navegador, 3) español.
 * Los textos viven en /messages/<idioma>.json; agregar un idioma es agregar un archivo.
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const fromBrowser = (await headers()).get("accept-language")?.slice(0, 2);
  const locale = isLocale(fromCookie) ? fromCookie : isLocale(fromBrowser) ? fromBrowser : DEFAULT_LOCALE;

  return {
    locale,
    timeZone: "America/Bogota",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
