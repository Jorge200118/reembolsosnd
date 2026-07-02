import { formatMXN } from "@devoluciones/domain";

export function Money({ monto }: { monto: string }) {
  return <span className="tabular-nums font-medium text-slate-900">{formatMXN(monto)}</span>;
}
