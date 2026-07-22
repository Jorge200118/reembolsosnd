"use client";
import { useState, useEffect, useRef } from "react";
import type { Material } from "@/lib/materiales/tipos";

// Busca en el catálogo del ERP con retraso (debounce) para no disparar una
// consulta por cada tecla. Si el ERP no responde, avisa en línea y deja el
// resto de la pantalla usable: el aviso NO es un alert.

const RETRASO_MS = 350;
const MINIMO = 3;

export function BuscadorMaterial({ onElegir }: { onElegir: (m: Material) => void }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Material[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const ultima = useRef(0);
  const temporizador = useRef<number | null>(null);

  // Buscar es una reacción a que el empleado escribe, no una sincronización con
  // un sistema externo: por eso vive en el manejador del evento y no en un
  // useEffect (ver "You Might Not Need an Effect" de React).
  function alEscribir(valor: string) {
    setTexto(valor);
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);

    const q = valor.trim();
    if (q.length < MINIMO) {
      // Invalida cualquier respuesta en vuelo: si ya no hay búsqueda, no debe
      // aterrizar una lista vieja encima.
      ultima.current++;
      setResultados([]);
      setError("");
      setBuscando(false);
      return;
    }

    setBuscando(true);
    temporizador.current = window.setTimeout(async () => {
      const turno = ++ultima.current;
      try {
        const res = await fetch(`/api/materiales?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        // Descarta respuestas viejas que llegaron tarde y pisarían a la actual.
        if (turno !== ultima.current) return;
        if (!data.ok) {
          setError(String(data.error ?? "No se pudo buscar"));
          setResultados([]);
        } else {
          setError("");
          setResultados(data.materiales as Material[]);
        }
      } catch {
        if (turno === ultima.current) {
          setError("No se pudo buscar, revisa tu conexión");
          setResultados([]);
        }
      } finally {
        if (turno === ultima.current) setBuscando(false);
      }
    }, RETRASO_MS);
  }

  // Lo único que sí es sincronización: no dejar un temporizador vivo al salir.
  useEffect(() => () => {
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
  }, []);

  function elegir(m: Material) {
    onElegir(m);
    ultima.current++;
    setTexto("");
    setResultados([]);
  }

  return (
    <div className="mat-buscador">
      <input
        className="carnet-input"
        type="search"
        inputMode="search"
        value={texto}
        onChange={(e) => alEscribir(e.target.value)}
        placeholder="Busca el material (mínimo 3 letras)"
        aria-label="Buscar material"
      />
      {buscando && <p className="mat-hint">Buscando…</p>}
      {error !== "" && <p className="carnet-error">{error}</p>}
      {!buscando && error === "" && texto.trim().length >= MINIMO && resultados.length === 0 && (
        <p className="mat-hint">Sin resultados para “{texto.trim()}”.</p>
      )}
      {resultados.length > 0 && (
        <ul className="mat-resultados">
          {resultados.map((m) => (
            <li key={m.codProd}>
              <button type="button" className="mat-resultado" onClick={() => elegir(m)}>
                <span className="mat-desc">{m.descripcion}</span>
                <span className="mat-meta">
                  {m.codProd}
                  {m.unidad ? ` · ${m.unidad}` : ""}
                  {m.existencia === null ? "" : ` · hay ${m.existencia}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
