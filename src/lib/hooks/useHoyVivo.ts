"use client";
import { useEffect, useState } from "react";

// Devuelve el día de HOY en YYYY-MM-DD local, y lo mantiene actualizado.
//
// El problema real: las cajeras dejan la pestaña abierta días enteros. Una
// fecha calculada durante el render queda congelada al día en que se abrió la
// pestaña, porque React no re-renderiza solo porque pasó la medianoche. Eso
// dejaba el `max` del <input type="date"> en un día viejo y el navegador
// bloqueaba la captura con "El valor debe ser menor o igual a ...".
//
// Se revalida cuando la pestaña vuelve a estar visible o recupera el foco
// (el caso típico: la cajera regresa a la app al día siguiente).
export function useHoyVivo(): string {
  const [hoy, setHoy] = useState(hoyLocal);

  useEffect(() => {
    const revisar = () => {
      const actual = hoyLocal();
      // setState con el mismo string no re-renderiza: es seguro llamarlo seguido.
      setHoy((previo) => (previo === actual ? previo : actual));
    };

    // Al volver a la pestaña tras horas/días.
    document.addEventListener("visibilitychange", revisar);
    window.addEventListener("focus", revisar);
    // Red de seguridad para una pestaña visible que cruza la medianoche sin
    // que nadie la toque (pantalla siempre encendida en el mostrador).
    const id = setInterval(revisar, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", revisar);
      window.removeEventListener("focus", revisar);
      clearInterval(id);
    };
  }, []);

  return hoy;
}

// Formatea con los componentes LOCALES. No usar toISOString(): convierte a UTC
// y en México (UTC-6/-7) a partir de las ~5 PM devuelve ya el día siguiente.
export function aISOLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function hoyLocal(): string {
  return aISOLocal(new Date());
}

// Tope permitido para la fecha de un vale: hoy + 1 día.
export function maxDesdeHoy(hoy: string): string {
  const [y = 0, m = 1, d = 1] = hoy.split("-").map(Number);
  const fecha = new Date(y, m - 1, d + 1); // el constructor local normaliza fin de mes/año
  return aISOLocal(fecha);
}
