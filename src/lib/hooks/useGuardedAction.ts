"use client";
import { useCallback, useEffect, useRef } from "react";

// Protege un handler contra el DOBLE-CLICK / doble-tap veloz.
//
// El problema real: `disabled={isPending}` NO frena el segundo click rápido.
// React recalcula `isPending` en el SIGUIENTE render; entre el primer click y
// ese render, un doble-tap dispara el handler dos veces → dos reembolsos, dos
// pagos OTP, dos lotes de comidas. La barra visual solo atrapa clicks lentos.
//
// Este guard usa un ref (síncrono, sin esperar re-render) para bloquear la
// segunda invocación. Se libera cuando:
//   • el handler devuelve una promesa → al resolverse/rechazarse (flujos fetch)
//   • el handler es fire-and-forget (mutate de React Query) → en el siguiente
//     frame, para cuando `isPending` ya tomó el control del estado disabled.
//
// Uso:
//   const registrar = useGuardedAction(onSubmit);
//   <form onSubmit={registrar}>            // recibe el event tal cual
//   <button onClick={useGuardedAction(autorizar)}>
export function useGuardedAction<A extends unknown[]>(
  handler: (...args: A) => void | Promise<unknown>,
): (...args: A) => void {
  const bloqueado = useRef(false);
  // Guardamos el handler en un ref para que la función devuelta sea estable
  // (misma identidad entre renders) sin quedar amarrada a un closure viejo.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  // Al desmontar, soltamos el lock por si quedó un frame pendiente.
  useEffect(() => {
    return () => {
      bloqueado.current = false;
    };
  }, []);

  return useCallback((...args: A) => {
    if (bloqueado.current) return;
    bloqueado.current = true;

    let resultado: void | Promise<unknown>;
    try {
      resultado = handlerRef.current(...args);
    } catch (e) {
      bloqueado.current = false;
      throw e;
    }

    if (resultado && typeof (resultado as Promise<unknown>).then === "function") {
      // Handler async (fetch): liberamos cuando termine.
      void (resultado as Promise<unknown>).finally(() => {
        bloqueado.current = false;
      });
    } else {
      // Handler síncrono (dispara mutate y retorna): liberamos en el próximo
      // frame. Absorbe el doble-tap; para entonces `isPending` ya deshabilita.
      const liberar = () => {
        bloqueado.current = false;
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(liberar);
      else setTimeout(liberar, 32);
    }
  }, []);
}
