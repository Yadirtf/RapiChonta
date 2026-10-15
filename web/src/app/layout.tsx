import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "RapiChonta",
  description: "Pide comida rápida, mercado y lo que necesites. Nosotros lo compramos y te lo llevamos.",
};

export const viewport: Viewport = { themeColor: "#14121F" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={font.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
