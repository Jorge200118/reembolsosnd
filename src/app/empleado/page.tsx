"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/empleado/Toast";
import { AvisosCard } from "@/components/empleado/AvisosCard";

interface Comida { id: string; fecha: string; monto: number; }
interface Panel {
  nombre: string;
  comidas: Comida[];
  total: number;
  codigo: string | null;
  expira_en: string | null;
  hay_nuevas: boolean;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m! - 1), d!);
  return `${DIAS[dt.getDay()]} ${d} ${MESES[m! - 1]}`;
}
function moneda(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const IconoComida = (
  <svg className="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3v7a2 2 0 0 0 4 0V3M7 10v11M17 3c-1.5 0-3 1.5-3 5s1.5 4 3 4v9" />
  </svg>
);

export default function HomeEmpleado() {
  const router = useRouter();
  const { mostrar } = useToast();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [verCodigo, setVerCodigo] = useState(false);
  const [regenerando, setRegenerando] = useState(false);

  const cargar = useCallback(async (regenerar = false) => {
    const res = await fetch("/api/empleado/panel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerar }),
    });
    if (res.status === 401) { router.replace("/empleado/login"); return null; }
    const data = await res.json();
    return data as Panel & { ok: boolean };
  }, [router]);

  useEffect(() => {
    cargar().then((d) => { if (d) setPanel(d); setCargando(false); });
  }, [cargar]);

  async function actualizar() {
    setRegenerando(true);
    const d = await cargar(true);
    if (d) { setPanel(d); mostrar("Código actualizado"); }
    setRegenerando(false);
  }

  async function copiar() {
    if (!panel?.codigo) return;
    try {
      await navigator.clipboard.writeText(panel.codigo);
      mostrar("Código copiado");
    } catch {
      mostrar("No se pudo copiar");
    }
  }

  async function salir() {
    await fetch("/api/empleado/logout", { method: "POST" });
    router.replace("/empleado/login");
  }

  if (cargando) {
    return <p className="carnet-empty" style={{ marginTop: 60 }}>Cargando…</p>;
  }

  const nombreCorto = (panel?.nombre ?? "").split(" ")[0] || "chofer";
  const comidas = panel?.comidas ?? [];

  return (
    <>
      <div className="carnet-topbar">
        <div className="carnet-hola">Hola, {nombreCorto}<small>Aceros del Pacífico</small></div>
        <button className="carnet-salir" type="button" onClick={salir}>Salir</button>
      </div>

      <AvisosCard />

      {comidas.length === 0 ? (
        <div className="carnet-card">
          <div className="carnet-empty">No tienes comidas por cobrar.<br />Cuando te autoricen una, aparece aquí.</div>
        </div>
      ) : !verCodigo ? (
        <>
          <div className="carnet-card">
            <div className="carnet-cardttl">
              <span className="carnet-stencil">Comidas por cobrar</span>
              <span className="carnet-chip">{comidas.length}</span>
            </div>
            {comidas.map((c) => (
              <div className="carnet-row" key={c.id}>
                <div className="f">{IconoComida}<span className="dt">{fechaCorta(c.fecha)}</span></div>
                <span className="amt">{moneda(c.monto)}</span>
              </div>
            ))}
            <div className="carnet-total"><span className="k">Total a cobrar</span><span className="v">{moneda(panel?.total ?? 0)}</span></div>
          </div>
          <button className="carnet-btn" type="button" style={{ marginTop: 18 }} onClick={() => setVerCodigo(true)}>
            Ver mi código
          </button>
        </>
      ) : (
        <>
          <div className="carnet-code-card">
            <div className="carnet-code-lbl">Muéstralo en caja</div>
            <div className="carnet-code">{panel?.codigo ?? "—"}</div>
            <div className="carnet-code-vence">Vence hoy · 11:59 pm</div>
            <div className="carnet-code-cubre">Cobra tus <b>{comidas.length} comida{comidas.length !== 1 ? "s" : ""}</b> · <b>{moneda(panel?.total ?? 0)}</b></div>
          </div>
          {panel?.hay_nuevas && (
            <div className="carnet-nueva">Tienes una comida nueva que no está en este código.</div>
          )}
          <button className="carnet-btn" type="button" style={{ marginTop: 12 }} onClick={copiar}>Copiar código</button>
          {panel?.hay_nuevas && (
            <button className="carnet-btn-2" type="button" onClick={actualizar} disabled={regenerando}>
              {regenerando ? "Actualizando…" : "Actualizar para incluir todo"}
            </button>
          )}
          <button className="carnet-btn-2" type="button" onClick={() => setVerCodigo(false)}>Volver</button>
        </>
      )}
    </>
  );
}
