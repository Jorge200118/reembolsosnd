"use client";
import { useQuery } from "@tanstack/react-query";
import { comidasPendientesPorChofer } from "@/lib/supabase/queries/comidasPendientes";

export function useComidasPendientes() {
  return useQuery({
    queryKey: ["comidas-pendientes"],
    queryFn: comidasPendientesPorChofer,
  });
}
