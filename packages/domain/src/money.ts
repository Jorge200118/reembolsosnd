/** Convierte un decimal-string a centavos (bigint), sin usar float. */
function aCentavos(s: string): bigint {
  const limpio = s.trim().replace(/[$,\s]/g, "");
  const neg = limpio.startsWith("-");
  const sinSigno = neg ? limpio.slice(1) : limpio;
  const [entero, frac = ""] = sinSigno.split(".");
  const fracPad = (frac + "00").slice(0, 2);
  const centavos = BigInt(entero || "0") * 100n + BigInt(fracPad || "0");
  return neg ? -centavos : centavos;
}

/** Convierte centavos (bigint) a decimal-string con 2 decimales. */
function deCentavos(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  const entero = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${entero.toString()}.${frac}`;
}

/** Suma una lista de decimal-strings y devuelve decimal-string con 2 decimales. */
export function sumar(montos: string[]): string {
  const total = montos.reduce((acc, m) => acc + aCentavos(m), 0n);
  return deCentavos(total);
}

/** Formatea un decimal-string a "$1,234.50" (MXN). */
export function formatMXN(monto: string): string {
  const c = aCentavos(monto);
  const s = deCentavos(c);
  const [entero = "0", frac = "00"] = s.split(".");
  const neg = entero.startsWith("-");
  const enteroAbs = neg ? entero.slice(1) : entero;
  const conComas = enteroAbs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${conComas}.${frac}`;
}

/** Normaliza un valor de monto (que supabase-js entrega como number) a string seguro. */
export function parseMonto(v: number | string): string {
  return typeof v === "number" ? String(v) : v.trim();
}
