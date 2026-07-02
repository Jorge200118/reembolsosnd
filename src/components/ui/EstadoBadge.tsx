import { labelEstado, COLOR_ESTADO, type Estado } from "@devoluciones/domain";

export function EstadoBadge({ estado }: { estado: Estado }) {
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white"
      style={{ backgroundColor: COLOR_ESTADO[estado] }}
    >
      {labelEstado(estado)}
    </span>
  );
}
