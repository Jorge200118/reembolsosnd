"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSolicitudesMaterial } from "@/lib/hooks/useSolicitudesMaterial";
import { useAutorizarMaterial, useRechazarMaterial } from "@/lib/hooks/useAccionesMaterial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SolicitudCard } from "@/components/materiales/SolicitudCard";
import { TablaLineas } from "@/components/materiales/TablaLineas";
import { totalDeLineas, type SolicitudGuardada } from "@/lib/materiales/totales";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";
const BTN_NO = "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40";

export default function MaterialesGerentePage() {
  const { sesion } = useAuth();
  // El admin ve todas las sucursales; el gerente solo la suya.
  const sucursal = sesion?.rol === "admin" ? null : (sesion?.sucursal ?? null);

  const pendientesQ = useSolicitudesMaterial({ sucursal, estados: ["pendiente"] });
  const historialQ = useSolicitudesMaterial({
    sucursal,
    estados: ["autorizada", "entregada", "rechazada", "cancelada"],
    limite: 30,
  });

  const autorizar = useAutorizarMaterial();
  const rechazar = useRechazarMaterial();
  const [msg, setMsg] = useState("");
  const [verHistorial, setVerHistorial] = useState(false);
  const [confirmar, setConfirmar] = useState<{ tipo: "autorizar" | "rechazar"; s: SolicitudGuardada } | null>(null);

  const pendientes = useMemo(() => pendientesQ.data ?? [], [pendientesQ.data]);
  const historial = useMemo(() => historialQ.data ?? [], [historialQ.data]);

  function resolver(tipo: "autorizar" | "rechazar", s: SolicitudGuardada, motivo?: string) {
    setMsg("");
    // Dos ramas explícitas en vez de una mutación genérica: los cuerpos son
    // distintos (rechazar lleva motivo) y forzar un tipo común pedía un cast.
    const opciones = {
      onSuccess: (r: { ok: boolean; error?: string }) => {
        setMsg(r.ok ? `✅ ${s.folio} ${tipo === "autorizar" ? "autorizada" : "rechazada"}` : `⚠ ${r.error}`);
        setConfirmar(null);
      },
    };
    if (tipo === "autorizar") autorizar.mutate({ id: s.id }, opciones);
    else rechazar.mutate({ id: s.id, motivo }, opciones);
  }

  const lista = verHistorial ? historial : pendientes;
  const cargando = verHistorial ? historialQ.isLoading : pendientesQ.isLoading;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Material" subtitulo="Solicitudes de material de tu sucursal" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setVerHistorial(false)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!verHistorial ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Pendientes ({pendientesQ.isLoading ? "…" : pendientes.length})
        </button>
        <button
          onClick={() => setVerHistorial(true)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${verHistorial ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Historial
        </button>
      </div>

      {cargando ? (
        <Card className="p-6 text-center text-sm text-slate-500">Cargando solicitudes…</Card>
      ) : lista.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
          {verHistorial ? "Todavía no hay solicitudes resueltas." : "No hay solicitudes pendientes."}
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              acentoColor={s.estado === "pendiente" ? "border-l-amber-500" : "border-l-slate-300"}
              accion={
                s.estado === "pendiente" ? (
                  <div className="flex flex-wrap gap-2">
                    <button className={BTN_OK} disabled={autorizar.isPending} onClick={() => setConfirmar({ tipo: "autorizar", s })}>
                      Autorizar
                    </button>
                    <button className={BTN_NO} disabled={rechazar.isPending} onClick={() => setConfirmar({ tipo: "rechazar", s })}>
                      Rechazar
                    </button>
                  </div>
                ) : undefined
              }
              detalle={
                <TablaLineas lineas={s.rnd_material_lineas} capturable={false} entregas={{}} onCambiar={() => {}} />
              }
            />
          ))}
        </div>
      )}

      {confirmar && (() => {
        const s = confirmar.s;
        const esAutorizar = confirmar.tipo === "autorizar";
        const total = totalDeLineas(s.rnd_material_lineas).toLocaleString("es-MX");
        return (
          <ConfirmDialog
            titulo={esAutorizar ? `Autorizar ${s.folio}` : `Rechazar ${s.folio}`}
            mensaje={
              <span>
                {s.empleado_nombre} · {s.rnd_material_lineas.length} materiales · Estimado <strong>${total}</strong>
              </span>
            }
            textoConfirmar={esAutorizar ? "Autorizar" : "Rechazar"}
            colorConfirmar={esAutorizar ? "verde" : "rojo"}
            conMotivo={!esAutorizar}
            isPending={autorizar.isPending || rechazar.isPending}
            onCancelar={() => setConfirmar(null)}
            onConfirmar={(motivo) => resolver(confirmar.tipo, s, motivo)}
          />
        );
      })()}
    </main>
  );
}
