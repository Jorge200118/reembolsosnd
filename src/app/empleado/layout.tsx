import type { Metadata, Viewport } from "next";
import { fraunces, workSans } from "@/lib/empleado/tema";
import { ToastProvider } from "@/components/empleado/Toast";
import { InstallPrompt } from "@/components/empleado/InstallPrompt";
import { RegistrarSW } from "@/components/empleado/RegistrarSW";
import "./carnet.css";

export const metadata: Metadata = {
  title: "Vales AC — Aceros del Pacífico",
  manifest: "/empleado.webmanifest",
  appleWebApp: { capable: true, title: "Vales AC", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f2942",
};

export default function EmpleadoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} ${workSans.variable} carnet`}>
      <ToastProvider>
        <div className="carnet-wrap">
          <InstallPrompt />
          {children}
        </div>
      </ToastProvider>
      <RegistrarSW />
    </div>
  );
}
