"use client";
import { useMutation } from "@tanstack/react-query";
import { crearReembolso, type NuevoReembolsoInput } from "@/lib/supabase/queries/crearReembolso";

export function useCrearReembolso() {
  return useMutation({
    mutationFn: (input: NuevoReembolsoInput) => crearReembolso(input),
  });
}
