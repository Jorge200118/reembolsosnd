# Solicitud de Material — Escritorio (gerente y almacén) + avisos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el ciclo: que el gerente autorice o rechace las solicitudes de su sucursal, que almacén capture lo que entregó realmente, y que al empleado le llegue el aviso.

**Architecture:** Las pantallas leen directo de Supabase con la anon key (como el resto del escritorio) usando TanStack Query, y escriben por route handlers que llaman las RPCs con `service_role`. Los avisos push se disparan desde esos mismos route handlers, que ya tienen la llave de servicio.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Tailwind v4, TypeScript, vitest + testing-library, Supabase Edge Functions (Deno).

**Spec:** `docs/superpowers/specs/2026-07-21-solicitud-material-design.md` (§3.7, §3.9, §3.10, §3.12)

**Requisitos previos:** los tres planes anteriores completos (`material-cimientos`, `material-puente-erp`, `material-pwa-empleado`).

**Desviación consciente respecto al spec:** el spec decía "reusa `LoteCard`". Al leerlo se ve que ese componente trae el texto **"Lote X"** y **"N reembolsos"** escrito a mano, así que reusarlo mostraría palabras equivocadas. En vez de generalizar un componente que hoy usan Entregas y Reportes (refactor con riesgo para algo que no lo pidió), se crea `SolicitudCard`, hermano suyo y calcado en estructura. Lo que sí se reusa tal cual: `PageHeader`, `Card`, `Chip`, `Money`, `ConfirmDialog` y `useGuardedAction`.

**Trust level, dicho claro:** la sesión del escritorio (`rnd_sesion`) es JSON sin firmar, así que el nombre que se guarda en `autorizado_por` / `entregado_por` es un rastro, no una prueba criptográfica. Es exactamente el mismo nivel que tiene hoy autorizar reembolsos. No lo empeoramos ni pretendemos que sea más de lo que es.

---

## File Structure

- **Create** `src/lib/supabase/queries/materiales.ts` — lectura de solicitudes por sucursal y estado.
- **Create** `src/lib/hooks/useSolicitudesMaterial.ts` — el hook de lectura (TanStack Query).
- **Create** `src/lib/hooks/useAccionesMaterial.ts` — las tres mutaciones (autorizar, rechazar, entregar).
- **Create** `src/lib/materiales/totales.ts` — cálculo de totales de una solicitud guardada.
- **Create** `src/lib/materiales/totales.test.ts` — sus tests.
- **Create** `src/components/materiales/SolicitudCard.tsx` — tarjeta con resumen y detalle expandible.
- **Create** `src/components/materiales/TablaLineas.tsx` — el detalle: una tabla, en modo lectura o captura.
- **Create** `src/components/materiales/TablaLineas.test.tsx` — sus tests.
- **Create** `src/app/api/materiales/autorizar/route.ts`, `.../rechazar/route.ts`, `.../entregar/route.ts`.
- **Create** `src/lib/materiales/avisar.ts` — dispara el push, compartido por los tres handlers.
- **Create** `src/app/(app)/materiales-gerente/page.tsx` y `src/app/(app)/materiales-almacen/page.tsx`.
- **Modify** `src/components/nav/Sidebar.tsx` — enciende las dos rutas en `RUTAS_EXISTENTES`.
- **Modify** `supabase/functions/enviar-push/mensajes.ts` y `mensajes.test.ts` — tres tipos nuevos.

---

## Task 1: Totales de una solicitud

**Files:**
- Create: `src/lib/materiales/totales.ts`
- Test: `src/lib/materiales/totales.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `src/lib/materiales/totales.test.ts` con este contenido exacto:

```ts
import { describe, it, expect } from "vitest";
import { totalDeLineas, hayFaltantes } from "./totales";
import type { LineaGuardada } from "./totales";

const LINEAS: LineaGuardada[] = [
  { id: "1", orden: 0, cod_prod: "ANG130", descripcion: "ANGULO", unidad: "PZ", cantidad: 2, costo_unitario: 180.5, existencia_al_pedir: 40, cantidad_entregada: null },
  { id: "2", orden: 1, cod_prod: "TOR001", descripcion: "TORNILLO", unidad: "PZ", cantidad: 10, costo_unitario: null, existencia_al_pedir: null, cantidad_entregada: null },
];

describe("totalDeLineas", () => {
  it("suma cantidad x costo tratando el costo desconocido como cero", () => {
    expect(totalDeLineas(LINEAS)).toBe(361);
  });

  it("una solicitud sin líneas vale cero", () => {
    expect(totalDeLineas([])).toBe(0);
  });
});

