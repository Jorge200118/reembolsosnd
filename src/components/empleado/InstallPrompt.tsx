"use client";
import { useEffect, useState } from "react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

// Banner de "Instalar app" visible al entrar. En Android/desktop usa el evento
// beforeinstallprompt (botón directo); en iPhone (que no lo dispara) ofrece un
// paso a paso, porque ahí instalar es la unica via para recibir avisos.
export function InstallPrompt() {
  const [evento, setEvento] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [esIOS, setEsIOS] = useState(false);
  const [instalada, setInstalada] = useState(false);
  const [verPasos, setVerPasos] = useState(false);

  useEffect(() => {
    // Ya instalada (abierta como app) → no mostrar.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalada(true);
      return;
    }
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    setEsIOS(ios);
    if (ios) {
      setVisible(true); // iOS: mostrar el paso a paso directo
      return;
    }
    const onBIP = (e: Event) => {
      e.preventDefault();
      setEvento(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  if (instalada || !visible) return null;

  const instalar = async () => {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    setVisible(false);
    setEvento(null);
  };

  return (
    <div
      style={{
        background: "#0f2942",
        color: "#ffffff",
        borderRadius: "14px",
        padding: "14px 16px",
        margin: "0 0 18px",
        boxShadow: "0 10px 26px -14px rgba(15,41,66,.6)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          aria-hidden
          style={{
            flex: "none", width: 40, height: 40, borderRadius: 10,
            background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Instala Vales AC</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>
            Tenla a un toque y recibe los avisos de tus vales.
          </div>
        </div>
        {esIOS ? (
          <button
            type="button"
            onClick={() => setVerPasos((v) => !v)}
            aria-expanded={verPasos}
            style={{
              flex: "none", background: "#ffffff", color: "#0f2942", border: "none",
              borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            {verPasos ? "Ocultar" : "Cómo"}
          </button>
        ) : (
          <button
            type="button"
            onClick={instalar}
            style={{
              flex: "none", background: "#ffffff", color: "#0f2942", border: "none",
              borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            Instalar
          </button>
        )}
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => setVisible(false)}
          style={{ flex: "none", background: "transparent", border: "none", color: "#ffffff", opacity: 0.7, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {esIOS && verPasos && (
        <div
          style={{
            marginTop: 14,
            borderTop: "1px solid rgba(255,255,255,.14)",
            paddingTop: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <Paso n={1}>
            Toca <Chip><IconoCompartir /> Compartir</Chip> en la barra de Safari.
          </Paso>
          <Paso n={2}>
            Elige <Chip><IconoAgregar /> Agregar a inicio</Chip>.
          </Paso>
          <Paso n={3}>
            Toca <Chip>Agregar</Chip> arriba a la derecha.
          </Paso>
          <div style={{ fontSize: 11.5, opacity: 0.7, lineHeight: 1.4 }}>
            En iPhone los avisos solo llegan con la app instalada.
          </div>
        </div>
      )}
    </div>
  );
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span
        aria-hidden
        style={{
          flex: "none", width: 22, height: 22, borderRadius: 999, background: "#2563eb",
          color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.95 }}>{children}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle",
        background: "rgba(255,255,255,.12)", borderRadius: 6, padding: "1px 7px", fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// Ícono Compartir de iOS (caja abierta arriba con flecha hacia arriba).
function IconoCompartir() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4" />
      <path d="M8.5 7.5 12 4l3.5 3.5" />
      <path d="M7 10H5v10h14V10h-2" />
    </svg>
  );
}

// Ícono "Agregar a inicio" (cuadro con signo +).
function IconoAgregar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  );
}
