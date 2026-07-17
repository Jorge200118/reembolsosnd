// Helpers puros del motor de push (sin dependencias) para poder testearlos con vitest.
export type Tipo = "codigo_listo" | "comida_nueva" | "recordatorio";
export interface SubRow { empleado_id: number; endpoint: string; p256dh: string; auth: string; monto?: number; }

export function fmtMonto(m: unknown): string { return Number(m ?? 0).toLocaleString("es-MX"); }

// Tag/topic RFC 8030: <=32 chars, base64url. Colapsa por (tipo, chofer).
export function topicCorto(tipo: Tipo, empleadoId: number): string {
  const t = { codigo_listo: "cl", comida_nueva: "cn", recordatorio: "rc" }[tipo];
  return `${t}-${empleadoId}`;
}

export function mensaje(tipo: Tipo, row: SubRow): { title: string; body: string; url: string; tag: string } {
  const tag = topicCorto(tipo, row.empleado_id);
  switch (tipo) {
    case "codigo_listo":
      return { title: "Vales AC", body: "Ya está tu código de comida de hoy.", url: "/empleado", tag };
    case "comida_nueva":
      return { title: "Vales AC", body: `Se te acumuló una comida, ya son $${fmtMonto(row.monto)}.`, url: "/empleado", tag };
    case "recordatorio":
      return { title: "Vales AC", body: "Aún no usas tu código de hoy, cóbralo antes de que cierre el comedor.", url: "/empleado", tag };
  }
}
