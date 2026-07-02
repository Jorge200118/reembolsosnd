export type Fila = Record<string, unknown>;

export interface GrupoLote {
  lote: string;              // numero_lote o "SIN_LOTE"
  sucursal: string;          // del primer reembolso del grupo
  numeroSolicitud: string | null; // del primer reembolso (para solicitados)
  reembolsos: Fila[];
  total: number;             // suma de montos
}

// Agrupa filas por el campo dado (numero_lote típicamente). Las filas sin ese
// campo caen en "SIN_LOTE". Devuelve grupos ordenados desc por clave, con
// SIN_LOTE siempre al final. Idéntico al agrupamiento del HTML viejo.
export function agruparPorLote(filas: Fila[], campo: string): GrupoLote[] {
  const mapa = new Map<string, Fila[]>();
  for (const f of filas) {
    const raw = f[campo];
    const clave = raw == null || String(raw).trim() === "" || String(raw) === "N/A" ? "SIN_LOTE" : String(raw);
    const arr = mapa.get(clave) ?? [];
    arr.push(f);
    mapa.set(clave, arr);
  }
  const grupos: GrupoLote[] = [];
  for (const [lote, reembolsos] of mapa) {
    const primero = reembolsos[0] ?? {};
    grupos.push({
      lote,
      sucursal: primero.sucursal_usuario ? String(primero.sucursal_usuario) : "N/A",
      numeroSolicitud: primero.numero_solicitud ? String(primero.numero_solicitud) : null,
      reembolsos,
      total: reembolsos.reduce((s, r) => s + Number(r.monto ?? 0), 0),
    });
  }
  // Orden desc por clave; SIN_LOTE al final.
  grupos.sort((a, b) => {
    if (a.lote === "SIN_LOTE") return 1;
    if (b.lote === "SIN_LOTE") return -1;
    return b.lote.localeCompare(a.lote, "es", { numeric: true });
  });
  return grupos;
}
