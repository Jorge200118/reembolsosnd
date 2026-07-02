import { supabase } from "@/lib/supabase/client";
import type { Estado } from "@devoluciones/domain";

export interface FiltrosReembolso {
  estado?: Estado;
  sucursal?: string;
  usuarioRegistro?: string; // para forzar el filtro de caja_chica server-side
  beneficiario?: string;
  lote?: string;
  page: number;
  pageSize: number;
}

export interface PaginaReembolsos {
  rows: Array<Record<string, unknown>>;
  total: number;
}

// Tipo laxo para el builder de Supabase: sus generics precisos (que varían por
// tabla y por overload de .select) son dolorosos de reproducir aquí. Nos basta
// con exponer los métodos de filtrado que encadenamos; el retorno exacto de
// listarReembolsos se mantiene porque el helper es genérico sobre el builder
// concreto que recibe y lo devuelve tal cual.
interface FiltrableQuery {
  eq(column: string, value: unknown): this;
  ilike(column: string, pattern: string): this;
}

// Aplica los filtros (WHERE) compartidos por las consultas de reembolsos.
// Solo lectura: nunca inserta ni modifica filas.
function aplicarFiltros<Q extends FiltrableQuery>(
  q: Q,
  f: Omit<FiltrosReembolso, "page" | "pageSize">
): Q {
  if (f.estado) q = q.eq("estado", f.estado);
  if (f.sucursal) q = q.eq("sucursal_usuario", f.sucursal);
  if (f.usuarioRegistro) q = q.eq("usuario_registro", f.usuarioRegistro);
  if (f.beneficiario && f.beneficiario.trim())
    q = q.ilike("nombre_beneficiario", `%${f.beneficiario.trim()}%`);
  if (f.lote && f.lote.trim())
    q = q.ilike("numero_lote", `%${f.lote.trim()}%`);
  return q;
}

// NOTA: el monto se devuelve tal cual viene de la fila; NUNCA se suma aquí en JS.
// El formateo a dinero se hace en la capa de UI con parseMonto/Money del dominio,
// que convierte el numeric a string de forma segura (sin errores de float ni
// notación científica). No hagas aritmética con el monto en esta capa.
export async function listarReembolsos(
  f: FiltrosReembolso
): Promise<PaginaReembolsos> {
  const desde = f.page * f.pageSize;
  const hasta = desde + f.pageSize - 1;

  let q = supabase
    .from("rnd_reembolsos")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(desde, hasta);

  q = aplicarFiltros(q, f);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

// Devuelve TODAS las filas que cumplen los filtros, sin paginar. Supabase limita
// un único select a 1000 filas por defecto, así que iteramos con .range() en
// bloques hasta que un bloque devuelva menos filas que el tamaño de bloque.
// Solo lectura: no suma montos, solo acumula y devuelve las filas.
export async function listarTodosReembolsos(
  f: Omit<FiltrosReembolso, "page" | "pageSize">
): Promise<Array<Record<string, unknown>>> {
  const chunkSize = 1000;
  const filas: Array<Record<string, unknown>> = [];
  let desde = 0;

  // Guarda contra bucles infinitos: paramos cuando un bloque devuelve 0 filas
  // o menos de chunkSize (última página).
  for (;;) {
    const hasta = desde + chunkSize - 1;

    let q = supabase
      .from("rnd_reembolsos")
      .select("*")
      .order("created_at", { ascending: false })
      .range(desde, hasta);

    q = aplicarFiltros(q, f);

    const { data, error } = await q;
    if (error) throw error;

    const bloque = data ?? [];
    filas.push(...bloque);

    if (bloque.length < chunkSize) break;
    desde += chunkSize;
  }

  return filas;
}
