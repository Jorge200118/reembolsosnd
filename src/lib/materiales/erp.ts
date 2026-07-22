import { normalizarMateriales } from "@/lib/materiales/normalizar";
import type { Material } from "@/lib/materiales/tipos";

// Único lugar que sabe dónde vive censos-web y con qué llave se le habla. Es
// server-only: si esto llegara al navegador, la llave quedaría a la vista y
// además CORS lo bloquearía.

const TIMEOUT_MS = 5000;

export function erpConfigurado(): boolean {
  return Boolean(process.env.CENSOS_API_URL && process.env.CENSOS_API_KEY);
}

/**
 * Busca en el catálogo del ERP. Lanza si el ERP no contesta, va lento o
 * responde mal: quien llame decide qué hacer, porque no es lo mismo fallar
 * mientras alguien teclea que fallar al guardar una solicitud.
 */
export async function buscarEnErp(q: string, codEstab: number): Promise<Material[]> {
  const base = process.env.CENSOS_API_URL;
  const llave = process.env.CENSOS_API_KEY;
  if (!base || !llave) throw new Error("ERP no configurado");

  const url = `${base.replace(/\/$/, "")}/api/materiales?q=${encodeURIComponent(q)}&codEstab=${codEstab}`;
  const res = await fetch(url, {
    headers: { "x-api-key": llave, "ngrok-skip-browser-warning": "true" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ERP respondió ${res.status}`);
  const data = (await res.json()) as { materiales?: unknown };
  return normalizarMateriales(data.materiales);
}
