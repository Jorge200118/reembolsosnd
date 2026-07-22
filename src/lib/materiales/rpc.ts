// Único lugar del módulo que toca la llave de servicio. Las RPCs `material_*`
// tienen `execute` revocado a anon y authenticated (migración 0021), así que
// esta es la única forma de escribir; nunca se debe llamar desde el navegador.

export interface RespuestaRpc {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

export async function llamarRpcMaterial(
  nombre: string,
  args: Record<string, unknown>,
): Promise<RespuestaRpc> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio) {
    return { ok: false, error: "Falta configuración del servidor (SUPABASE_SERVICE_ROLE_KEY)" };
  }
  const res = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: servicio,
      Authorization: `Bearer ${servicio}`,
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    console.error(`[material] RPC ${nombre} falló (${res.status}): ${detalle}`);
    return { ok: false, error: "No se pudo completar la operación" };
  }
  // Las RPCs devuelven jsonb {ok, ...}; PostgREST lo entrega tal cual.
  return (await res.json()) as RespuestaRpc;
}

/** Lectura con service_role (salta RLS). Devuelve el JSON crudo de PostgREST. */
export async function leerTablaMaterial(consulta: string): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio) throw new Error("Falta configuración del servidor");
  const res = await fetch(`${url}/rest/v1/${consulta}`, {
    headers: { apikey: servicio, Authorization: `Bearer ${servicio}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}
