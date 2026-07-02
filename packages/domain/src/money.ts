/** Error de dominio para montos que no tienen una forma decimal válida. */
export class MontoInvalidoError extends Error {
  constructor(public readonly valor: string) {
    super(`Monto inválido: "${valor}"`);
    this.name = "MontoInvalidoError";
  }
}

/**
 * Convierte un decimal-string a centavos (bigint), sin usar float.
 * Valida la forma con regex estricta y redondea half-up al 2º decimal.
 * Lanza MontoInvalidoError si el input no es un decimal válido.
 */
function aCentavos(s: string): bigint {
  const limpio = s.trim().replace(/[$,\s]/g, "");
  // Solo se acepta un decimal con signo opcional: -?123 ó -?123.456
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) {
    throw new MontoInvalidoError(s);
  }
  const neg = limpio.startsWith("-");
  const sinSigno = neg ? limpio.slice(1) : limpio;
  const [entero = "", frac = ""] = sinSigno.split(".");

  // Centavos "truncados" (2 primeros dígitos fraccionarios).
  const fracPad = (frac + "00").slice(0, 2);
  let centavos = BigInt(entero || "0") * 100n + BigInt(fracPad);

  // Redondeo half-up mirando el 3er dígito fraccionario.
  const tercerDigito = frac.charCodeAt(2) - 48; // NaN<0 si no existe → no redondea
  if (tercerDigito >= 5) {
    centavos += 1n;
  }

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

/**
 * Normaliza un valor de monto (que supabase-js entrega como number) a string seguro.
 * Evita la notación científica (ej. 1e21) que rompería a BigInt, y no aplica
 * redondeo aquí (el half-up final vive en aCentavos).
 */
export function parseMonto(v: number | string): string {
  if (typeof v === "string") return v.trim();
  if (!Number.isFinite(v)) throw new MontoInvalidoError(String(v));
  return sinExponente(v);
}

/** Representa un number como decimal-string plano (sin notación científica). */
function sinExponente(v: number): string {
  const s = String(v);
  if (!/[eE]/.test(s)) return s;

  const neg = s.startsWith("-");
  // Quitar solo el signo inicial (no el del exponente, ej. "1e-7").
  const sinSigno = neg ? s.slice(1) : s;
  const [mantisa = "0", expStr = "0"] = sinSigno.split(/[eE]/);
  const exp = Number(expStr);
  const [ent = "0", frac = ""] = mantisa.split(".");
  const digitos = ent + frac;
  // Posición del punto decimal contando desde el inicio de `digitos`.
  const punto = ent.length + exp;

  let out: string;
  if (punto <= 0) {
    out = "0." + "0".repeat(-punto) + digitos;
  } else if (punto >= digitos.length) {
    out = digitos + "0".repeat(punto - digitos.length);
  } else {
    out = digitos.slice(0, punto) + "." + digitos.slice(punto);
  }
  return neg ? "-" + out : out;
}
