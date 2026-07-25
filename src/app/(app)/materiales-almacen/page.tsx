"use client";
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSolicitudesMaterial } from "@/lib/hooks/useSolicitudesMaterial";
import { useEntregarMaterial } from "@/lib/hooks/useAccionesMaterial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SolicitudCard } from "@/components/materiales/SolicitudCard";
import { TablaLineas } from "@/components/materiales/TablaLineas";
import { CapturaEntrega } from "@/components/materiales/CapturaEntrega";
import { esCodigoCompleto } from "@/lib/materiales/codigo";
import type { SolicitudGuardada } from "@/lib/materiales/totales";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";

export default function MaterialesAlmacenPage() {
  const { sesion } = useAuth();
  const sucursal = sesion?.rol === "admin" ? null : (sesion?.sucursal ?? null);
  // Null = encargado sin área (sucursales que no las usan): captura todo, que
  // es el comportamiento anterior a las áreas.
  const areaUsuario = sesion?.area ?? null;

  const autorizadasQ = useSolicitudesMaterial({ sucursal, estados: ["autorizada"] });
  const entregadasQ = useSolicitudesMaterial({ sucursal, estados: ["entregada"], limite: 30 });
  const entregar = useEntregarMaterial();

  const [msg, setMsg] = useState("");
  // Tres estados y no un booleano: "por surtir" es lo que me toca a MÍ, y una
  // solicitud donde ya entregué lo mío pero faltan otras áreas no cabe ni en
  // "por surtir" ni en "entregadas".
  const [pestana, setPestana] = useState<"surtir" | "espera" | "entregadas">("surtir");
  // Mapa solicitudId -> { lineaId: cantidad }. Se llena solo al tocar un campo;
  // lo que no se toque va con la cantidad pedida (el caso normal: se surtió todo).
  const [capturas, setCapturas] = useState<Record<string, Record<string, number>>>({});
  const [confirmar, setConfirmar] = useState<SolicitudGuardada | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [codigo, setCodigo] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  // Lo que a ESTE encargado le falta por surtir en una solicitud. Una línea sin
  // área la surte cualquiera (sucursales sin áreas y solicitudes anteriores al
  // cambio); una con área, solo su encargado.
  const pendientesMias = useCallback(
    (s: SolicitudGuardada) =>
      s.rnd_material_lineas.filter(
        (l) =>
          l.cantidad_entregada === null &&
          (areaUsuario === null || l.area === null || l.area === areaUsuario),
      ),
    [areaUsuario],
  );

  // "Por surtir" es lo que a MÍ me falta, no lo que le falta a la solicitud. Sin
  // este filtro, al de Ferretería le seguía apareciendo con botón "Marcar
  // entregado" una solicitud donde ya entregó todo lo suyo y solo faltaban las
  // naves: al pulsarlo se topaba con "esa área ya entregó", que se lee como
  // fallo cuando en realidad hizo bien su trabajo.
  const autorizadas = useMemo(
    () => (autorizadasQ.data ?? []).filter((s) => pendientesMias(s).length > 0),
    [autorizadasQ.data, pendientesMias],
  );

  // Lo que ya entregué pero sigue abierto esperando a otras áreas. No es "por
  // surtir" (no me toca hacer nada) ni "entregada" (la solicitud no ha cerrado),
  // pero esconderlo del todo dejaría al encargado sin saber si su parte llegó.
  const enEspera = useMemo(
    () => (autorizadasQ.data ?? []).filter((s) => pendientesMias(s).length === 0),
    [autorizadasQ.data, pendientesMias],
  );

  const entregadas = useMemo(() => entregadasQ.data ?? [], [entregadasQ.data]);

  function cambiar(solicitudId: string, lineaId: string, cantidad: number) {
    setCapturas((prev) => ({
      ...prev,
      [solicitudId]: { ...(prev[solicitudId] ?? {}), [lineaId]: cantidad },
    }));
  }

  // La foto se sube al confirmar, no al elegirla: si el almacenista cancela,
  // no queda un archivo huérfano en el bucket. Y va ANTES de la RPC, porque
  // una entrega sin evidencia es justo lo que este cambio impide.
  async function confirmarEntrega(s: SolicitudGuardada) {
    if (!foto) { setMsg("⚠ Falta la foto de la entrega"); return; }
    const capturado = capturas[s.id] ?? {};
    // Solo lo de su área y solo lo que no está entregado. Mandar de más lo
    // rechaza la RPC, pero es mejor no pedírselo.
    const mias = pendientesMias(s);
    if (mias.length === 0) {
      setMsg("⚠ No hay materiales de tu área pendientes en esta solicitud");
      return;
    }
    const entregas = mias.map((l) => ({
      lineaId: l.id,
      cantidadEntregada: capturado[l.id] ?? l.cantidad,
    }));
    setMsg("");
    setSubiendo(true);
    try {
      const { prepararArchivo } = await import("@/lib/files/comprimir");
      // Se usa el `tipo` que devuelve prepararArchivo, no blob.type: al
      // comprimir a JPEG el tipo correcto lo sabe el helper, y un Blob recién
      // creado puede venir con type vacío.
      const { blob, tipo, nombre } = await prepararArchivo(foto);
      const fd = new FormData();
      fd.append("solicitudId", s.id);
      fd.append("foto", new File([blob], nombre, { type: tipo }));
      const res = await fetch("/api/materiales/evidencia", { method: "POST", body: fd });
      const sub = await res.json();
      if (!sub.ok) { setMsg(`⚠ ${sub.error ?? "No se pudo subir la foto"}`); return; }

      entregar.mutate(
        { id: s.id, entregas, codigo, evidenciaPath: sub.path },
        {
          onSuccess: (r) => {
            if (!r.ok) { setMsg(`⚠ ${r.error}`); return; }
            setMsg(
              r.cerrada === true
                ? `✅ ${s.folio} entregada completa`
                : `✅ Lo tuyo de ${s.folio} quedó entregado. Faltan ${Number(r.pendientes ?? 0)} materiales de otras áreas.`,
            );
            setConfirmar(null); setFoto(null); setCodigo("");
          },
        },
      );
    } finally {
      setSubiendo(false);
    }
  }

  const lista = pestana === "entregadas" ? entregadas : pestana === "espera" ? enEspera : autorizadas;
  const cargando = pestana === "entregadas" ? entregadasQ.isLoading : autorizadasQ.isLoading;
  const vacio =
    pestana === "entregadas"
      ? "Todavía no has entregado material."
      : pestana === "espera"
        ? "No tienes entregas esperando a otras áreas."
        : "No hay material de tu área por surtir.";

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Almacén" subtitulo="Uso interno autorizado, listo para surtir" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setPestana("surtir")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${pestana === "surtir" ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Por surtir ({autorizadasQ.isLoading ? "…" : autorizadas.length})
        </button>
        {/* Solo aparece si hay algo: en las sucursales sin áreas nunca sobra
            nada esperando, y una pestaña siempre vacía solo estorba. */}
        {enEspera.length > 0 && (
          <button
            onClick={() => setPestana("espera")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${pestana === "espera" ? "bg-amber-600 text-white" : "border border-amber-300 bg-amber-50 text-amber-800"}`}
          >
            Esperando otras áreas ({enEspera.length})
          </button>
        )}
        <button
          onClick={() => setPestana("entregadas")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${pestana === "entregadas" ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Entregadas
        </button>
      </div>

      {cargando ? (
        <Card className="p-6 text-center text-sm text-slate-500">Cargando solicitudes…</Card>
      ) : lista.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">{vacio}</Card>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              acentoColor={
                pestana === "entregadas"
                  ? "border-l-emerald-500"
                  : pestana === "espera"
                    ? "border-l-amber-400"
                    : "border-l-blue-500"
              }
              accion={
                // El botón solo donde hay algo que hacer. En "esperando" ya
                // entregó lo suyo y pulsarlo solo daría "esa área ya entregó".
                pestana !== "surtir" ? undefined : (
                  <button className={BTN_OK} disabled={entregar.isPending} onClick={() => setConfirmar(s)}>
                    Marcar entregado
                  </button>
                )
              }
              detalle={
                <TablaLineas
                  lineas={s.rnd_material_lineas}
                  capturable={pestana === "surtir"}
                  entregas={capturas[s.id] ?? {}}
                  onCambiar={(lineaId, cantidad) => cambiar(s.id, lineaId, cantidad)}
                  areaDelUsuario={areaUsuario}
                />
              }
            />
          ))}
        </div>
      )}

      {confirmar && (() => {
        const s = confirmar;
        const capturado = capturas[s.id] ?? {};
        const mias = pendientesMias(s);
        const incompletas = mias.filter((l) => (capturado[l.id] ?? l.cantidad) < l.cantidad).length;
        return (
          <ConfirmDialog
            titulo={`Entregar ${s.folio}`}
            mensaje={
              <>
                <span>
                  {s.empleado_nombre} · {mias.length} materiales de tu área
                  {incompletas > 0 && (<>{" · "}<strong>{incompletas}</strong> se surten incompletos</>)}
                </span>
                <CapturaEntrega
                  codigo={codigo}
                  onCodigo={setCodigo}
                  onFoto={setFoto}
                  nombreQuienRecoge={s.empleado_nombre}
                />
              </>
            }
            textoConfirmar="Marcar entregado"
            colorConfirmar="verde"
            isPending={entregar.isPending || subiendo}
            deshabilitarConfirmar={!foto || !esCodigoCompleto(codigo)}
            onCancelar={() => { setConfirmar(null); setFoto(null); setCodigo(""); }}
            onConfirmar={() => confirmarEntrega(s)}
          />
        );
      })()}
    </main>
  );
}
