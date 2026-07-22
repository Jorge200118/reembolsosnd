"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsDeRol, type TabId, type Rol } from "@devoluciones/domain";
import { useAuth } from "@/lib/auth/AuthContext";

const ETIQUETAS: Record<TabId, string> = {
  "nuevo-reembolso": "Nuevo Reembolso",
  "revision": "Revisión",
  "entregas": "Entregas",
  "reportes": "Reportes",
  "dashboard": "Dashboard",
  "comidas-gerente": "Comidas",
  "pago-comidas": "Pago Comidas",
  "autorizaciones": "Autorizaciones",
  "materiales-gerente": "Material",
  "materiales-almacen": "Almacén",
};

// Íconos SVG inline (stroke, 20px) — sin dependencias externas.
const ICONOS: Record<TabId, React.ReactNode> = {
  "dashboard": (
    <path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  ),
  "nuevo-reembolso": (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  "revision": (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  "entregas": (
    <>
      <path d="M16 3h5v5" />
      <path d="M21 3l-7 7" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </>
  ),
  "reportes": (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </>
  ),
  "comidas-gerente": (
    <>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <path d="M6 1v3M10 1v3M14 1v3" />
    </>
  ),
  "pago-comidas": (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  "autorizaciones": (
    <>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  "materiales-gerente": (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </>
  ),
  "materiales-almacen": (
    <>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M3 21h18" />
    </>
  ),
};

// Solo estas rutas existen hoy; las demás del rol se muestran deshabilitadas.
const RUTAS_EXISTENTES: Set<TabId> = new Set(["dashboard", "revision", "reportes", "comidas-gerente", "pago-comidas", "nuevo-reembolso", "entregas", "autorizaciones"]);

function Icono({ tab }: { tab: TabId }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {ICONOS[tab]}
    </svg>
  );
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { sesion, montado, logout } = useAuth();
  const pathname = usePathname();
  // Hasta que monte en el cliente, no hay sesión (la cookie no se lee en SSR).
  // Renderizar null en ambos lados evita el hydration mismatch.
  if (!montado || !sesion) return null;

  const tabs = tabsDeRol(sesion.rol as Rol);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 transform flex-col bg-[#0F2942] text-slate-100 transition-transform duration-300 ${
        open ? "translate-x-0" : "-translate-x-full"
      } lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:transition-none`}
    >
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-black text-white shadow-sm">
          AC
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">ACEROS CABOS</div>
          <div className="text-[11px] font-medium text-blue-200/70">Reembolsos</div>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {tabs.map((t) => {
          const existe = RUTAS_EXISTENTES.has(t);
          const activo = pathname === `/${t}`;
          if (!existe) {
            return (
              <span
                key={t}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500"
                title="Próximamente"
              >
                <Icono tab={t} />
                <span className="flex-1">{ETIQUETAS[t]}</span>
                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">pronto</span>
              </span>
            );
          }
          return (
            <Link
              key={t}
              href={`/${t}`}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                activo
                  ? "bg-blue-600 font-semibold text-white shadow-sm"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icono tab={t} />
              <span>{ETIQUETAS[t]}</span>
            </Link>
          );
        })}
      </nav>

      {/* Usuario + salir */}
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-200">
            {iniciales(sesion.nombre)}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium text-white">{sesion.nombre}</div>
            <div className="text-[11px] uppercase tracking-wide text-blue-200/60">{sesion.rol}</div>
          </div>
        </div>
        <button
          onClick={() => {
            onClose?.();
            logout();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5M21 12H9" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
