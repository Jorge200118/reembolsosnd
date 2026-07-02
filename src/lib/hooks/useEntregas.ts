"use client";
import { useMutation } from "@tanstack/react-query";
import { solicitarEntrega, marcarEntregado, type AprobadoLite } from "@/lib/supabase/queries/entregas";

export function useSolicitarEntrega() {
  return useMutation({ mutationFn: (aprobados: AprobadoLite[]) => solicitarEntrega(aprobados) });
}

export function useMarcarEntregado() {
  return useMutation({
    mutationFn: (args: { ids: string[]; evidencia: File }) => marcarEntregado(args.ids, args.evidencia),
  });
}
