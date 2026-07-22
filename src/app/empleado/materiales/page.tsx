"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/empleado/Toast";
import { BuscadorMaterial } from "@/components/empleado/BuscadorMaterial";
import { CarritoMaterial } from "@/components/empleado/CarritoMaterial";
import { agregarMaterial, cambiarCantidad, quitarMaterial } from "@/lib/materiales/carrito";
import type { Material, LineaSolicitud } from "@/lib/materiales/tipos";

// Nombres propios (`Mia`) a propósito: esta es la forma RECORTADA que ve el
// empleado. El escritorio usa una más ancha (con empleado_nombre, sucursal,
// costos) que vivirá en `SolicitudGuardada`. Dos vistas, dos tipos, sin que
// uno finja ser el otro.
interface LineaMia {
  id: string; cod_prod: string; descripcion: string; unidad: string | null;
  cantidad: number; cantidad_entregada: number | null;
}
interface SolicitudMia {
  id: string; folio: string; estado: string; nota: string | null; creado_en: string;
  motivo_rechazo: string | null;
  rnd_material_lineas: LineaMia[];
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Esperando a tu gerente",
  autorizada: "Autorizada, pásala a almacén",
  entregada: "Entregada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function MaterialesEmpleado() {
  const router = useRouter();
  const { mostrar } = useToast();
  const [lineas, setLineas] = useState<LineaSolicitud[]>([]);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudMia[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/empleado/materiales");
    if (res.status === 401) { router.replace("/empleado/login"); return; }
    const data = await res.json();
    if (data.ok) setSolicitudes(data.solicitudes as SolicitudMia[]);
    setCargando(false);
  }, [router]);

  useEffect(() => { void cargar(); }, [cargar]);

  function onElegir(m: Material) {
    setLineas((prev) => agregarMaterial(prev, m, 1));
    mostrar(`${m.descripcion} agregado`);
  }

  async function enviar() {
    if (lineas.length === 0 || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/empleado/materiales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: nota.trim() || null, lineas }),
      });
      const data = await res.json();
      if (data.ok) {
        mostrar(`Solicitud ${data.folio} enviada`);
        setLineas([]);
        setNota("");
        await cargar();
      } else {
        mostrar(String(data.error ?? "No se pudo enviar"));
      }
    } catch {
      mostrar("No se pudo enviar, revisa tu conexión");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(id: string) {
    const res = await fetch("/api/empleado/materiales/cancelar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    mostrar(data.ok ? "Solicitud cancelada" : String(data.error ?? "No se pudo cancelar"));
    if (data.ok) await cargar();
  }

  return (
    <>
      <div className="carnet-topbar">
        <div className="carnet-hola">Pedir material<small>Aceros del Pacífico</small></div>
        <Link className="carnet-salir" href="/empleado">Volver</Link>
      </div>

      <div className="carnet-card">
        <div className="carnet-cardttl">
          <span className="carnet-stencil">Nueva solicitud</span>
          {lineas.length > 0 && <span className="carnet-chip">{lineas.length}</span>}
        </div>
        <BuscadorMaterial onElegir={onElegir} />
        <CarritoMaterial
          lineas={lineas}
          onCambiarCantidad={(cod, cant) => setLineas((p) => cambiarCantidad(p, cod, cant))}
          onQuitar={(cod) => setLineas((p) => quitarMaterial(p, cod))}
        />
        {lineas.length > 0 && (
          <>
            <div className="carnet-field" style={{ marginTop: 12 }}>
              <input
                className="carnet-input"
                type="text"
                value={nota}
                maxLength={200}
                onChange={(e) => setNota(e.target.value)}
                placeholder="¿Para qué lo necesitas? (opcional)"
                aria-label="Nota"
              />
            </div>
            <button className="carnet-btn" type="button" style={{ marginTop: 12 }} disabled={enviando} onClick={enviar}>
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>
          </>
        )}
      </div>

      <div className="carnet-card">
        <div className="carnet-cardttl">
          <span className="carnet-stencil">Mis solicitudes</span>
        </div>
        {cargando ? (
          <p className="carnet-empty">Cargando…</p>
        ) : solicitudes.length === 0 ? (
          <p className="carnet-empty">Todavía no has pedido material.</p>
        ) : (
          solicitudes.map((s) => (
            <div className="mat-linea" key={s.id}>
              <div className="mat-linea-txt">
                <span className="mat-desc">
                  {s.folio} · {fechaCorta(s.creado_en)}
                </span>
                <span className="mat-meta">
                  {s.rnd_material_lineas.length} material{s.rnd_material_lineas.length !== 1 ? "es" : ""}
                  {" · "}
                  {s.rnd_material_lineas.map((l) => `${l.cantidad} ${l.descripcion}`).join(", ")}
                </span>
                <span className={`mat-estado mat-estado-${s.estado}`}>
                  {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                </span>
                {s.motivo_rechazo && <span className="mat-aviso">Motivo: {s.motivo_rechazo}</span>}
              </div>
              {s.estado === "pendiente" && (
                <button type="button" className="mat-quitar" aria-label={`Cancelar ${s.folio}`} onClick={() => cancelar(s.id)}>
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
