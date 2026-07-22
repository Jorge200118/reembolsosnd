import { leerTablaMaterial } from "@/lib/materiales/rpc";

type TipoAviso = "material_autorizada" | "material_rechazada" | "material_entregada";

/**
 * Avisa al empleado dueño de la solicitud. Es best-effort: si falla, se loguea
 * y ya. El aviso es secundario; la solicitud ya quedó registrada y no se debe
 * revertir ni fallar la petición del gerente por un push que no salió.
 */
export async function avisarEmpleado(solicitudId: string, tipo: TipoAviso): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !servicio) return;

    const filas = (await leerTablaMaterial(
      `rnd_material_solicitudes?id=eq.${solicitudId}&select=empleado_id`,
    )) as Array<{ empleado_id?: number }>;
    const empleadoId = filas?.[0]?.empleado_id;
    if (!empleadoId) return;

    await fetch(`${url}/functions/v1/enviar-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${servicio}` },
      body: JSON.stringify({ tipo, empleado_id: empleadoId }),
    });
  } catch (e) {
    console.error("[material] no se pudo avisar al empleado:", e);
  }
}
