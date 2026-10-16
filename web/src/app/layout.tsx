import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/presentation/auth/AuthProvider";
import "./globals.css";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: "RapiChonta", description: t("description") };
}

export const viewport: Viewport = { themeColor: "#14121F" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={font.variable}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
