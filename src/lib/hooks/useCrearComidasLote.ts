"use client";
import { useMutation } from "@tanstack/react-query";
import { crearComida, type CrearComidaInput } from "@/lib/edge/crearComida";

export interface ResultadoComidaLote {
  empleadoId: number;
  nombre: string;
  ok: boolean;
  error?: string;
}

export interface CrearComidasLoteInput {
  empleados: Array<{ id: number; nombre: string; sucursal: string | null }>;
  quienAutoriza: string;
  usuarioRegistro: string;
  sucursalSesion: string | null;
  fecha?: string; // "YYYY-MM-DD"; si se omite, la edge function usa hoy en Mazatlán
}

// Autoriza varias comidas de una sola acción. Llama a crearComida por cada
// empleado (la edge function valida duplicado de la fecha internamente), y devuelve
// el detalle por empleado para mostrar cuáles se registraron y cuáles no.
async function crearComidasLote(input: CrearComidasLoteInput): Promise<ResultadoComidaLote[]> {
  const resultados: ResultadoComidaLote[] = [];
  for (const emp of input.empleados) {
    const payload: CrearComidaInput = {
      empleadoId: emp.id,
      quienAutoriza: input.quienAutoriza,
      usuarioRegistro: input.usuarioRegistro,
      sucursalUsuario: emp.sucursal ?? input.sucursalSesion ?? undefined,
      fecha: input.fecha,
    };
    try {
      const r = await crearComida(payload);
      resultados.push({ empleadoId: emp.id, nombre: emp.nombre, ok: r.ok, error: r.error });
    } catch (e) {
      resultados.push({ empleadoId: emp.id, nombre: emp.nombre, ok: false, error: e instanceof Error ? e.message : "Error de red" });
    }
  }
  return resultados;
}

export function useCrearComidasLote() {
  return useMutation({
    mutationFn: (input: CrearComidasLoteInput) => crearComidasLote(input),
  });
}
