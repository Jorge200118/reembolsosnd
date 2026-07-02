export interface Archivo {
  url: string;
  nombre: string;
  tipo?: string;
  path?: string;
}

export interface Evidencia {
  url: string;
  nombre: string;
  tipo?: string;
  path?: string;
  fecha_subida?: string;
  usuario_subida?: string;
}

function tieneUrl(x: unknown): x is { url: string } {
  return (
    typeof x === "object" &&
    x !== null &&
    "url" in x &&
    typeof (x as Record<string, unknown>).url === "string"
  );
}

/** evidencia_entrega es polimórfico: array | objeto suelto | null. Normaliza a array. */
export function normalizarEvidencia(raw: unknown): Evidencia[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter(tieneUrl) as Evidencia[];
}

/** archivos: array de objetos; filtra los que no tienen url. */
export function normalizarArchivos(raw: unknown): Archivo[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter(tieneUrl) as Archivo[];
}
