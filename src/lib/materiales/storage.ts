// Server-only: toca el bucket privado con service_role. El navegador nunca
// habla con storage — manda el archivo a nuestro route handler, que verifica
// rol y sucursal antes de subir. Así el bucket se queda sin políticas y cerrado.

const BUCKET = "rnd-uso-interno";

function credenciales(): { url: string; servicio: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && servicio ? { url, servicio } : null;
}

/** Sube la foto y devuelve su ruta dentro del bucket. Lanza si no se pudo. */
export async function subirEvidencia(
  solicitudId: string,
  archivo: Blob,
  nombre: string,
): Promise<string> {
  const c = credenciales();
  if (!c) throw new Error("Falta configuración del servidor");

  // El nombre lo manda el cliente: se sanea para que no pueda salirse de su
  // carpeta ni meter caracteres raros en la ruta.
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "foto.jpg";
  const ruta = `entregas/${solicitudId}/${Date.now()}_${limpio}`;

  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: {
      apikey: c.servicio,
      Authorization: `Bearer ${c.servicio}`,
      "Content-Type": archivo.type || "image/jpeg",
    },
    body: archivo,
  });
  if (!res.ok) {
    throw new Error(`storage ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return ruta;
}

/** URL temporal para ver la foto. Caduca; no se guarda en ningún lado. */
export async function urlFirmada(ruta: string, segundos = 300): Promise<string | null> {
  const c = credenciales();
  if (!c) return null;
  const res = await fetch(`${c.url}/storage/v1/object/sign/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: {
      apikey: c.servicio,
      Authorization: `Bearer ${c.servicio}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: segundos }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string };
  return data.signedURL ? `${c.url}/storage/v1${data.signedURL}` : null;
}
