"use client";
import { useMutation } from "@tanstack/react-query";
import { autorizarLote, rechazarLote } from "@/lib/supabase/queries/autorizacion";

export function useAutorizarLote() {
  return useMutation({
    mutationFn: (args: { ids: string[]; autorizadoPor: string }) =>
      autorizarLote(args.ids, args.autorizadoPor),
  });
}

export function useRechazarLote() {
  return useMutation({
    mutationFn: (args: { ids: string[]; autorizadoPor: string; motivo?: string }) =>
      rechazarLote(args.ids, args.autorizadoPor, args.motivo),
  });
}
