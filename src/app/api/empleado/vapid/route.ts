import { NextResponse } from "next/server";

// La llave PÚBLICA de VAPID es pública por diseño: se le entrega al navegador al
// suscribir. El service worker la pide aquí para re-suscribir tras una rotación,
// porque un archivo estático (sw-empleado.js) no puede leer las env de Next.
// No expone nada sensible: la privada vive solo en el Vault del servidor.
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  if (!publicKey) return NextResponse.json({ ok: false }, { status: 503 });
  return NextResponse.json({ publicKey });
}
