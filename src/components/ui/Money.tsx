import { formatMXN } from "@devoluciones/domain";

export function Money({ monto }: { monto: string }) {
  return <span className="tabular-nums">{formatMXN(monto)}</span>;
}
