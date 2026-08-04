"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// Zona horaria del negocio. Las edge functions de comidas validan la fecha
// contra Mazatlán, así que la UI tiene que calcular el día igual: con el huso
// del celular, un vale capturado de noche saldría "con fecha futura".
export const ZONA_COMIDAS = "America/Mazatlan";

// Devuelve el día de HOY en YYYY-MM-DD, y lo mantiene actualizado.
//
// El problema real: las cajeras dejan la pestaña abierta días enteros y los
// gerentes dejan la PWA abierta en el celular. Una fecha calculada durante el
// render queda congelada al día en que se abrió la app, porque React no
// re-renderiza solo porque pasó la medianoche. Eso dejaba el `max` del
// <input type="date"> en un día viejo y el navegador bloqueaba la captura con
// "El valor debe ser menor o igual a ...".
//
// Se revalida cuando la pestaña vuelve a estar visible o recupera el foco
// (el caso típico: se regresa a la app al día siguiente).
export function useHoyVivo(zona?: string): string {
  const [hoy, setHoy] = useState(() => hoyLocal(zona));

  useEffect(() => {
    const revisar = () => {
      const actual = hoyLocal(zona);
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
  }, [zona]);

  return hoy;
}

// Fecha de captura que sigue al día en curso. Reemplazo directo de useState
// para los <input type="date"> pre-llenados con hoy.
//
// Mantener el `max` vivo no basta: el VALOR del input también se congela al
// día en que se abrió la app, y el gerente termina autorizando comidas con
// fecha vieja sin darse cuenta. La fecha se mueve sola SOLO si seguía
// apuntando al día anterior; si alguien la echó para atrás a propósito
// (captura retroactiva), se respeta.
export function useFechaDelDia(hoy: string): [string, Dispatch<SetStateAction<string>>] {
  const [fecha, setFecha] = useState(hoy);
  const [hoyPrevio, setHoyPrevio] = useState(hoy);

  // Ajuste de estado durante el render: es el patrón que documenta React para
  // sincronizar estado con un valor que cambia, y evita el parpadeo de un
  // useEffect (React descarta este render y vuelve a renderizar antes de pintar).
  if (hoy !== hoyPrevio) {
    setHoyPrevio(hoy);
    if (fecha === hoyPrevio) setFecha(hoy);
  }

  return [fecha, setFecha];
}

// Formatea con los componentes LOCALES. No usar toISOString(): convierte a UTC
// y en México (UTC-6/-7) a partir de las ~5 PM devuelve ya el día siguiente.
export function aISOLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Sin `zona` usa el huso del dispositivo; con `zona` calcula el día de esa
// zona ("en-CA" formatea justo como YYYY-MM-DD).
export function hoyLocal(zona?: string): string {
  const ahora = new Date();
  return zona
    ? new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(ahora)
    : aISOLocal(ahora);
}

// Tope permitido para la fecha de un vale: hoy + 1 día.
export function maxDesdeHoy(hoy: string): string {
  const [y = 0, m = 1, d = 1] = hoy.split("-").map(Number);
  const fecha = new Date(y, m - 1, d + 1); // el constructor local normaliza fin de mes/año
  return aISOLocal(fecha);
}