describe("hayFaltantes", () => {
  it("no marca faltante cuando todo alcanza o se desconoce", () => {
    // ANGULO: 2 pedidos de 40 que hay. TORNILLO: existencia desconocida.
    expect(hayFaltantes(LINEAS)).toBe(false);
  });

  it("no marca faltante si alcanza la existencia", () => {
    const holgado: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad: 2, existencia_al_pedir: 40 }];
    expect(hayFaltantes(holgado)).toBe(false);
  });

  it("no marca faltante cuando la existencia es desconocida", () => {
    expect(hayFaltantes([LINEAS[1]!])).toBe(false);
  });

  it("marca faltante cuando la cantidad supera la existencia", () => {
    const corto: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad: 100, existencia_al_pedir: 40 }];
    expect(hayFaltantes(corto)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

```bash
npx vitest run src/lib/materiales/totales.test.ts
```

Esperado: **FALLA** con `Failed to resolve import "./totales"`.

- [ ] **Step 3: Implementar**

Crea `src/lib/materiales/totales.ts` con este contenido exacto:

```ts
/** Una línea tal como viene de la base (nombres de columna, no camelCase). */
export interface LineaGuardada {
  id: string;
  orden: number;
  cod_prod: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costo_unitario: number | null;
  existencia_al_pedir: number | null;
  cantidad_entregada: number | null;
}

export interface SolicitudGuardada {
  id: string;
  folio: string;
  empleado_nombre: string;
  sucursal: string;
  nota: string | null;
  estado: string;
  creado_en: string;
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  motivo_rechazo: string | null;
  entregado_por: string | null;
  fecha_entrega: string | null;
  rnd_material_lineas: LineaGuardada[];
}

/** Costo estimado de la solicitud. El costo desconocido cuenta como 0: es una
 *  estimación para decidir, no una cifra contable. */
export function totalDeLineas(lineas: readonly LineaGuardada[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * (l.costo_unitario ?? 0), 0);
}

/** ¿Alguna línea pide más de lo que había en existencia al momento de pedir?
 *  Existencia desconocida (null) no cuenta como faltante: no sabemos. */
export function hayFaltantes(lineas: readonly LineaGuardada[]): boolean {
  return lineas.some((l) => l.existencia_al_pedir !== null && l.cantidad > l.existencia_al_pedir);
}
```

- [ ] **Step 4: Correr los tests para verlos pasar**

```bash
npx vitest run src/lib/materiales/totales.test.ts
```

Esperado: PASS, 6 tests (con el caso corregido en el Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/materiales/totales.ts src/lib/materiales/totales.test.ts
git commit -m "feat(material): totales y deteccion de faltantes de una solicitud"
```

---

## Task 2: Lectura de solicitudes

**Files:**
- Create: `src/lib/supabase/queries/materiales.ts`
- Create: `src/lib/hooks/useSolicitudesMaterial.ts`

- [ ] **Step 1: Escribir la query**

Crea `src/lib/supabase/queries/materiales.ts` con este contenido exacto:

```ts
import { supabase } from "@/lib/supabase/client";
import type { SolicitudGuardada } from "@/lib/materiales/totales";

const CAMPOS =
  "id,folio,empleado_nombre,sucursal,nota,estado,creado_en," +
  "autorizado_por,fecha_autorizacion,motivo_rechazo,entregado_por,fecha_entrega," +
  "rnd_material_lineas(id,orden,cod_prod,descripcion,unidad,cantidad,costo_unitario,existencia_al_pedir,cantidad_entregada)";

export interface FiltroSolicitudes {
  /** Abreviatura de sucursal (LMM, FTE...). `null` = todas (solo admin). */
  sucursal: string | null;
  /** Estados a incluir. */
  estados: string[];
  limite?: number;
}

/**
 * Lee solicitudes de material con sus líneas. La lectura va directa con la
 * anon key, igual que el resto del escritorio; escribir es imposible por esa
 * vía (las tablas no tienen políticas de escritura, migración 0020).
 */
export async function listarSolicitudes(f: FiltroSolicitudes): Promise<SolicitudGuardada[]> {
  let q = supabase
    .from("rnd_material_solicitudes")
    .select(CAMPOS)
    .in("estado", f.estados)
    .order("creado_en", { ascending: false })
    .limit(f.limite ?? 100);

  if (f.sucursal) q = q.eq("sucursal", f.sucursal);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SolicitudGuardada[];
}
```

- [ ] **Step 2: Escribir el hook**

Crea `src/lib/hooks/useSolicitudesMaterial.ts` con este contenido exacto:

```ts
import { useQuery } from "@tanstack/react-query";
import { listarSolicitudes, type FiltroSolicitudes } from "@/lib/supabase/queries/materiales";

export function useSolicitudesMaterial(f: FiltroSolicitudes) {
  return useQuery({
    // La sucursal y los estados van en la llave: si cambian, se refetchea.
    queryKey: ["materiales", f.sucursal, ...f.estados],
    queryFn: () => listarSolicitudes(f),
  });
}
```

- [ ] **Step 3: Verificar contra la base**

Crea una solicitud de prueba desde la PWA (o vía MCP `execute_sql` llamando `material_crear`), y comprueba que la query trae las líneas anidadas:

```sql
select s.folio, s.sucursal, s.estado, count(l.id) as lineas
  from public.rnd_material_solicitudes s
  left join public.rnd_material_lineas l on l.solicitud_id = s.id
 group by s.folio, s.sucursal, s.estado;
```

Esperado: al menos una fila con `lineas > 0`. Si `rnd_material_lineas` no se anida en PostgREST, es que la llave foránea no existe: revisa la migración 0020.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/queries/materiales.ts src/lib/hooks/useSolicitudesMaterial.ts
git commit -m "feat(material): lectura de solicitudes por sucursal y estado"
```

---

## Task 3: Avisos push (mensajes)

**Files:**
- Modify: `supabase/functions/enviar-push/mensajes.ts`
- Test: `supabase/functions/enviar-push/mensajes.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agrega al final de `supabase/functions/enviar-push/mensajes.test.ts`:

```ts
describe("mensajes de material", () => {
  it("cada tipo de material tiene su texto y lleva a la pantalla de material", () => {
    const row = { empleado_id: 7, endpoint: "e", p256dh: "p", auth: "a" };
    for (const tipo of ["material_autorizada", "material_rechazada", "material_entregada"] as const) {
      const m = mensaje(tipo, row);
      expect(m.title).toBe("Vales AC");
      expect(m.body.length).toBeGreaterThan(10);
      expect(m.url).toBe("/empleado/materiales");
    }
  });

  it("los tags de material son cortos y distintos entre sí", () => {
    const tags = new Set(
      (["material_autorizada", "material_rechazada", "material_entregada"] as const)
        .map((t) => topicCorto(t, 7)),
    );
    expect(tags.size).toBe(3);
    for (const t of tags) expect(t.length).toBeLessThanOrEqual(32);
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

```bash
npx vitest run supabase/functions/enviar-push/mensajes.test.ts
```

Esperado: **FALLA**. TypeScript rechaza los tipos nuevos porque no están en `Tipo`.

- [ ] **Step 3: Agregar los tipos**

En `supabase/functions/enviar-push/mensajes.ts` haz estos tres cambios.

El tipo:

```ts
export type Tipo =
  | "codigo_listo"
  | "comida_nueva"
  | "recordatorio"
  | "material_autorizada"
  | "material_rechazada"
  | "material_entregada";
```

El mapa de `topicCorto`:

```ts
  const t = {
    codigo_listo: "cl",
    comida_nueva: "cn",
    recordatorio: "rc",
    material_autorizada: "ma",
    material_rechazada: "mr",
    material_entregada: "me",
  }[tipo];
```

Y tres casos nuevos en el `switch` de `mensaje`, antes de cerrar:

```ts
    case "material_autorizada":
      return { title: "Vales AC", body: "Tu gerente autorizó tu material, pásalo a almacén.", url: "/empleado/materiales", tag };
    case "material_rechazada":
      return { title: "Vales AC", body: "Tu solicitud de material fue rechazada, revísala.", url: "/empleado/materiales", tag };
    case "material_entregada":
      return { title: "Vales AC", body: "Almacén marcó tu material como entregado.", url: "/empleado/materiales", tag };
```

- [ ] **Step 4: Correr los tests para verlos pasar**

```bash
npx vitest run supabase/functions/enviar-push/mensajes.test.ts
```

Esperado: PASS, incluidos los tests que ya existían.

- [ ] **Step 5: Commit (sin desplegar todavía)**

```bash
git add supabase/functions/enviar-push/mensajes.ts supabase/functions/enviar-push/mensajes.test.ts
git commit -m "feat(material): mensajes push de material autorizada/rechazada/entregada"
```

**No despliegues la edge function aquí.** El despliegue va en la Task 8, al final, porque `enviar-push` es compartida con vales de comida y es lo único de este plan que toca algo vivo.

---

## Task 4: Route handlers del escritorio

**Files:**
- Create: `src/lib/materiales/avisar.ts`
- Create: `src/app/api/materiales/autorizar/route.ts`
- Create: `src/app/api/materiales/rechazar/route.ts`
- Create: `src/app/api/materiales/entregar/route.ts`

- [ ] **Step 1: Escribir el disparador de avisos**

Crea `src/lib/materiales/avisar.ts` con este contenido exacto:

```ts
import { leerTablaMaterial } from "@/lib/materiales/rpc";

type TipoAviso = "material_autorizada" | "material_rechazada" | "material_entregada";

/**
 * Avisa al empleado dueño de la solicitud. Es best-effort: si falla, se loguea
 * y ya. El aviso es secundario; la solicitud ya quedó registrada y no se debe
 * revertir ni fallar la petición del gerente por un push que no salió.
 */
export async function avisarEmpleado(solicitudId: string, tipo: TipoAviso): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !servicio) return;

    const filas = (await leerTablaMaterial(
      `rnd_material_solicitudes?id=eq.${solicitudId}&select=empleado_id`,
    )) as Array<{ empleado_id?: number }>;
    const empleadoId = filas?.[0]?.empleado_id;
    if (!empleadoId) return;

    await fetch(`${url}/functions/v1/enviar-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${servicio}` },
      body: JSON.stringify({ tipo, empleado_id: empleadoId }),
    });
  } catch (e) {
    console.error("[material] no se pudo avisar al empleado:", e);
  }
}
```

- [ ] **Step 2: Escribir el handler de autorizar**

Crea `src/app/api/materiales/autorizar/route.ts` con este contenido exacto:

```ts
import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";

export async function POST(req: Request) {
  const { id, usuario } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    usuario?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_autorizar", {
    p_id: id,
    p_usuario: typeof usuario === "string" ? usuario : null,
  });
  if (r.ok) await avisarEmpleado(id, "material_autorizada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
```

- [ ] **Step 3: Escribir el handler de rechazar**

Crea `src/app/api/materiales/rechazar/route.ts` con este contenido exacto:

```ts
import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";

export async function POST(req: Request) {
  const { id, usuario, motivo } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    usuario?: unknown;
    motivo?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_rechazar", {
    p_id: id,
    p_usuario: typeof usuario === "string" ? usuario : null,
    p_motivo: typeof motivo === "string" ? motivo : null,
  });
  if (r.ok) await avisarEmpleado(id, "material_rechazada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
```

- [ ] **Step 4: Escribir el handler de entregar**

Crea `src/app/api/materiales/entregar/route.ts` con este contenido exacto:

```ts
import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";

interface EntregaEntrante {
  lineaId?: unknown;
  cantidadEntregada?: unknown;
}

export async function POST(req: Request) {
  const { id, usuario, entregas } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    usuario?: unknown;
    entregas?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const lista = Array.isArray(entregas) ? (entregas as EntregaEntrante[]) : [];
  const normalizadas = lista
    .map((e) => ({
      linea_id: String(e.lineaId ?? ""),
      cantidad_entregada: Number(e.cantidadEntregada),
    }))
    .filter((e) => e.linea_id !== "" && Number.isFinite(e.cantidad_entregada) && e.cantidad_entregada >= 0);

  const r = await llamarRpcMaterial("material_entregar", {
    p_id: id,
    p_usuario: typeof usuario === "string" ? usuario : null,
    p_entregas: normalizadas,
  });
  if (r.ok) await avisarEmpleado(id, "material_entregada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
```

- [ ] **Step 5: Probar los tres contra una solicitud real**

Crea una solicitud desde la PWA. Copia su `id` con MCP `execute_sql`:

```sql
select id, folio, estado from public.rnd_material_solicitudes order by creado_en desc limit 1;
```

Con `npm run dev` corriendo:

```bash
curl -s -X POST http://localhost:3000/api/materiales/autorizar \
  -H "Content-Type: application/json" \
  -d '{"id":"<ID>","usuario":"Prueba Gerente"}'
```

Esperado: `{"ok":true,"estado":"autorizada","folio":"SM-..."}`.

Repite el mismo comando: esperado `{"ok":false,"estado":"autorizada","error":"La solicitud ya está autorizada"}`.

```bash
curl -s -X POST http://localhost:3000/api/materiales/entregar \
  -H "Content-Type: application/json" \
  -d '{"id":"<ID>","usuario":"Prueba Almacen","entregas":[]}'
```

Esperado: `{"ok":true,"estado":"entregada",...}` y, en la base, todas las líneas con `cantidad_entregada = 0` (no se capturó nada, no se entregó nada).

- [ ] **Step 6: Commit**

```bash
git add src/lib/materiales/avisar.ts src/app/api/materiales/autorizar src/app/api/materiales/rechazar src/app/api/materiales/entregar
git commit -m "feat(material): route handlers de autorizar, rechazar y entregar"
```

---

## Task 5: Tabla de líneas (lectura y captura)

**Files:**
- Create: `src/components/materiales/TablaLineas.tsx`
- Test: `src/components/materiales/TablaLineas.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/components/materiales/TablaLineas.test.tsx` con este contenido exacto:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TablaLineas } from "./TablaLineas";
import type { LineaGuardada } from "@/lib/materiales/totales";

const LINEAS: LineaGuardada[] = [
  { id: "l1", orden: 0, cod_prod: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", cantidad: 2, costo_unitario: 180.5, existencia_al_pedir: 40, cantidad_entregada: null },
  { id: "l2", orden: 1, cod_prod: "TOR001", descripcion: "TORNILLO 1/4", unidad: "PZ", cantidad: 10, costo_unitario: null, existencia_al_pedir: 3, cantidad_entregada: null },
];

describe("TablaLineas", () => {
  it("en modo lectura muestra los materiales sin campos de captura", () => {
    render(<TablaLineas lineas={LINEAS} capturable={false} entregas={{}} onCambiar={() => {}} />);
    expect(screen.getByText("ANGULO 1/8")).toBeInTheDocument();
    expect(screen.getByText("TORNILLO 1/4")).toBeInTheDocument();
    expect(screen.queryByLabelText(/entregado de/i)).not.toBeInTheDocument();
  });

  it("marca en la existencia las líneas que no alcanzan", () => {
    render(<TablaLineas lineas={LINEAS} capturable={false} entregas={{}} onCambiar={() => {}} />);
    // TORNILLO: se piden 10 y hay 3 -> la celda de existencia se marca
    expect(screen.getByTitle("Se pidieron 10 y solo había 3")).toBeInTheDocument();
  });

  // El ERP tiene existencias negativas reales (al probar el puente, 3 de 25
  // materiales venían en negativo). Aquí SÍ se enseña el número crudo, a
  // diferencia de la PWA: al gerente y a almacén un -3 les dice que el ERP
  // está sobrevendido, y eso es información útil, no ruido.
  it("con existencia negativa lo dice como agotado pero conserva el número", () => {
    const enNegativo: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad: 2, existencia_al_pedir: -3 }];
    render(<TablaLineas lineas={enNegativo} capturable={false} entregas={{}} onCambiar={() => {}} />);
    expect(screen.getByTitle("No había existencia (el ERP marcaba -3)")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("en modo captura muestra un campo por línea y avisa los cambios", () => {
    const cambiar = vi.fn();
    render(<TablaLineas lineas={LINEAS} capturable entregas={{ l1: 2, l2: 10 }} onCambiar={cambiar} />);
    const campo = screen.getByLabelText("Entregado de ANGULO 1/8");
    expect(campo).toHaveValue(2);
    fireEvent.change(campo, { target: { value: "1" } });
    expect(cambiar).toHaveBeenCalledWith("l1", 1);
  });

  it("cuando ya se entregó, muestra lo entregado en vez de campos", () => {
    const entregadas: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad_entregada: 1 }];
    render(<TablaLineas lineas={entregadas} capturable={false} entregas={{}} onCambiar={() => {}} />);
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
npx vitest run src/components/materiales/TablaLineas.test.tsx
```

Esperado: **FALLA** con `Failed to resolve import "./TablaLineas"`.

- [ ] **Step 3: Escribir el componente**

Crea `src/components/materiales/TablaLineas.tsx` con este contenido exacto:

```tsx
"use client";
import { Money } from "@/components/ui/Money";
import { parseMonto } from "@devoluciones/domain";
import type { LineaGuardada } from "@/lib/materiales/totales";

export function TablaLineas({
  lineas,
  capturable,
  entregas,
  onCambiar,
}: {
  lineas: LineaGuardada[];
  /** true en la pantalla de almacén, cuando la solicitud está autorizada. */
  capturable: boolean;
  /** Mapa lineaId -> cantidad que se va a entregar (solo en modo captura). */
  entregas: Record<string, number>;
  onCambiar: (lineaId: string, cantidad: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1.5 pr-4">Material</th>
            <th className="pb-1.5 pr-4">Código</th>
            <th className="pb-1.5 pr-4 text-right">Pedido</th>
            <th className="pb-1.5 pr-4 text-right">Existencia</th>
            <th className="pb-1.5 pr-4 text-right">Costo</th>
            <th className="pb-1.5 text-right">{capturable ? "Entregar" : "Entregado"}</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const corto = l.existencia_al_pedir !== null && l.cantidad > l.existencia_al_pedir;
            return (
              <tr key={l.id} className="border-t border-slate-200">
                <td className="py-1.5 pr-4 text-slate-900">{l.descripcion}</td>
                <td className="py-1.5 pr-4 text-slate-600">{l.cod_prod}</td>
                <td className="py-1.5 pr-4 text-right text-slate-900">
                  {l.cantidad}
                  {l.unidad ? ` ${l.unidad}` : ""}
                </td>
                <td
                  className={`py-1.5 pr-4 text-right ${corto ? "font-semibold text-amber-700" : "text-slate-600"}`}
                  title={
                    !corto
                      ? undefined
                      : (l.existencia_al_pedir ?? 0) <= 0
                        ? `No había existencia (el ERP marcaba ${l.existencia_al_pedir})`
                        : `Se pidieron ${l.cantidad} y solo había ${l.existencia_al_pedir}`
                  }
                >
                  {l.existencia_al_pedir === null ? "—" : l.existencia_al_pedir}
                </td>
                <td className="py-1.5 pr-4 text-right text-slate-600">
                  {l.costo_unitario === null ? "—" : <Money monto={parseMonto(l.costo_unitario)} />}
                </td>
                <td className="py-1.5 text-right">
                  {capturable ? (
                    <input
                      type="number"
                      min={0}
                      max={l.cantidad}
                      aria-label={`Entregado de ${l.descripcion}`}
                      value={entregas[l.id] ?? l.cantidad}
                      onChange={(e) => onCambiar(l.id, Number(e.target.value))}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                    />
                  ) : l.cantidad_entregada === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="text-slate-900">
                      {l.cantidad_entregada} de {l.cantidad}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

```bash
npx vitest run src/components/materiales/TablaLineas.test.tsx
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/materiales/TablaLineas.tsx src/components/materiales/TablaLineas.test.tsx
git commit -m "feat(material): tabla de lineas en modo lectura y captura"
```

---

## Task 6: Tarjeta de solicitud y pantalla del gerente

**Files:**
- Create: `src/components/materiales/SolicitudCard.tsx`
- Create: `src/lib/hooks/useAccionesMaterial.ts`
- Create: `src/app/(app)/materiales-gerente/page.tsx`

- [ ] **Step 1: Escribir la tarjeta**

Crea `src/components/materiales/SolicitudCard.tsx` con este contenido exacto:

```tsx
"use client";
import { useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";
import { parseMonto } from "@devoluciones/domain";
import { totalDeLineas, type SolicitudGuardada } from "@/lib/materiales/totales";

// Hermana de LoteCard, con el vocabulario de material. No se reusó LoteCard
// porque tiene "Lote X" y "N reembolsos" escritos a mano.

const TONO_ESTADO: Record<string, "verde" | "ambar" | "cyan"> = {
  pendiente: "ambar",
  autorizada: "cyan",
  entregada: "verde",
  rechazada: "ambar",
  cancelada: "ambar",
};

export function SolicitudCard({
  solicitud,
  acentoColor,
  accion,
  detalle,
}: {
  solicitud: SolicitudGuardada;
  acentoColor: string;
  accion?: ReactNode;
  detalle: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const s = solicitud;
  const n = s.rnd_material_lineas.length;

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm ${acentoColor}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-bold text-slate-900">{s.folio}</span>
          <Chip tono={TONO_ESTADO[s.estado] ?? "ambar"}>{s.sucursal}</Chip>
          <span className="text-sm text-slate-700">{s.empleado_nombre}</span>
          <span className="text-sm text-slate-600">
            {n} material{n !== 1 ? "es" : ""}
          </span>
          <span className="text-sm font-semibold text-slate-900">
            Estimado <Money monto={parseMonto(totalDeLineas(s.rnd_material_lineas))} />
          </span>
          <span className="text-xs text-slate-500">
            {new Date(s.creado_en).toLocaleDateString("es-MX")}
          </span>
          {s.nota && <span className="text-xs italic text-slate-500">“{s.nota}”</span>}
        </div>
        <div className="flex items-center gap-2">
          {accion}
          <button
            onClick={() => setAbierto((v) => !v)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {abierto ? "Ocultar" : "Ver detalle"}
          </button>
        </div>
      </div>
      {abierto && <div className="border-t border-slate-100 bg-slate-50/50 p-4">{detalle}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Escribir las mutaciones**

Crea `src/lib/hooks/useAccionesMaterial.ts` con este contenido exacto:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Resultado {
  ok: boolean;
  error?: string;
  estado?: string;
  folio?: string;
}

async function postear(ruta: string, cuerpo: unknown): Promise<Resultado> {
  try {
    const res = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return (await res.json()) as Resultado;
  } catch {
    return { ok: false, error: "No se pudo conectar, intenta de nuevo" };
  }
}

function useAccion<T>(ruta: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: T) => postear(ruta, v),
    onSuccess: (r) => {
      if (r.ok) void qc.invalidateQueries({ queryKey: ["materiales"] });
    },
  });
}

export function useAutorizarMaterial() {
  return useAccion<{ id: string; usuario: string }>("/api/materiales/autorizar");
}

export function useRechazarMaterial() {
  return useAccion<{ id: string; usuario: string; motivo?: string }>("/api/materiales/rechazar");
}

export function useEntregarMaterial() {
  return useAccion<{
    id: string;
    usuario: string;
    entregas: { lineaId: string; cantidadEntregada: number }[];
  }>("/api/materiales/entregar");
}
```

- [ ] **Step 3: Escribir la pantalla del gerente**

Crea `src/app/(app)/materiales-gerente/page.tsx` con este contenido exacto:

```tsx
"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSolicitudesMaterial } from "@/lib/hooks/useSolicitudesMaterial";
import { useAutorizarMaterial, useRechazarMaterial } from "@/lib/hooks/useAccionesMaterial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SolicitudCard } from "@/components/materiales/SolicitudCard";
import { TablaLineas } from "@/components/materiales/TablaLineas";
import { totalDeLineas, type SolicitudGuardada } from "@/lib/materiales/totales";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";
const BTN_NO = "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40";

export default function MaterialesGerentePage() {
  const { sesion } = useAuth();
  // El admin ve todas las sucursales; el gerente solo la suya.
  const sucursal = sesion?.rol === "admin" ? null : (sesion?.sucursal ?? null);

  const pendientesQ = useSolicitudesMaterial({ sucursal, estados: ["pendiente"] });
  const historialQ = useSolicitudesMaterial({
    sucursal,
    estados: ["autorizada", "entregada", "rechazada", "cancelada"],
    limite: 30,
  });

  const autorizar = useAutorizarMaterial();
  const rechazar = useRechazarMaterial();
  const [msg, setMsg] = useState("");
  const [verHistorial, setVerHistorial] = useState(false);
  const [confirmar, setConfirmar] = useState<{ tipo: "autorizar" | "rechazar"; s: SolicitudGuardada } | null>(null);

  const pendientes = useMemo(() => pendientesQ.data ?? [], [pendientesQ.data]);
  const historial = useMemo(() => historialQ.data ?? [], [historialQ.data]);

  function resolver(tipo: "autorizar" | "rechazar", s: SolicitudGuardada, motivo?: string) {
    const usuario = sesion?.nombre ?? "Gerente";
    setMsg("");
    // Dos ramas explícitas en vez de una mutación genérica: los cuerpos son
    // distintos (rechazar lleva motivo) y forzar un tipo común pedía un cast.
    const opciones = {
      onSuccess: (r: { ok: boolean; error?: string }) => {
        setMsg(r.ok ? `✅ ${s.folio} ${tipo === "autorizar" ? "autorizada" : "rechazada"}` : `⚠ ${r.error}`);
        setConfirmar(null);
      },
    };
    if (tipo === "autorizar") autorizar.mutate({ id: s.id, usuario }, opciones);
    else rechazar.mutate({ id: s.id, usuario, motivo }, opciones);
  }

  const lista = verHistorial ? historial : pendientes;
  const cargando = verHistorial ? historialQ.isLoading : pendientesQ.isLoading;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Material" subtitulo="Solicitudes de material de tu sucursal" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setVerHistorial(false)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!verHistorial ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Pendientes ({pendientesQ.isLoading ? "…" : pendientes.length})
        </button>
        <button
          onClick={() => setVerHistorial(true)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${verHistorial ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Historial
        </button>
      </div>

      {cargando ? (
        <Card className="p-6 text-center text-sm text-slate-500">Cargando solicitudes…</Card>
      ) : lista.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
          {verHistorial ? "Todavía no hay solicitudes resueltas." : "No hay solicitudes pendientes."}
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              acentoColor={s.estado === "pendiente" ? "border-l-amber-500" : "border-l-slate-300"}
              accion={
                s.estado === "pendiente" ? (
                  <div className="flex flex-wrap gap-2">
                    <button className={BTN_OK} disabled={autorizar.isPending} onClick={() => setConfirmar({ tipo: "autorizar", s })}>
                      Autorizar
                    </button>
                    <button className={BTN_NO} disabled={rechazar.isPending} onClick={() => setConfirmar({ tipo: "rechazar", s })}>
                      Rechazar
                    </button>
                  </div>
                ) : undefined
              }
              detalle={
                <TablaLineas lineas={s.rnd_material_lineas} capturable={false} entregas={{}} onCambiar={() => {}} />
              }
            />
          ))}
        </div>
      )}

      {confirmar && (() => {
        const s = confirmar.s;
        const esAutorizar = confirmar.tipo === "autorizar";
        const total = totalDeLineas(s.rnd_material_lineas).toLocaleString("es-MX");
        return (
          <ConfirmDialog
            titulo={esAutorizar ? `Autorizar ${s.folio}` : `Rechazar ${s.folio}`}
            mensaje={
              <span>
                {s.empleado_nombre} · {s.rnd_material_lineas.length} materiales · Estimado <strong>${total}</strong>
              </span>
            }
            textoConfirmar={esAutorizar ? "Autorizar" : "Rechazar"}
            colorConfirmar={esAutorizar ? "verde" : "rojo"}
            conMotivo={!esAutorizar}
            isPending={autorizar.isPending || rechazar.isPending}
            onCancelar={() => setConfirmar(null)}
            onConfirmar={(motivo) => resolver(confirmar.tipo, s, motivo)}
          />
        );
      })()}
    </main>
  );
}
```

- [ ] **Step 4: Verificar que compila**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/materiales/SolicitudCard.tsx src/lib/hooks/useAccionesMaterial.ts "src/app/(app)/materiales-gerente"
git commit -m "feat(material): pantalla del gerente para autorizar solicitudes"
```

---

## Task 7: Pantalla de almacén y encendido de las pestañas

**Files:**
- Create: `src/app/(app)/materiales-almacen/page.tsx`
- Modify: `src/components/nav/Sidebar.tsx`

- [ ] **Step 1: Escribir la pantalla de almacén**

Crea `src/app/(app)/materiales-almacen/page.tsx` con este contenido exacto:

```tsx
"use client";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useSolicitudesMaterial } from "@/lib/hooks/useSolicitudesMaterial";
import { useEntregarMaterial } from "@/lib/hooks/useAccionesMaterial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SolicitudCard } from "@/components/materiales/SolicitudCard";
import { TablaLineas } from "@/components/materiales/TablaLineas";
import type { SolicitudGuardada } from "@/lib/materiales/totales";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";

export default function MaterialesAlmacenPage() {
  const { sesion } = useAuth();
  const sucursal = sesion?.rol === "admin" ? null : (sesion?.sucursal ?? null);

  const autorizadasQ = useSolicitudesMaterial({ sucursal, estados: ["autorizada"] });
  const entregadasQ = useSolicitudesMaterial({ sucursal, estados: ["entregada"], limite: 30 });
  const entregar = useEntregarMaterial();

  const [msg, setMsg] = useState("");
  const [verEntregadas, setVerEntregadas] = useState(false);
  // Mapa solicitudId -> { lineaId: cantidad }. Se llena solo al tocar un campo;
  // lo que no se toque va con la cantidad pedida (el caso normal: se surtió todo).
  const [capturas, setCapturas] = useState<Record<string, Record<string, number>>>({});
  const [confirmar, setConfirmar] = useState<SolicitudGuardada | null>(null);

  const autorizadas = useMemo(() => autorizadasQ.data ?? [], [autorizadasQ.data]);
  const entregadas = useMemo(() => entregadasQ.data ?? [], [entregadasQ.data]);

  function cambiar(solicitudId: string, lineaId: string, cantidad: number) {
    setCapturas((prev) => ({
      ...prev,
      [solicitudId]: { ...(prev[solicitudId] ?? {}), [lineaId]: cantidad },
    }));
  }

  function confirmarEntrega(s: SolicitudGuardada) {
    const capturado = capturas[s.id] ?? {};
    const entregas = s.rnd_material_lineas.map((l) => ({
      lineaId: l.id,
      cantidadEntregada: capturado[l.id] ?? l.cantidad,
    }));
    setMsg("");
    entregar.mutate(
      { id: s.id, usuario: sesion?.nombre ?? "Almacén", entregas },
      {
        onSuccess: (r) => {
          setMsg(r.ok ? `✅ ${s.folio} entregada` : `⚠ ${r.error}`);
          setConfirmar(null);
        },
      },
    );
  }

  const lista = verEntregadas ? entregadas : autorizadas;
  const cargando = verEntregadas ? entregadasQ.isLoading : autorizadasQ.isLoading;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Almacén" subtitulo="Material autorizado listo para surtir" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setVerEntregadas(false)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!verEntregadas ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Por surtir ({autorizadasQ.isLoading ? "…" : autorizadas.length})
        </button>
        <button
          onClick={() => setVerEntregadas(true)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${verEntregadas ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
        >
          Entregadas
        </button>
      </div>

      {cargando ? (
        <Card className="p-6 text-center text-sm text-slate-500">Cargando solicitudes…</Card>
      ) : lista.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
          {verEntregadas ? "Todavía no has entregado material." : "No hay material autorizado por surtir."}
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => (
            <SolicitudCard
              key={s.id}
              solicitud={s}
              acentoColor={verEntregadas ? "border-l-emerald-500" : "border-l-blue-500"}
              accion={
                verEntregadas ? undefined : (
                  <button className={BTN_OK} disabled={entregar.isPending} onClick={() => setConfirmar(s)}>
                    Marcar entregado
                  </button>
                )
              }
              detalle={
                <TablaLineas
                  lineas={s.rnd_material_lineas}
                  capturable={!verEntregadas}
                  entregas={capturas[s.id] ?? {}}
                  onCambiar={(lineaId, cantidad) => cambiar(s.id, lineaId, cantidad)}
                />
              }
            />
          ))}
        </div>
      )}

      {confirmar && (() => {
        const s = confirmar;
        const capturado = capturas[s.id] ?? {};
        const incompletas = s.rnd_material_lineas.filter(
          (l) => (capturado[l.id] ?? l.cantidad) < l.cantidad,
        ).length;
        return (
          <ConfirmDialog
            titulo={`Entregar ${s.folio}`}
            mensaje={
              <span>
                {s.empleado_nombre} · {s.rnd_material_lineas.length} materiales
                {incompletas > 0 && (
                  <>
                    {" · "}
                    <strong>{incompletas}</strong> se surten incompletos
                  </>
                )}
              </span>
            }
            textoConfirmar="Marcar entregado"
            colorConfirmar="verde"
            isPending={entregar.isPending}
            onCancelar={() => setConfirmar(null)}
            onConfirmar={() => confirmarEntrega(s)}
          />
        );
      })()}
    </main>
  );
}
```

- [ ] **Step 2: Encender las pestañas en el Sidebar**

En `src/components/nav/Sidebar.tsx`, línea 69, agrega los dos ids al `Set`:

```ts
const RUTAS_EXISTENTES: Set<TabId> = new Set(["dashboard", "revision", "reportes", "comidas-gerente", "pago-comidas", "nuevo-reembolso", "entregas", "autorizaciones", "materiales-gerente", "materiales-almacen"]);
```

- [ ] **Step 3: Crear el usuario de almacén de prueba**

Vía MCP `execute_sql` (cambia el correo y la contraseña por los reales que quieras usar):

```sql
insert into public.rnd_usuarios (email, nombre, password, rol, sucursal, activo)
values ('almacen.tml@acerosdelpacifico.com', 'Almacén Tamaral', '<contraseña>', 'almacen', 'TML', true)
returning id, nombre, rol, sucursal;
```

Esperado: una fila con `rol = 'almacen'` y `sucursal = 'TML'`.

**Nota:** revisa antes cómo guardan la contraseña los usuarios existentes (`select password from rnd_usuarios limit 1`) y usa el mismo formato; si están en claro, este usuario va igual, y si están hasheadas, hay que hashear.

- [ ] **Step 4: Recorrido manual de los tres roles**

```bash
npm run dev
```

1. **Empleado** (PWA, sucursal TML): crea una solicitud con 2 materiales.
2. **Gerente de TML** (Guillermo Corrales): entra a **Material**, la ve en Pendientes, abre el detalle, autoriza. Debe desaparecer de Pendientes y aparecer en Historial.
3. **Almacén TML** (el usuario del paso 3): entra a **Almacén**, la ve en "Por surtir", baja la cantidad de un material, marca entregado. El diálogo debe avisar "1 se surten incompletos".
4. **Empleado**: refresca "Mis solicitudes" y ve el estado "Entregada".
5. **Gerente de otra sucursal** (por ejemplo Flor Santos, FTE): entra a Material y **no debe ver** la solicitud de TML.
6. Escribe a mano `http://localhost:3000/materiales-almacen` con la sesión del gerente: el middleware debe rebotarte a `/comidas-gerente`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/materiales-almacen" src/components/nav/Sidebar.tsx
git commit -m "feat(material): pantalla de almacen y pestanas encendidas"
```

---

## Task 8: Desplegar los avisos push (último paso)

Esto es lo único que toca algo **vivo**: `enviar-push` es la misma función que usan los vales de comida. El cambio es aditivo (casos nuevos en un `switch`), pero se hace al final y se verifica que comidas siga funcionando.

**Files:**
- Deploy: `supabase/functions/enviar-push`

- [ ] **Step 1: Confirmar que el código ya está commiteado**

```bash
git status --short supabase/functions/enviar-push
```

Esperado: sin cambios pendientes (se commiteó en la Task 3).

- [ ] **Step 2: Desplegar**

Despliega la función `enviar-push` con la herramienta MCP `deploy_edge_function`, incluyendo **todos** sus archivos (`index.ts` y `mensajes.ts`).

- [ ] **Step 3: Verificar que comidas NO se rompió**

```sql
-- Vía MCP execute_sql: un empleado con suscripción push activa
select empleado_id, count(*) from public.rnd_push_suscripciones group by empleado_id limit 5;
```

Con un `empleado_id` de esa lista, dispara un aviso del flujo viejo y confirma que llega:

```bash
curl -s -X POST "<SUPABASE_URL>/functions/v1/enviar-push" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"recordatorio","empleado_id":<ID>}'
```

Esperado: respuesta `ok` y la notificación en el dispositivo suscrito. **Si esto falla, revierte el despliegue antes de seguir**: es más importante que comidas siga sirviendo que tener el aviso de material.

- [ ] **Step 4: Verificar el aviso de material end-to-end**

Con el mismo empleado (que debe tener el opt-in de avisos activado en la PWA):

1. El empleado crea una solicitud de material.
2. El gerente la autoriza.
3. Debe llegar la notificación "Tu gerente autorizó tu material, pásalo a almacén", y al tocarla abrir `/empleado/materiales`.

- [ ] **Step 5: Verificar que un push caído no rompe la autorización**

Corta la red del dispositivo (o usa un empleado sin suscripciones) y autoriza otra solicitud. Esperado: la autorización **funciona igual** y el estado cambia; el push simplemente no llega. Si la autorización falla por culpa del push, `avisarEmpleado` no está atrapando el error: arréglalo.

- [ ] **Step 6: Commit**

No hay archivos nuevos; si el despliegue requirió algún ajuste en `index.ts`, commitéalo:

```bash
git add supabase/functions/enviar-push
git commit -m "chore(material): despliegue de enviar-push con los tipos de material"
```

---

## Verificación final del plan

- [ ] `npx vitest run` → verde (totales 6, TablaLineas 4, mensajes push, más todo lo anterior).
- [ ] `cd packages/domain && npx vitest run` → verde.
- [ ] `npx tsc --noEmit -p tsconfig.json` → sin errores.
- [ ] `npm run build` → compila.
- [ ] **Ciclo completo probado con los tres roles reales**, incluyendo una entrega incompleta.
- [ ] **Aislamiento por sucursal probado**: un gerente de otra sucursal no ve las solicitudes ajenas, y el middleware rebota las URLs escritas a mano.
- [ ] **Comidas sigue funcionando** después de desplegar `enviar-push`.
- [ ] Datos de prueba limpiados de `rnd_material_solicitudes` (el usuario de almacén se queda si es real).
- [ ] **Nada pusheado.** `git status -sb` debe mostrar `master` adelante del remoto y ahí se queda hasta que el usuario decida.

---

## Lo que queda pendiente para producción

Está en el spec (§9) y no se resuelve en ningún plan de esta tanda:

- **El puente al ERP no funciona en Netlify.** La nube no alcanza `SERVERADP\CABOS`. Hay que publicar censos-web por túnel o sincronizar el catálogo a Supabase antes de que esto sirva desplegado.
- **Dar de alta a los encargados de almacén reales** en `rnd_usuarios`, uno por sucursal.
- Descontar inventario en el ERP, autorización línea por línea, código de confirmación del empleado al recibir, y reportes de material: fuera de alcance.
