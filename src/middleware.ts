import { NextResponse, type NextRequest } from "next/server";

// Protege las rutas de la app: si no hay cookie de sesión, redirige a /login.
// La cookie se llama rnd_sesion (ver session.ts).
export function middleware(req: NextRequest) {
  const tieneSesion = req.cookies.has("rnd_sesion");
  const esLogin = req.nextUrl.pathname.startsWith("/login");

  if (!tieneSesion && !esLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (tieneSesion && esLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Protege todo salvo assets estáticos, la API, y archivos de Next.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
