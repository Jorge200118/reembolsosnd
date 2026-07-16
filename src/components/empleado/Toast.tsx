"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ToastValue {
  mostrar: (mensaje: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null);

  const mostrar = useCallback((m: string) => {
    setMensaje(m);
    // Se oculta solo. No usamos alert(): es un aviso flotante propio.
    window.setTimeout(() => setMensaje(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrar }}>
      {children}
      {mensaje !== null && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translateX(-50%)",
            zIndex: 60,
            background: "#0f2942",
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: "12px",
            fontFamily: "var(--font-work), sans-serif",
            fontSize: "14px",
            fontWeight: 500,
            boxShadow: "0 12px 30px -10px rgba(0,0,0,.5)",
            maxWidth: "88vw",
            textAlign: "center",
          }}
        >
          {mensaje}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
