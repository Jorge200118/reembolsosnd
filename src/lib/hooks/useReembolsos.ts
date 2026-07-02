"use client";
import { useQuery } from "@tanstack/react-query";
import { listarReembolsos, type FiltrosReembolso } from "@/lib/supabase/queries/reembolsos";

export function useReembolsos(filtros: FiltrosReembolso) {
  return useQuery({
    queryKey: ["reembolsos", filtros],
    queryFn: () => listarReembolsos(filtros),
  });
}
