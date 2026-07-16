// Normaliza un nombre para comparar de forma estable: MAYUSCULAS, un solo espacio
// entre palabras, sin acentos combinables (rango U+0300-U+036F).
export function normalizarNombre(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
