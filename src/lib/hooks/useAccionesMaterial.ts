import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Resultado {
  ok: boolean;
  error?: string;
  estado?: string;
  folio?: string;
}

async function postear(ruta: string, cuerpo: unknown): Promise<Resultado> {
  try {
    const res = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return (await res.json()) as Resultado;
  } catch {
    return { ok: false, error: "No se pudo conectar, intenta de nuevo" };
  }
}

function useAccion<T>(ruta: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T) => postear(ruta, v),
    onSuccess: (r) => {
      if (r.ok) void qc.invalidateQueries({ queryKey: ["materiales"] });
    },
  });
}

// Ninguna manda `usuario`: el nombre de quien actúa lo saca el servidor de la
// cookie firmada. Mandarlo desde aquí sería dejar que el cliente decida qué
// queda escrito en `autorizado_por` / `entregado_por`.

export function useAutorizarMaterial() {
  return useAccion<{ id: string }>("/api/materiales/autorizar");
}

export function useRechazarMaterial() {
  return useAccion<{ id: string; motivo?: string }>("/api/materiales/rechazar");
}

export function useEntregarMaterial() {
  return useAccion<{
    id: string;
    entregas: { lineaId: string; cantidadEntregada: number }[];
  }>("/api/materiales/entregar");
}
