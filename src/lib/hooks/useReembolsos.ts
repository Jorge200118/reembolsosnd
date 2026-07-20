"use client";
import { useQuery } from "@tanstack/react-query";
import {
  listarReembolsos,
  listarTodosReembolsos,
  type FiltrosReembolso,
} from "@/lib/supabase/queries/reembolsos";

export function useReembolsos(
  filtros: FiltrosReembolso,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["reembolsos", filtros],
    queryFn: () => listarReembolsos(filtros),
    enabled: options?.enabled ?? true,
  });
}

// Trae TODAS las filas filtradas (sin paginar). Es potencialmente lento con
// miles de registros, así que `enabled` controla cuándo se dispara (p. ej. solo
// con la vista por lotes activa o justo antes de exportar).
export function useTodosReembolsos(
  filtros: Omit<FiltrosReembolso, "page" | "pageSize">,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["reembolsos-todos", filtros],
    queryFn: () => listarTodosReembolsos(filtros),
    enabled: options?.enabled ?? true,
  });
}
