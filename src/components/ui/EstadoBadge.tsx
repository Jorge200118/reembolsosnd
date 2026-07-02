import { labelEstado, type Estado } from "@devoluciones/domain";

// Paleta semántica por estado: fondo suave + texto/punto en el tono fuerte.
// Más legible y menos saturado que un pill sólido de color.
const ESTILO: Record<Estado, { bg: string; text: string; dot: string }> = {
  pendiente: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  en_corte: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  aprobado: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  rechazado: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  solicitado_entrega: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
  entregado: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-500" },
  comida_pendiente: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" },
};

export function EstadoBadge({ estado }: { estado: Estado }) {
  const e = ESTILO[estado] ?? ESTILO.pendiente;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${e.bg} ${e.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />
      {labelEstado(estado)}
    </span>
  );
}
