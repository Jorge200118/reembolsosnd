import { NextResponse, type NextRequest } from "next/server";
import {
  ROL_TABS,
  normalizarRol,
  tabsDeRol,
  type Rol,
  type TabId,
} from "@devoluciones/domain";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

// Protege las rutas de la app. Dos capas:
//  1) Autenticación: si no hay cookie de sesión válida, redirige a /login.
//  2) Autorización por rol: si el usuario pide un tab que su rol no permite,
//     lo rebota a su primer tab permitido. El Sidebar oculta tabs por rol, pero
//     eso no basta: sin esto cualquier usuario logueado podía abrir /pago-comidas
//     (u otra ruta) escribiendo la URL a mano.
// La cookie se llama rnd_sesion (ver lib/auth/session.ts): su valor es
// encodeURIComponent(JSON.stringify({ email, nombre, rol, rolCrudo, sucursal })).
// El módulo es TS puro (sin APIs de Node), compatible con el runtime Edge.

// Conjunto de todos los TabId conocidos, derivado de ROL_TABS para no
// hardcodear la lista (se mantiene en sync con roles.ts automáticamente).
const TABS_CONOCIDOS = new Set<string>(
  Object.values(ROL_TABS).flat(),
);

function leerRol(req: NextRequest): Rol | null {
  const cookie = req.cookies.get("rnd_sesion")?.value;
  if (!cookie) return null;
  try {
    const sesion = JSON.parse(decodeURIComponent(cookie)) as { rol?: unknown };
    // rol ya viene normalizado en la cookie, pero re-normalizamos por defensa
    // (cookie manipulable). normalizarRol cae a caja_chica ante valores raros.
    if (typeof sesion.rol !== "string") return null;
    return normalizarRol(sesion.rol);
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // --- Mundo EMPLEADO: rutas /empleado con sesión emp_sesion firmada (HMAC) ---
  // Independiente del mundo de personal. Las públicas (login/registro) no se custodian.
  if (path.startsWith("/empleado")) {
    const esPublica =
      path.startsWith("/empleado/login") || path.startsWith("/empleado/registro");
    const token = req.cookies.get(NOMBRE_COOKIE_EMP)?.value;
    const secret = process.env.EMP_SESION_SECRET ?? "";
    const sesion = token && secret ? await verificarEmpSesion(token, secret) : null;
    if (!sesion && !esPublica) {
      const url = req.nextUrl.clone();
      url.pathname = "/empleado/login";
      return NextResponse.redirect(url);
    }
    if (sesion && esPublica) {
      const url = req.nextUrl.clone();
      url.pathname = "/empleado";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // --- Mundo PERSONAL (lógica existente, sin cambios) ---
  const rol = leerRol(req);
  const tieneSesion = rol !== null;
  const esLogin = req.nextUrl.pathname.startsWith("/login");

  // 1) Sin sesión (o cookie corrupta) fuera de /login -> a login.
  if (!tieneSesion && !esLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // Con sesión en /login -> al dashboard.
  if (tieneSesion && esLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // 2) Autorización por rol. Solo aplica cuando hay sesión y no estamos en /login.
  if (tieneSesion && !esLogin) {
    // Primer segmento: "/pago-comidas/algo" -> "pago-comidas". "/" -> "".
    const segmento = req.nextUrl.pathname.split("/")[1] ?? "";
    // Solo custodiamos tabs conocidos con scope de rol. El root ("") y cualquier
    // ruta que no sea un TabId (p. ej. /perfil) pasan sin tocar.
    if (TABS_CONOCIDOS.has(segmento)) {
      const permitidos = tabsDeRol(rol);
      if (!permitidos.includes(segmento as TabId)) {
        const url = req.nextUrl.clone();
        // Rebota al primer tab permitido de su rol.
        url.pathname = `/${permitidos[0]}`;
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Protege todo salvo assets estáticos, la API, y archivos de Next.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
