import { supabase } from "@/lib/supabase/client";

export interface ReembolsoLite {
  id: string;
  nombre_beneficiario: string;
  concepto: string;
  fecha: string;
  monto: number;
  archivos?: unknown[] | null;
}

export interface EnviarACorteInput {
  reembolsosPendientes: ReembolsoLite[];
  numeroLote: string;      // solo dígitos, validado en la UI
  emailRemitente: string;  // sesion.email
  nombreRemitente: string; // sesion.nombre
  sucursalUsuario: string | null; // sesion.sucursal
}

export interface EnviarACorteResult {
  ok: boolean;
  numeroLoteCompleto?: string;
  actualizados?: number;
  error?: string;
}

// Valida que el número de lote sean solo dígitos (igual que el HTML viejo).
export function loteValido(lote: string): boolean {
  return /^\d+$/.test(lote.trim());
}

// numeroLoteCompleto = "${lote}-${PRIMER_NOMBRE_MAYUS}" (V4 L5240-5241)
export function numeroLoteCompleto(lote: string, nombreRemitente: string): string {
  const primerNombre = nombreRemitente.split(" ")[0]?.toUpperCase() ?? "";
  return `${lote.trim()}-${primerNombre}`;
}

// Manda el lote a corte: valida y cambia cada reembolso pendiente a 'en_corte'
// con su numero_lote. Ya NO se manda correo a Fernando: el lote aparece en su
// módulo de Autorizaciones.
export async function enviarACorte(input: EnviarACorteInput): Promise<EnviarACorteResult> {
  if (input.reembolsosPendientes.length === 0) {
    return { ok: false, error: "No hay comprobantes pendientes" };
  }
  if (!loteValido(input.numeroLote)) {
    return { ok: false, error: "El número de lote debe contener únicamente números" };
  }
  const loteCompleto = numeroLoteCompleto(input.numeroLote, input.nombreRemitente);

  // Ya NO se manda correo a Fernando: el lote aparece en su módulo de Autorizaciones.
  let actualizados = 0;
  for (const r of input.reembolsosPendientes) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "en_corte", numero_lote: loteCompleto })
      .eq("id", r.id);
    if (!error) actualizados++;
  }
  return { ok: true, numeroLoteCompleto: loteCompleto, actualizados };
}
