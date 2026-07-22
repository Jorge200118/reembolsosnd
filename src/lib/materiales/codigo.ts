// El código de entrega es una CADENA de 6 dígitos, nunca un número: se genera
// con lpad y puede empezar en cero (004729). Tratarlo como número lo rompe.

export const LARGO_CODIGO = 6;

/** Deja solo dígitos y corta al largo del código. Tolera pegar texto completo. */
export function soloDigitos(entrada: string): string {
  return entrada.replace(/\D/g, "").slice(0, LARGO_CODIGO);
}

export function esCodigoCompleto(codigo: string): boolean {
  return new RegExp(`^\\d{${LARGO_CODIGO}}$`).test(codigo);
}
