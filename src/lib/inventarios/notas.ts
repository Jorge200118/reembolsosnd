// El texto que se escribe en `notas` de la cabecera del folio de BMS
// (`movimientos_internos`). Es lo único que le dice a quien abre el movimiento
// en el ERP para qué salió el material.

/** `movimientos_internos.notas` es varchar(400) NOT NULL. Verificado contra BMSCabos. */
const MAX = 400;
const SEP = " · ";

/** Lo que se le cuelga al final cuando no cupieron todos los motivos. */
function cola(restantes: number): string {
  return restantes > 0 ? `${SEP}… +${restantes} más` : "";
}

export interface PartidaConMotivo {
  folioSolicitud: string;
  motivo: string;
}

/**
 * Los motivos de las solicitudes que alimentan un folio de BMS, en un solo
 * renglón y sin pasarse de 400 caracteres.
 *
 * Dos cosas que no son obvias:
 *
 * 1. **Se agrupa por solicitud, no por partida.** Un folio trae varias partidas
 *    de la misma solicitud y todas comparten motivo; sin agrupar, el mismo texto
 *    saldría repetido tantas veces como productos pidieron.
 * 2. **Nunca se devuelve algo más largo que el campo.** Si se pasara, SQL Server
 *    truncaría o reventaría el INSERT, y eso tumbaría un folio que ya movió
 *    inventario. Cuando no caben todos, se corta y se dice cuántos faltaron:
 *    quien lo lea sabe que hay más, en vez de creer que eso era todo.
 */
export function notasParaBms(partidas: readonly PartidaConMotivo[]): string {
  const porSolicitud = new Map<string, string>();
  for (const p of partidas) {
    if (porSolicitud.has(p.folioSolicitud)) continue;
    // Los saltos de línea del textarea se aplanan: el campo de BMS es de un
    // solo renglón y un \n ahí se ve como basura.
    const motivo = String(p.motivo ?? "").replace(/\s+/g, " ").trim();
    if (motivo) porSolicitud.set(p.folioSolicitud, motivo);
  }

  const motivos = [...porSolicitud.values()];
  if (motivos.length === 0) return "";

  const completo = motivos.join(SEP);
  if (completo.length <= MAX) return completo;

  const cabidos: string[] = [];
  for (let i = 0; i < motivos.length; i++) {
    const conEste = [...cabidos, motivos[i]!].join(SEP);
    if (conEste.length + cola(motivos.length - i - 1).length > MAX) break;
    cabidos.push(motivos[i]!);
  }

  // Ni el primero cabe entero. Se corta a la fuerza: medio motivo dice más que
  // un campo vacío.
  if (cabidos.length === 0) {
    const fin = cola(motivos.length - 1);
    return motivos[0]!.slice(0, MAX - fin.length).trimEnd() + fin;
  }

  return cabidos.join(SEP) + cola(motivos.length - cabidos.length);
}
