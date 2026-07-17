const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface CrearComidaInput {
  empleadoId: number;
  quienAutoriza: string;
  usuarioRegistro?: string;
  sucursalUsuario?: string;
  fecha?: string; // "YYYY-MM-DD"; si se omite, la edge function usa hoy en Mazatlán
}

export interface CrearComidaResult {
  ok: boolean;
  comidaId?: string;
  beneficiario?: string;
  error?: string;
}

export async function crearComida(input: CrearComidaInput): Promise<CrearComidaResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/crear-comida`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      empleado_id: input.empleadoId,
      quien_autoriza: input.quienAutoriza,
      usuario_registro: input.usuarioRegistro,
      sucursal_usuario: input.sucursalUsuario,
      fecha: input.fecha,
    }),
  });
  const data = await res.json();
  return {
    ok: Boolean(data.ok),
    comidaId: data.comida_id,
    beneficiario: data.beneficiario,
    error: data.error,
  };
}
