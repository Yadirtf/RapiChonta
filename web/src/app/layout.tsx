import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/presentation/auth/AuthProvider";
import { CartProvider } from "@/presentation/cart/CartProvider";
import "./globals.css";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
// Letra de los letreros (nombres de locales y precios): con carácter, como un aviso pintado a mano.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["600", "800"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: "RapiChonta", description: t("description") };
}

export const viewport: Viewport = { themeColor: "#14121F" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${font.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          <AuthProvider>
            <CartProvider>{children}</CartProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
