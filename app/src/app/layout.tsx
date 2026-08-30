import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { AvisoSinConexion } from "@/components/system/AvisoSinConexion";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Kaudal",
  description: "La capa que convierte tu agente de IA en un servicio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ToastProvider>
          <AvisoSinConexion />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
