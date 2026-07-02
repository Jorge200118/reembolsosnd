"use client";
import { useState } from "react";
import { CONCEPTOS, AUTORIZADORES } from "@devoluciones/domain";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCrearReembolso } from "@/lib/hooks/useCrearReembolso";
import { SelectorArchivos, validarArchivos } from "@/components/reembolsos/SelectorArchivos";

// fecha máxima permitida = hoy + 1 día, en formato YYYY-MM-DD
function maxFecha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

export function FormNuevoReembolso() {
  const { sesion } = useAuth();
  const { mutate, isPending, data } = useCrearReembolso();
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState("");
  const [autoriza, setAutoriza] = useState("");
  const [concepto, setConcepto] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!sesion) { setError("Sesión no válida"); return; }
    const m = parseFloat(monto);
    if (!nombre.trim() || !fecha || !autoriza.trim() || !concepto) {
      setError("Completa todos los campos obligatorios"); return;
    }
    if (!(m > 0)) { setError("El monto debe ser mayor a 0"); return; }
    if (fecha > maxFecha()) { setError("La fecha no puede ser mayor a mañana"); return; }
    const errArch = validarArchivos(archivos);
    if (errArch) { setError(errArch); return; }

    mutate(
      {
        nombreBeneficiario: nombre.trim(),
        fecha,
        monto: m,
        quienAutoriza: autoriza.trim(),
        concepto,
        archivos,
        quienEntrega: sesion.nombre,
        usuarioRegistro: sesion.email,
        sucursalUsuario: sesion.sucursal,
      },
      {
        onSuccess: (r) => {
          if (r.ok) {
            setNombre(""); setMonto(""); setAutoriza(""); setConcepto(""); setArchivos([]);
            setFecha(hoyISO());
          } else {
            setError(r.error ?? "Error al registrar");
          }
        },
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <label className={labelClass}>Beneficiario *</label>
        <input className={inputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Fecha *</label>
          <input type="date" max={maxFecha()} className={inputClass} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Monto *</label>
          <input type="number" step="0.01" min="0" className={inputClass} value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
      </div>
      <div className="mb-4">
        <label className={labelClass}>Concepto *</label>
        <select className={inputClass} value={concepto} onChange={(e) => setConcepto(e.target.value)}>
          <option value="">Selecciona…</option>
          {CONCEPTOS.map((c) => <option key={c.concepto} value={c.concepto}>{c.concepto}</option>)}
        </select>
      </div>
      <div className="mb-4">
        <label className={labelClass}>Quién autoriza *</label>
        <input list="autorizadores" className={inputClass} value={autoriza} onChange={(e) => setAutoriza(e.target.value)} />
        <datalist id="autorizadores">
          {AUTORIZADORES.map((a) => <option key={a} value={a} />)}
        </datalist>
      </div>
      <div className="mb-4">
        <SelectorArchivos onChange={setArchivos} />
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data?.ok && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">✅ Reembolso registrado con {data.archivosSubidos} comprobante(s)</p>}
      <button type="submit" disabled={isPending} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-40">
        {isPending ? "Registrando…" : "Registrar Reembolso"}
      </button>
    </form>
  );
}
