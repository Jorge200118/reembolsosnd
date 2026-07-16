"use client";
import { useEffect } from "react";

// Registra el service worker de la PWA de empleados (scope /empleado).
export function RegistrarSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw-empleado.js", { scope: "/empleado" })
      .catch(() => { /* silencioso: la app funciona igual sin SW */ });
  }, []);
  return null;
}
