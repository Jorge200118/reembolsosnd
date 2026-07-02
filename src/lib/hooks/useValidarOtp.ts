"use client";
import { useMutation } from "@tanstack/react-query";
import { validarOtpComidas, type ValidarOtpInput } from "@/lib/edge/otpComidas";

export function useValidarOtp() {
  return useMutation({
    mutationFn: (input: ValidarOtpInput) => validarOtpComidas(input),
  });
}
