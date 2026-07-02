"use client";
import { useMutation } from "@tanstack/react-query";
import { enviarACorte, type EnviarACorteInput } from "@/lib/supabase/queries/corte";

export function useEnviarACorte() {
  return useMutation({
    mutationFn: (input: EnviarACorteInput) => enviarACorte(input),
  });
}
