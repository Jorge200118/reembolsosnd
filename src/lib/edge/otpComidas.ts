const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type ResultadoOtp =
  | "ok" | "no_encontrado" | "expirado" | "ya_usado"
  | "sin_intentos" | "codigo_incorrecto";

export interface ValidarOtpInput {
  empleadoId: number;
  codigo: string;
  cajeraEmail: string;
}

export async function validarOtpComidas(
  input: ValidarOtpInput,
): Promise<{ ok: boolean; resultado: ResultadoOtp }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/validar-otp-comidas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({
      empleado_id: input.empleadoId,
      codigo: input.codigo,
      cajera_email: input.cajeraEmail,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return { ok: Boolean(data.ok), resultado: data.resultado as ResultadoOtp };
}
