# Solicitud de Material — PWA del empleado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un empleado arme y envíe una solicitud de material desde su teléfono, y vea el estado de las que ya mandó.

**Architecture:** La lógica del carrito son funciones puras probadas con vitest; la pantalla solo las orquesta. Las escrituras pasan por route handlers de Next que corren con `service_role` y sacan la identidad de la cookie firmada `emp_sesion`, nunca del cuerpo de la petición. La búsqueda usa el `GET /api/materiales` del plan anterior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, vitest + testing-library, `carnet.css` (el estilo de la PWA que ya existe).

**Spec:** `docs/superpowers/specs/2026-07-21-solicitud-material-design.md` (§3.7, §3.8)

**Requisitos previos:** planes `2026-07-21-material-cimientos.md` y `2026-07-21-material-puente-erp.md` completos.

**Reglas del proyecto que aplican aquí:**
- **Cero `alert`, `confirm` o `prompt` nativos.** Avisos con el `Toast` (`useToast().mostrar(mensaje)`) o mensajes en línea.
- La PWA usa `carnet.css`, no Tailwind. Clases disponibles: `carnet-card`, `carnet-cardttl`, `carnet-chip`, `carnet-row`, `carnet-total`, `carnet-btn`, `carnet-btn-2`, `carnet-input`, `carnet-field`, `carnet-empty`, `carnet-error`, `carnet-stencil`, `carnet-link`.
- El empleado sale de la tabla `empleados` (padrón de comidas), **no** de `rnd_empleados`.

---

## File Structure

- **Create** `src/lib/materiales/carrito.ts` — funciones puras del carrito (agregar, cambiar cantidad, quitar, total).
- **Create** `src/lib/materiales/carrito.test.ts` — sus tests.
- **Create** `src/lib/materiales/rpc.ts` — helper para llamar RPCs de Postgres con `service_role`. Un solo lugar que toca la llave.
- **Create** `src/app/api/empleado/materiales/route.ts` — `POST` crea la solicitud, `GET` lista las del empleado.
- **Create** `src/app/api/empleado/materiales/cancelar/route.ts` — `POST` cancela una propia.
- **Create** `src/components/empleado/BuscadorMaterial.tsx` — autocompletado contra `/api/materiales`.
- **Create** `src/components/empleado/CarritoMaterial.tsx` — la lista editable de lo que va a pedir.
- **Create** `src/components/empleado/CarritoMaterial.test.tsx` — test de componente.
- **Create** `src/app/empleado/materiales/page.tsx` — la pantalla.
- **Modify** `src/app/empleado/page.tsx` — tarjeta que lleva al módulo nuevo.
- **Modify** `src/app/empleado/carnet.css` — estilos de las piezas nuevas.

---

## Task 1: Lógica pura del carrito

**Files:**
- Create: `src/lib/materiales/carrito.ts`
- Test: `src/lib/materiales/carrito.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/materiales/carrito.test.ts` con este contenido exacto:

