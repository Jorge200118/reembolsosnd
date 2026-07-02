"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/nav/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Cerrar el drawer con la tecla Escape.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-100 lg:overflow-x-visible">
      {/* Sidebar: drawer en móvil, fijo en desktop */}
      <Sidebar open={open} onClose={close} />

      {/* Overlay del drawer (solo móvil, solo cuando está abierto) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Columna de contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior — solo móvil */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-[#0F2942] px-4 text-slate-100 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-100 transition-colors hover:bg-white/10"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-black text-white shadow-sm">
              AC
            </div>
            <div className="text-sm font-bold tracking-tight">ACEROS CABOS</div>
          </div>
        </header>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
