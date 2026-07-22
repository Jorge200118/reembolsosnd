"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Navegación entre módulos de la app de empleados. Vales fue el módulo #1 y
// material el #2; cuando lleguen más, se agregan aquí y aparecen en todas las
// pantallas sin tocar ninguna.
//
// Va abajo y no arriba porque los choferes la usan con una mano, en el celular:
// el pulgar llega al borde inferior, no a la esquina superior.

// Pantallas sin sesión: no hay a dónde navegar todavía.
const PUBLICAS = ["/empleado/login", "/empleado/registro", "/empleado/reset"];

const DESTINOS = [
  {
    href: "/empleado",
    etiqueta: "Vales",
    icono: <path d="M5 3v7a2 2 0 0 0 4 0V3M7 10v11M17 3c-1.5 0-3 1.5-3 5s1.5 4 3 4v9" />,
  },
  {
    href: "/empleado/materiales",
    etiqueta: "Uso interno",
    icono: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.3 7L12 12l8.7-5M12 22V12" />
      </>
    ),
  },
];

export function BarraInferior() {
  const pathname = usePathname() ?? "";
  if (PUBLICAS.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* La barra flota, así que este hueco evita que tape el último elemento. */}
      <div className="carnet-barra-espacio" aria-hidden="true" />
      <nav className="carnet-barra" aria-label="Secciones">
        {DESTINOS.map((d) => {
          // "/empleado" es prefijo de todo lo demás, así que se compara exacto.
          const activo = d.href === "/empleado" ? pathname === "/empleado" : pathname.startsWith(d.href);
          return (
            <Link
              key={d.href}
              href={d.href}
              className={`carnet-barra-item${activo ? " activo" : ""}`}
              aria-current={activo ? "page" : undefined}
            >
              <svg
                width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                {d.icono}
              </svg>
              <span>{d.etiqueta}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
