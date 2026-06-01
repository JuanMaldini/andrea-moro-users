import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andrea Moro · Cursos",
  description: "Plataforma de cursos de Andrea Moro",
};

// Bloquea el pinch-zoom del navegador en iOS.
// user-scalable=no es ignorado en Safari desde iOS 10 en accesibilidad,
// pero maximum-scale=1 sí funciona en la mayoría de casos.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
