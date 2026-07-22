"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSolicitudesMaterial } from "@/lib/hooks/useSolicitudesMaterial";
import { useEntregarMaterial } from "@/lib/hooks/useAccionesMaterial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SolicitudCard } from "@/components/materiales/SolicitudCard";
import { TablaLineas } from "@/components/materiales/TablaLineas";
import type { SolicitudGuardada } from "@/lib/materiales/totales";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";

export default function MaterialesAlmacenPage() {
  const { sesion } = useAuth();
  const sucursal = sesion?.rol === "admin" ? null : (sesion?.sucursal ?? null);

  const autorizadasQ = useSolicitudesMaterial({ sucursal, estados: ["autorizada"] });
  const entregadasQ = useSolicitudesMaterial({ sucursal, estados: ["entregada"], limite: 30 });
  const entregar = useEntregarMaterial();

  const [msg, setMsg] = useState("");
  const [verEntregadas, setVerEntregadas] = useState(false);
  // Mapa solicitudId -> { lineaId: cantidad }. Se llena solo al tocar un campo;
  // lo que no se toque va con la cantidad pedida (el caso normal: se surtió todo).
  const [capturas, setCapturas] = useState<Record<string, Record<string, number>>>({});
  const [confirmar, setConfirmar] = useState<SolicitudGuardada | null>(null);

  const autorizadas = useMemo(() => autorizadasQ.data ?? [], [autorizadasQ.data]);
  const entregadas = useMemo(() => entregadasQ.data ?? [], [entregadasQ.data]);

  function cambiar(solicitudId: string, lineaId: string, cantidad: number) {
    setCapturas((prev) => ({
      ...prev,
      [solicitudId]: { ...(prev[solicitudId] ?? {}), [lineaId]: cantidad },
    }));
  }

  function confirmarEntrega(s: SolicitudGuardada) {
    const capturado = capturas[s.id] ?? {};
    const entregas = s.rnd_material_lineas.map((l) => ({
      lineaId: l.id,
      cantidadEntregada: capturado[l.id] ?? l.cantidad,
    }));
    setMsg("");
    entregar.mutate(
      { id: s.id, entregas },
      {
        onSuccess: (r) => {
          setMsg(r.ok ? `✅ ${s.folio} entregada` : `⚠ ${r.error}`);
          setConfirmar(null);
        },
      },
    );
  }

  const lista = verEntregadas ? entregadas : autorizadas;
  const cargando = verEntregadas ? entregadasQ.isLoading : autorizadasQ.isLoading;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Almacén" subtitulo="Uso interno autorizado, listo para surtir" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setVerEntregadas(false)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!verEntregadas ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Por surtir ({autorizadasQ.isLoading ? "…" : autorizadas.length})
        </button>
        <button
          onClick={() => setVerEntregadas(true)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${verEntregadas ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Entregadas
        </button>
      </div>

      {cargando ? (
        <Card className="p-6 text-center text-sm text-slate-500">Cargando solicitudes…</Card>
      ) : lista.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
          {verEntregadas ? "Todavía no has entregado material." : "No hay material autorizado por surtir."}
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              acentoColor={verEntregadas ? "border-l-emerald-500" : "border-l-blue-500"}
              accion={
                verEntregadas ? undefined : (
                  <button className={BTN_OK} disabled={entregar.isPending} onClick={() => setConfirmar(s)}>
                    Marcar entregado
                  </button>
                )
              }
              detalle={
                <TablaLineas
                  lineas={s.rnd_material_lineas}
                  capturable={!verEntregadas}
                  entregas={capturas[s.id] ?? {}}
                  onCambiar={(lineaId, cantidad) => cambiar(s.id, lineaId, cantidad)}
                />
              }
            />
          ))}
        </div>
      )}

      {confirmar && (() => {
        const s = confirmar;
        const capturado = capturas[s.id] ?? {};
        const incompletas = s.rnd_material_lineas.filter(
          (l) => (capturado[l.id] ?? l.cantidad) < l.cantidad,
        ).length;
        return (
          <ConfirmDialog
            titulo={`Entregar ${s.folio}`}
            mensaje={
              <span>
                {s.empleado_nombre} · {s.rnd_material_lineas.length} materiales
                {incompletas > 0 && (
                  <>
                    {" · "}
                    <strong>{incompletas}</strong> se surten incompletos
                  </>
                )}
              </span>
            }
            textoConfirmar="Marcar entregado"
            colorConfirmar="verde"
            isPending={entregar.isPending}
            onCancelar={() => setConfirmar(null)}
            onConfirmar={() => confirmarEntrega(s)}
          />
        );
      })()}
    </main>
  );
}