```ts
import { describe, it, expect } from "vitest";
import { agregarMaterial, cambiarCantidad, quitarMaterial, totalEstimado } from "./carrito";
import type { Material, LineaSolicitud } from "./tipos";

const ANGULO: Material = {
  codProd: "ANG130", descripcion: "ANGULO 1/8 X 1 1/4", unidad: "PZ", existencia: 40, costo: 180.5,
};
const TORNILLO: Material = {
  codProd: "TOR001", descripcion: "TORNILLO 1/4", unidad: "PZ", existencia: null, costo: null,
};

describe("carrito de materiales", () => {
  it("agrega un material congelando su costo y existencia del momento", () => {
    const r = agregarMaterial([], ANGULO, 2);
    expect(r).toEqual<LineaSolicitud[]>([
      {
        codProd: "ANG130",
        descripcion: "ANGULO 1/8 X 1 1/4",
        unidad: "PZ",
        cantidad: 2,
        costoUnitario: 180.5,
        existenciaAlPedir: 40,
      },
    ]);
  });

  it("agregar dos veces el mismo material suma cantidades, no duplica renglones", () => {
    const r = agregarMaterial(agregarMaterial([], ANGULO, 2), ANGULO, 3);
    expect(r).toHaveLength(1);
    expect(r[0]!.cantidad).toBe(5);
  });

  it("ignora cantidades no positivas al agregar", () => {
    expect(agregarMaterial([], ANGULO, 0)).toEqual([]);
    expect(agregarMaterial([], ANGULO, -1)).toEqual([]);
    expect(agregarMaterial([], ANGULO, Number.NaN)).toEqual([]);
  });

  it("cambiar la cantidad a cero o menos quita el renglón", () => {
    const con2 = agregarMaterial([], ANGULO, 2);
    expect(cambiarCantidad(con2, "ANG130", 7)[0]!.cantidad).toBe(7);
    expect(cambiarCantidad(con2, "ANG130", 0)).toEqual([]);
    expect(cambiarCantidad(con2, "ANG130", -3)).toEqual([]);
  });

  it("quitar un material que no está no altera el carrito", () => {
    const con2 = agregarMaterial([], ANGULO, 2);
    expect(quitarMaterial(con2, "NOEXISTE")).toEqual(con2);
    expect(quitarMaterial(con2, "ANG130")).toEqual([]);
  });

  it("el total suma cantidad x costo y trata el costo desconocido como cero", () => {
    const carrito = agregarMaterial(agregarMaterial([], ANGULO, 2), TORNILLO, 10);
    expect(totalEstimado(carrito)).toBe(361);
    expect(totalEstimado([])).toBe(0);
  });

  it("no muta el arreglo que recibe", () => {
    const original = agregarMaterial([], ANGULO, 2);
    const copia = JSON.parse(JSON.stringify(original));
    agregarMaterial(original, TORNILLO, 1);
    cambiarCantidad(original, "ANG130", 9);
    quitarMaterial(original, "ANG130");
    expect(original).toEqual(copia);
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

```bash
npx vitest run src/lib/materiales/carrito.test.ts
```

Esperado: **FALLA** con `Failed to resolve import "./carrito"`.

- [ ] **Step 3: Implementar el carrito**

Crea `src/lib/materiales/carrito.ts` con este contenido exacto:

```ts
import type { Material, LineaSolicitud } from "./tipos";

// El carrito es un arreglo inmutable de líneas. Todo lo que viene del ERP
// (costo y existencia) se congela aquí, en el momento de agregar: es el dato
// que se guardará en la solicitud y que verá el gerente al autorizar.

