"use client";
import { useMutation } from "@tanstack/react-query";
import { crearComida, type CrearComidaInput } from "@/lib/edge/crearComida";

export function useCrearComida() {
  return useMutation({
    mutationFn: (input: CrearComidaInput) => crearComida(input),
  });
}
