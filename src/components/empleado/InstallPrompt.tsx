"use client";
import { useEffect, useState } from "react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

// Banner de "Instalar app" visible al entrar. En Android/desktop usa el evento
// beforeinstallprompt; en iPhone (que no lo dispara) muestra instrucciones.
export function InstallPrompt() {
  const [evento, setEvento] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [esIOS, setEsIOS] = useState(false);
  const [instalada, setInstalada] = useState(false);

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
      setVisible(true); // iOS: mostrar instrucciones directo
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
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow: "0 10px 26px -14px rgba(51,41,29,.6)",
      }}
    >
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
          {esIOS ? "Toca Compartir → “Agregar a inicio”." : "Tenla a un toque en tu teléfono."}
        </div>
      </div>
      {!esIOS && (
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
  );
}