function esCantidadValida(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function agregarMaterial(
  lineas: readonly LineaSolicitud[],
  material: Material,
  cantidad: number,
): LineaSolicitud[] {
  if (!esCantidadValida(cantidad)) return [...lineas];
  const i = lineas.findIndex((l) => l.codProd === material.codProd);
  if (i >= 0) {
    const copia = [...lineas];
    copia[i] = { ...copia[i]!, cantidad: copia[i]!.cantidad + cantidad };
    return copia;
  }
  return [
    ...lineas,
    {
      codProd: material.codProd,
      descripcion: material.descripcion,
      unidad: material.unidad,
      cantidad,
      costoUnitario: material.costo,
      existenciaAlPedir: material.existencia,
    },
  ];
}

export function cambiarCantidad(
  lineas: readonly LineaSolicitud[],
  codProd: string,
  cantidad: number,
): LineaSolicitud[] {
  if (!esCantidadValida(cantidad)) return lineas.filter((l) => l.codProd !== codProd);
  return lineas.map((l) => (l.codProd === codProd ? { ...l, cantidad } : l));
}

export function quitarMaterial(
  lineas: readonly LineaSolicitud[],
  codProd: string,
): LineaSolicitud[] {
  return lineas.filter((l) => l.codProd !== codProd);
}

/** Suma cantidad x costo. El costo desconocido cuenta como 0: es una estimación,
 *  no una cifra contable, y es mejor quedarse corto que inventar un precio. */
export function totalEstimado(lineas: readonly LineaSolicitud[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * (l.costoUnitario ?? 0), 0);
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

```bash
npx vitest run src/lib/materiales/carrito.test.ts
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/materiales/carrito.ts src/lib/materiales/carrito.test.ts
git commit -m "feat(material): logica pura del carrito de solicitud"
```

---

## Task 2: Helper de RPC con `service_role`

**Files:**
- Create: `src/lib/materiales/rpc.ts`
- Modify: `.env.local`

- [ ] **Step 1: Habilitar la llave de servicio**

En `.env.local` está la línea comentada `# SUPABASE_SERVICE_ROLE_KEY=`. Descoméntala y ponle el valor real (Supabase → Project Settings → API → `service_role`, la llave legacy que empieza con `eyJ`).

Verifica que quedó cargada:

```bash
node -e "require('dotenv').config({path:'.env.local'}); console.log(process.env.SUPABASE_SERVICE_ROLE_KEY ? 'definida, largo ' + process.env.SUPABASE_SERVICE_ROLE_KEY.length : 'FALTA')"
```

Esperado: `definida, largo <n>` con n > 100. Si dice `FALTA`, nada de lo que sigue va a funcionar.

- [ ] **Step 2: Escribir el helper**

Crea `src/lib/materiales/rpc.ts` con este contenido exacto:

```ts
// Único lugar del módulo que toca la llave de servicio. Las RPCs `material_*`
// tienen `execute` revocado a anon y authenticated (migración 0021), así que
// esta es la única forma de escribir; nunca se debe llamar desde el navegador.

export interface RespuestaRpc {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

export async function llamarRpcMaterial(
  nombre: string,
  args: Record<string, unknown>,
): Promise<RespuestaRpc> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio) {
    return { ok: false, error: "Falta configuración del servidor (SUPABASE_SERVICE_ROLE_KEY)" };
  }
  const res = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: servicio,
      Authorization: `Bearer ${servicio}`,
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    console.error(`[material] RPC ${nombre} falló (${res.status}): ${detalle}`);
    return { ok: false, error: "No se pudo completar la operación" };
  }
  // Las RPCs devuelven jsonb {ok, ...}; PostgREST lo entrega tal cual.
  return (await res.json()) as RespuestaRpc;
}

/** Lectura con service_role (salta RLS). Devuelve el JSON crudo de PostgREST. */
export async function leerTablaMaterial(consulta: string): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio) throw new Error("Falta configuración del servidor");
  const res = await fetch(`${url}/rest/v1/${consulta}`, {
    headers: { apikey: servicio, Authorization: `Bearer ${servicio}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/materiales/rpc.ts
git commit -m "feat(material): helper para llamar las RPCs con service_role"
```

---

## Task 3: Route handlers del empleado

**Files:**
- Create: `src/app/api/empleado/materiales/route.ts`
- Create: `src/app/api/empleado/materiales/cancelar/route.ts`

- [ ] **Step 1: Escribir el handler de crear y listar**

Crea `src/app/api/empleado/materiales/route.ts` con este contenido exacto:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial, leerTablaMaterial } from "@/lib/materiales/rpc";

// La identidad SIEMPRE sale de la cookie firmada, nunca del body: si viniera
// del cliente, cualquiera podría pedir material a nombre de otro empleado.

async function sesionDe(): Promise<{ empleadoId: number; nombre: string } | null> {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  if (!secret || !token) return null;
  return verificarEmpSesion(token, secret);
}

interface LineaEntrante {
  codProd?: unknown;
  descripcion?: unknown;
  unidad?: unknown;
  cantidad?: unknown;
  costoUnitario?: unknown;
  existenciaAlPedir?: unknown;
}

function aLineaRpc(l: LineaEntrante) {
  const cantidad = Number(l.cantidad);
  return {
    cod_prod: String(l.codProd ?? "").trim(),
    descripcion: String(l.descripcion ?? "").trim(),
    unidad: l.unidad == null ? null : String(l.unidad).trim(),
    cantidad,
    costo_unitario: l.costoUnitario == null ? null : Number(l.costoUnitario),
    existencia_al_pedir: l.existenciaAlPedir == null ? null : Number(l.existenciaAlPedir),
  };
}

export async function POST(req: Request) {
  const sesion = await sesionDe();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { nota?: unknown; lineas?: unknown };
  const entrantes = Array.isArray(body.lineas) ? (body.lineas as LineaEntrante[]) : [];
  const lineas = entrantes.map(aLineaRpc);

  // Se valida aquí Y en la RPC. Aquí para dar un mensaje bonito; allá porque
  // la base no debe confiar en que alguien haya validado antes.
  if (lineas.length === 0) {
    return NextResponse.json({ ok: false, error: "Agrega al menos un material" }, { status: 400 });
  }
  if (lineas.some((l) => !l.cod_prod || !l.descripcion || !Number.isFinite(l.cantidad) || l.cantidad <= 0)) {
    return NextResponse.json({ ok: false, error: "Hay materiales con cantidad inválida" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_crear", {
    p_empleado_id: sesion.empleadoId,
    p_nota: typeof body.nota === "string" ? body.nota : null,
    p_lineas: lineas,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function GET() {
  const sesion = await sesionDe();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const campos =
    "id,folio,estado,nota,creado_en,fecha_autorizacion,motivo_rechazo,fecha_entrega," +
    "rnd_material_lineas(id,orden,cod_prod,descripcion,unidad,cantidad,cantidad_entregada,costo_unitario)";
  const consulta =
    `rnd_material_solicitudes?empleado_id=eq.${sesion.empleadoId}` +
    `&select=${encodeURIComponent(campos)}&order=creado_en.desc&limit=30`;

  try {
    const solicitudes = await leerTablaMaterial(consulta);
    return NextResponse.json({ ok: true, solicitudes });
  } catch (e) {
    console.error("[material] no se pudieron leer las solicitudes:", e);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus solicitudes" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Escribir el handler de cancelar**

Crea `src/app/api/empleado/materiales/cancelar/route.ts` con este contenido exacto:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";

export async function POST(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  // La RPC verifica que la solicitud sea de este empleado y siga pendiente.
  const r = await llamarRpcMaterial("material_cancelar", {
    p_id: id,
    p_empleado_id: sesion.empleadoId,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
```

- [ ] **Step 3: Probar los handlers con sesión real**

Levanta la app (`npm run dev`), entra a `http://localhost:3000/empleado` con un empleado registrado y, en la consola del navegador:

```js
// Crear
await (await fetch('/api/empleado/materiales', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nota: 'prueba desde consola', lineas: [
    { codProd: 'ANG130', descripcion: 'ANGULO 1/8', unidad: 'PZ', cantidad: 2, costoUnitario: 180.5, existenciaAlPedir: 40 }
  ]})
})).json()
```

Esperado: `{ ok: true, id: "...", folio: "SM-0000NN", lineas: 1 }`.

```js
// Listar
await (await fetch('/api/empleado/materiales')).json()
```

Esperado: `{ ok: true, solicitudes: [ { folio: "SM-...", estado: "pendiente", rnd_material_lineas: [ ... ] } ] }`.

```js
// Rechazar entrada inválida
await (await fetch('/api/empleado/materiales', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ lineas: [] })
})).json()
```

Esperado: `{ ok: false, error: "Agrega al menos un material" }` con status 400.

```js
// Cancelar (usa el id que devolvió el primer paso)
await (await fetch('/api/empleado/materiales/cancelar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: '<el-id>' })
})).json()
```

Esperado: `{ ok: true, estado: "cancelada" }`. Repetirlo devuelve `{ ok: false, error: "Ya no se puede cancelar: está cancelada" }`.

- [ ] **Step 4: Verificar que sin sesión no se puede escribir**

```bash
curl -s -X POST "http://localhost:3000/api/empleado/materiales" -H "Content-Type: application/json" -d '{"lineas":[{"codProd":"X","descripcion":"X","cantidad":1}]}'
```

Esperado: `{"ok":false,"error":"No autorizado"}` con status 401.

- [ ] **Step 5: Limpiar las pruebas**

Vía MCP `execute_sql`:

```sql
delete from public.rnd_material_solicitudes where nota = 'prueba desde consola';
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/empleado/materiales
git commit -m "feat(material): route handlers de crear, listar y cancelar solicitudes"
```

---

## Task 4: Buscador de materiales

**Files:**
- Create: `src/components/empleado/BuscadorMaterial.tsx`

- [ ] **Step 1: Escribir el componente**

Crea `src/components/empleado/BuscadorMaterial.tsx` con este contenido exacto:

```tsx
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

  useEffect(() => {
    const q = texto.trim();
    if (q.length < MINIMO) {
      setResultados([]);
      setError("");
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const id = window.setTimeout(async () => {
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
    return () => window.clearTimeout(id);
  }, [texto]);

  function elegir(m: Material) {
    onElegir(m);
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
        onChange={(e) => setTexto(e.target.value)}
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
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/empleado/BuscadorMaterial.tsx
git commit -m "feat(material): buscador con autocompletado contra el catalogo del ERP"
```

---

## Task 5: Carrito visual

**Files:**
- Create: `src/components/empleado/CarritoMaterial.tsx`
- Test: `src/components/empleado/CarritoMaterial.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/components/empleado/CarritoMaterial.test.tsx` con este contenido exacto:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CarritoMaterial } from "./CarritoMaterial";
import type { LineaSolicitud } from "@/lib/materiales/tipos";

const LINEAS: LineaSolicitud[] = [
  { codProd: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", cantidad: 2, costoUnitario: 180.5, existenciaAlPedir: 40 },
  { codProd: "TOR001", descripcion: "TORNILLO 1/4", unidad: "PZ", cantidad: 10, costoUnitario: null, existenciaAlPedir: null },
];

describe("CarritoMaterial", () => {
  it("muestra un renglón por material con su cantidad", () => {
    render(<CarritoMaterial lineas={LINEAS} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText("ANGULO 1/8")).toBeInTheDocument();
    expect(screen.getByText("TORNILLO 1/4")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de ANGULO 1/8")).toHaveValue(2);
  });

  it("avisa cuando se pide más de lo que hay en existencia", () => {
    const sinInventario: LineaSolicitud[] = [
      { ...LINEAS[0]!, cantidad: 100, existenciaAlPedir: 40 },
    ];
    render(<CarritoMaterial lineas={sinInventario} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText(/solo hay 40/i)).toBeInTheDocument();
  });

  it("no avisa de existencia cuando el dato es desconocido", () => {
    render(<CarritoMaterial lineas={[LINEAS[1]!]} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.queryByText(/solo hay/i)).not.toBeInTheDocument();
  });

  it("avisa al cambiar cantidad y al quitar", () => {
    const cambiar = vi.fn();
    const quitar = vi.fn();
    render(<CarritoMaterial lineas={LINEAS} onCambiarCantidad={cambiar} onQuitar={quitar} />);
    fireEvent.change(screen.getByLabelText("Cantidad de ANGULO 1/8"), { target: { value: "5" } });
    expect(cambiar).toHaveBeenCalledWith("ANG130", 5);
    fireEvent.click(screen.getByLabelText("Quitar ANGULO 1/8"));
    expect(quitar).toHaveBeenCalledWith("ANG130");
  });

  it("con el carrito vacío invita a buscar y no muestra total", () => {
    render(<CarritoMaterial lineas={[]} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText(/busca y agrega/i)).toBeInTheDocument();
    expect(screen.queryByText(/estimado/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
npx vitest run src/components/empleado/CarritoMaterial.test.tsx
```

Esperado: **FALLA** con `Failed to resolve import "./CarritoMaterial"`.

- [ ] **Step 3: Escribir el componente**

Crea `src/components/empleado/CarritoMaterial.tsx` con este contenido exacto:

```tsx
"use client";
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
  if (lineas.length === 0) {
    return <p className="carnet-empty">Busca y agrega el material que necesitas.</p>;
  }

  const total = totalEstimado(lineas);

  return (
    <>
      {lineas.map((l) => {
        // Se avisa, no se bloquea: la existencia es una foto y almacén tiene la
        // última palabra. Si el dato es desconocido (null) no se dice nada.
        const excede = l.existenciaAlPedir !== null && l.cantidad > l.existenciaAlPedir;
        return (
          <div className="mat-linea" key={l.codProd}>
            <div className="mat-linea-txt">
              <span className="mat-desc">{l.descripcion}</span>
              <span className="mat-meta">
                {l.codProd}
                {l.unidad ? ` · ${l.unidad}` : ""}
              </span>
              {excede && (
                <span className="mat-aviso">
                  Pediste {l.cantidad} y solo hay {l.existenciaAlPedir}
                </span>
              )}
            </div>
            <input
              className="mat-cant"
              type="number"
              min={1}
              inputMode="numeric"
              value={l.cantidad}
              aria-label={`Cantidad de ${l.descripcion}`}
              onChange={(e) => onCambiarCantidad(l.codProd, Number(e.target.value))}
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
```

- [ ] **Step 4: Correr el test para verlo pasar**

```bash
npx vitest run src/components/empleado/CarritoMaterial.test.tsx
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/empleado/CarritoMaterial.tsx src/components/empleado/CarritoMaterial.test.tsx
git commit -m "feat(material): carrito visual con aviso de existencia insuficiente"
```

---

## Task 6: La pantalla del empleado

**Files:**
- Create: `src/app/empleado/materiales/page.tsx`
- Modify: `src/app/empleado/carnet.css`

- [ ] **Step 1: Agregar los estilos**

Agrega al final de `src/app/empleado/carnet.css`:

```css
/* ── Módulo de material ─────────────────────────────────────────────── */
.mat-buscador { position: relative; }
.mat-hint { margin: 6px 2px 0; font-size: 13px; color: #7c8ea3; font-family: var(--font-work), sans-serif; }
.mat-resultados { list-style: none; margin: 8px 0 0; padding: 0; max-height: 46vh; overflow-y: auto; }
.mat-resultados li { margin-bottom: 6px; }
.mat-resultado {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 12px;
  background: #fff; cursor: pointer; font-family: var(--font-work), sans-serif;
}
.mat-resultado:hover { border-color: #2563eb; background: #f8fbff; }
.mat-desc { font-size: 14px; font-weight: 600; color: #0f2942; }
.mat-meta { font-size: 12px; color: #7c8ea3; }
.mat-aviso { font-size: 12px; font-weight: 600; color: #b45309; }
.mat-linea {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid #eef2f7;
}
.mat-linea-txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.mat-cant {
  width: 68px; padding: 8px; text-align: center; border: 1px solid #cbd5e1;
  border-radius: 10px; font-size: 15px; font-family: var(--font-work), sans-serif;
}
.mat-quitar {
  width: 32px; height: 32px; border: none; border-radius: 50%;
  background: #fee2e2; color: #b91c1c; font-size: 18px; line-height: 1; cursor: pointer;
}
.mat-estado {
  display: inline-block; padding: 2px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
}
.mat-estado-pendiente  { background: #fef3c7; color: #92400e; }
.mat-estado-autorizada { background: #dbeafe; color: #1e40af; }
.mat-estado-entregada  { background: #d1fae5; color: #065f46; }
.mat-estado-rechazada  { background: #fee2e2; color: #991b1b; }
.mat-estado-cancelada  { background: #e2e8f0; color: #475569; }
```

- [ ] **Step 2: Escribir la pantalla**

Crea `src/app/empleado/materiales/page.tsx` con este contenido exacto:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/empleado/Toast";
import { BuscadorMaterial } from "@/components/empleado/BuscadorMaterial";
import { CarritoMaterial } from "@/components/empleado/CarritoMaterial";
import { agregarMaterial, cambiarCantidad, quitarMaterial } from "@/lib/materiales/carrito";
import type { Material, LineaSolicitud } from "@/lib/materiales/tipos";

// Nombres propios (`Mia`) a propósito: esta es la forma RECORTADA que ve el
// empleado. El escritorio usa una más ancha (con empleado_nombre, sucursal,
// costos) que vivirá en `SolicitudGuardada`. Dos vistas, dos tipos, sin que
// uno finja ser el otro.
interface LineaMia {
  id: string; cod_prod: string; descripcion: string; unidad: string | null;
  cantidad: number; cantidad_entregada: number | null;
}
interface SolicitudMia {
  id: string; folio: string; estado: string; nota: string | null; creado_en: string;
  motivo_rechazo: string | null;
  rnd_material_lineas: LineaMia[];
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Esperando a tu gerente",
  autorizada: "Autorizada, pásala a almacén",
  entregada: "Entregada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function MaterialesEmpleado() {
  const router = useRouter();
  const { mostrar } = useToast();
  const [lineas, setLineas] = useState<LineaSolicitud[]>([]);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudMia[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/empleado/materiales");
    if (res.status === 401) { router.replace("/empleado/login"); return; }
    const data = await res.json();
    if (data.ok) setSolicitudes(data.solicitudes as SolicitudMia[]);
    setCargando(false);
  }, [router]);

  useEffect(() => { void cargar(); }, [cargar]);

  function onElegir(m: Material) {
    setLineas((prev) => agregarMaterial(prev, m, 1));
    mostrar(`${m.descripcion} agregado`);
  }

  async function enviar() {
    if (lineas.length === 0 || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/empleado/materiales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: nota.trim() || null, lineas }),
      });
      const data = await res.json();
      if (data.ok) {
        mostrar(`Solicitud ${data.folio} enviada`);
        setLineas([]);
        setNota("");
        await cargar();
      } else {
        mostrar(String(data.error ?? "No se pudo enviar"));
      }
    } catch {
      mostrar("No se pudo enviar, revisa tu conexión");
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(id: string) {
    const res = await fetch("/api/empleado/materiales/cancelar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    mostrar(data.ok ? "Solicitud cancelada" : String(data.error ?? "No se pudo cancelar"));
    if (data.ok) await cargar();
  }

  return (
    <>
      <div className="carnet-topbar">
        <div className="carnet-hola">Pedir material<small>Aceros del Pacífico</small></div>
        <Link className="carnet-salir" href="/empleado">Volver</Link>
      </div>

      <div className="carnet-card">
        <div className="carnet-cardttl">
          <span className="carnet-stencil">Nueva solicitud</span>
          {lineas.length > 0 && <span className="carnet-chip">{lineas.length}</span>}
        </div>
        <BuscadorMaterial onElegir={onElegir} />
        <CarritoMaterial
          lineas={lineas}
          onCambiarCantidad={(cod, cant) => setLineas((p) => cambiarCantidad(p, cod, cant))}
          onQuitar={(cod) => setLineas((p) => quitarMaterial(p, cod))}
        />
        {lineas.length > 0 && (
          <>
            <div className="carnet-field" style={{ marginTop: 12 }}>
              <input
                className="carnet-input"
                type="text"
                value={nota}
                maxLength={200}
                onChange={(e) => setNota(e.target.value)}
                placeholder="¿Para qué lo necesitas? (opcional)"
                aria-label="Nota"
              />
            </div>
            <button className="carnet-btn" type="button" style={{ marginTop: 12 }} disabled={enviando} onClick={enviar}>
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>
          </>
        )}
      </div>

      <div className="carnet-card">
        <div className="carnet-cardttl">
          <span className="carnet-stencil">Mis solicitudes</span>
        </div>
        {cargando ? (
          <p className="carnet-empty">Cargando…</p>
        ) : solicitudes.length === 0 ? (
          <p className="carnet-empty">Todavía no has pedido material.</p>
        ) : (
          solicitudes.map((s) => (
            <div className="mat-linea" key={s.id}>
              <div className="mat-linea-txt">
                <span className="mat-desc">
                  {s.folio} · {fechaCorta(s.creado_en)}
                </span>
                <span className="mat-meta">
                  {s.rnd_material_lineas.length} material{s.rnd_material_lineas.length !== 1 ? "es" : ""}
                  {" · "}
                  {s.rnd_material_lineas.map((l) => `${l.cantidad} ${l.descripcion}`).join(", ")}
                </span>
                <span className={`mat-estado mat-estado-${s.estado}`}>
                  {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                </span>
                {s.motivo_rechazo && <span className="mat-aviso">Motivo: {s.motivo_rechazo}</span>}
              </div>
              {s.estado === "pendiente" && (
                <button type="button" className="mat-quitar" aria-label={`Cancelar ${s.folio}`} onClick={() => cancelar(s.id)}>
                  ×
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Probar la pantalla completa a mano**

```bash
npm run dev
```

Con censos-web corriendo, entra a `http://localhost:3000/empleado/materiales` con un empleado registrado y verifica:

1. Escribir 2 letras no dispara búsqueda; con 3 aparecen resultados reales del ERP.
2. Al elegir uno se agrega al carrito con cantidad 1 y sale el toast (no un `alert`).
3. Elegir el mismo material dos veces suma cantidades en un solo renglón.
4. Subir la cantidad por encima de la existencia muestra el aviso ámbar y **deja enviar igual**.
5. Enviar limpia el formulario y la solicitud aparece abajo con estado "Esperando a tu gerente".
6. El botón × cancela y el estado pasa a "Cancelada"; después de eso ya no aparece el ×.

- [ ] **Step 4: Commit**

```bash
git add src/app/empleado/materiales/page.tsx src/app/empleado/carnet.css
git commit -m "feat(material): pantalla del empleado para pedir material"
```

---

## Task 7: Entrada desde la home del empleado

**Files:**
- Modify: `src/app/empleado/page.tsx`

- [ ] **Step 1: Agregar la tarjeta**

En `src/app/empleado/page.tsx`, importa `Link` arriba (junto a los demás imports):

```tsx
import Link from "next/link";
```

Y justo **después** de `<AvisosCard />` (línea 84), agrega:

```tsx
      <Link href="/empleado/materiales" className="carnet-card" style={{ display: "block", textDecoration: "none" }}>
        <div className="carnet-cardttl">
          <span className="carnet-stencil">Pedir material</span>
        </div>
        <p className="carnet-empty" style={{ margin: 0 }}>
          Pide lo que necesitas del almacén. Tu gerente lo autoriza.
        </p>
      </Link>
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

Abre `http://localhost:3000/empleado`: la tarjeta aparece bajo los avisos, tanto si hay comidas por cobrar como si no, y lleva a la pantalla de material.

- [ ] **Step 3: Commit**

```bash
git add src/app/empleado/page.tsx
git commit -m "feat(material): acceso a pedir material desde la home del empleado"
```

---

## Verificación final del plan

- [ ] `npx vitest run` → verde (carrito 7 tests, CarritoMaterial 5 tests, normalizador 5 tests, más los que ya existían).
- [ ] `npx tsc --noEmit -p tsconfig.json` → sin errores.
- [ ] `npm run build` → compila sin errores.
- [ ] Recorrido manual completo: buscar → agregar → ajustar cantidad → enviar → verla en "Mis solicitudes" → cancelarla.
- [ ] **Cero `alert`, `confirm` o `prompt`** en el código nuevo. Compruébalo: `grep -rnE "\b(alert|confirm|prompt)\(" src/app/empleado src/components/empleado` no debe traer nada del módulo de material.
- [ ] No quedan solicitudes de prueba en la base.
- [ ] **Nada pusheado.**

**Siguiente plan:** `2026-07-21-material-escritorio.md` — las pantallas de gerente y almacén, y los avisos push.
