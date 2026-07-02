"use client";
import { useState } from "react";
import { EmpleadoAutocomplete } from "@/components/comidas/EmpleadoAutocomplete";
import { useCrearComida } from "@/lib/hooks/useCrearComida";
import type { EmpleadoBusqueda } from "@/lib/supabase/queries/empleados";

export default function ComidasGerentePage() {
  const [empleado, setEmpleado] = useState<EmpleadoBusqueda | null>(null);
  // TODO: cuando exista login, quien_autoriza sale de la sesión del gerente.
  const [quienAutoriza, setQuienAutoriza] = useState("");
  const { mutate, isPending, data, error, reset } = useCrearComida();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empleado || quienAutoriza.trim() === "") return;
    mutate(
      { empleadoId: empleado.id, quienAutoriza: quienAutoriza.trim(), sucursalUsuario: empleado.sucursal ?? undefined },
      { onSuccess: (r) => { if (r.ok) { setEmpleado(null); } } },
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Registro de Comidas</h1>
      <p className="mb-6 text-sm text-slate-500">Autoriza comidas para tu equipo · Monto fijo $120.00</p>

      <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-600">Beneficiario *</label>
          <EmpleadoAutocomplete onSelect={(emp) => { setEmpleado(emp); reset(); }} />
          {empleado && (
            <p className="mt-1 text-xs text-green-600">
              Seleccionado: {empleado.nombre}{!empleado.tieneTelefono ? " (⚠ sin teléfono — no recibirá código)" : ""}
            </p>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-600">Quién autoriza *</label>
          <input
            type="text"
            className="w-full rounded-lg border px-3 py-2"
            placeholder="Tu nombre (gerente)"
            value={quienAutoriza}
            onChange={(e) => setQuienAutoriza(e.target.value)}
          />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-700">Monto: $120.00</div>
          <div className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-700">Concepto: COMIDAS</div>
        </div>

        {data && (
          <p className={`mb-3 text-sm ${data.ok ? "text-green-600" : "text-red-600"}`}>
            {data.ok ? `✅ Comida autorizada para ${data.beneficiario}` : `⚠ ${data.error}`}
          </p>
        )}
        {error && <p className="mb-3 text-sm text-red-600">Error de conexión. Intenta de nuevo.</p>}

        <button
          type="submit"
          disabled={isPending || !empleado || quienAutoriza.trim() === ""}
          className="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "Registrando…" : "Autorizar Comida"}
        </button>
      </form>
    </main>
  );
}
