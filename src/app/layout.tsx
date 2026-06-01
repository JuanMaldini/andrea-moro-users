import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andrea Moro · Cursos",
  description: "Plataforma de cursos de Andrea Moro",
};

// El zoom involuntario en iOS al hacer focus en inputs se evita con
// font-size ≥ 16px en los campos (ya es el caso con text-base / text-sm).
// No bloqueamos el zoom del usuario — es necesario para accesibilidad.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
