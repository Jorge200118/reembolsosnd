"use client";
import { useState } from "react";
import type { LineaSolicitud } from "@/lib/materiales/tipos";
import { totalEstimado } from "@/lib/materiales/carrito";

function moneda(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CarritoMaterial({
  lineas,
  onCambiarCantidad,
  onQuitar,
}: {
  lineas: LineaSolicitud[];
  onCambiarCantidad: (codProd: string, cantidad: number) => void;
  onQuitar: (codProd: string) => void;
}) {
  // Borrador de lo que se está tecleando por renglón. Deja que el campo quede
  // vacío un instante (para reescribir "1" -> "3") sin mandarle un 0 al padre,
  // que lo interpretaría como "quitar el renglón". Quitar es la ×, no vaciar.
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  if (lineas.length === 0) {
    return <p className="carnet-empty">Busca y agrega el material que necesitas.</p>;
  }

  const total = totalEstimado(lineas);

  return (
    <>
      {lineas.map((l) => {
        // Se avisa, no se bloquea: la existencia es una foto y almacén tiene la
        // última palabra. Si el dato es desconocido (null) no se dice nada.
        // El ERP maneja existencias negativas (sobrevendido), así que cero o
        // menos se dice como "no hay": el número crudo no le sirve a nadie.
        const exist = l.existenciaAlPedir;
        const agotado = exist !== null && exist <= 0;
        const excede = exist !== null && exist > 0 && l.cantidad > exist;
        return (
          <div className="mat-linea" key={l.codProd}>
            <div className="mat-linea-txt">
              <span className="mat-desc">{l.descripcion}</span>
              <span className="mat-meta">
                {l.codProd}
                {l.unidad ? ` · ${l.unidad}` : ""}
              </span>
              {agotado && <span className="mat-aviso">No hay en existencia</span>}
              {excede && (
                <span className="mat-aviso">
                  Pediste {l.cantidad} y solo hay {exist}
                </span>
              )}
            </div>
            <input
              className="mat-cant"
              type="number"
              min={1}
              inputMode="numeric"
              value={borrador[l.codProd] ?? String(l.cantidad)}
              aria-label={`Cantidad de ${l.descripcion}`}
              onChange={(e) => {
                const bruto = e.target.value;
                setBorrador((b) => ({ ...b, [l.codProd]: bruto }));
                const n = Number(bruto);
                // Solo se confirma un número positivo. Vacío o 0 se quedan en el
                // borrador: el renglón no se toca hasta que teclee algo válido.
                if (Number.isFinite(n) && n > 0) onCambiarCantidad(l.codProd, n);
              }}
              // Al salir del campo se suelta el borrador: si lo dejó vacío, vuelve
              // a mostrar la última cantidad válida en vez de quedarse en blanco.
              onBlur={() =>
                setBorrador((b) => {
                  if (!(l.codProd in b)) return b;
                  const resto = { ...b };
                  delete resto[l.codProd];
                  return resto;
                })
              }
            />
            <button
              type="button"
              className="mat-quitar"
              aria-label={`Quitar ${l.descripcion}`}
              onClick={() => onQuitar(l.codProd)}
            >
              ×
            </button>
          </div>
        );
      })}
      {total > 0 && (
        <div className="carnet-total">
          <span className="k">Costo estimado</span>
          <span className="v">{moneda(total)}</span>
        </div>
      )}
    </>
  );
}
