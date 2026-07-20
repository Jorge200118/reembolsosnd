"use client";
import { useQuery } from "@tanstack/react-query";
import { comidasPendientesPorChofer } from "@/lib/supabase/queries/comidasPendientes";

export function useComidasPendientes(sucursal?: string | null) {
  return useQuery({
    queryKey: ["comidas-pendientes", sucursal ?? null],
    queryFn: () => comidasPendientesPorChofer(sucursal),
  });
}
