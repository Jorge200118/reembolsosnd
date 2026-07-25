# Entrega por área en uso interno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada encargado de área (Ferretería, Nave 1, Nave 2, Nave 3) valide únicamente las partidas de su área, y que la solicitud se cierre sola cuando la última área entregue.

**Architecture:** Cada línea de la solicitud carga su área, derivada en el ERP a partir de la zona de inventario físico del producto y congelada al crear la solicitud. `material_entregar` deja de cerrar la solicitud entera: marca entregadas solo las líneas del área de quien entrega, y sella `estado='entregada'` únicamente cuando ya no quedan líneas pendientes. Un producto sin zona en BMS no se puede pedir.

**Tech Stack:** Next.js 16 (App Router) · Supabase/Postgres (RPC `security definer`) · SQL Server BMSCabos vía censos-web (Express) · Vitest · Tailwind

---

## Contexto imprescindible

**Vocabulario.** El módulo se llama "Uso interno" de cara al usuario, pero en el código todo dice `material`/`materiales`. Respetar esa convención: no renombrar.

**De dónde sale el área.** El ERP no tiene columna de línea/familia/departamento. La única clasificación real de un producto es su **zona de inventario físico**, en `BMSCabos.dbo.censo_productos_inventario` (producto → zona) cruzada con `BMSCabos.dbo.zonas_inventario_fisico` (zona → nombre legible). El área se deriva del **prefijo del nombre** de la zona:

| Nombre de zona empieza con | Área |
|---|---|
| `N0` (N0 PATIO) | `NAVE1` — decisión del usuario: el patio lo cubre Nave 1 |
| `N1` (N1 P1 DER, N1 P2 IZQ…) | `NAVE1` |
| `N2` (N2 DER, N2 IZQ, N2 PISO) | `NAVE2` |
| `N3` (N3 LINEAL) | `NAVE3` |
| cualquier otro (PASILLO FERR IZQ, ELECTRICIDAD, CHAPAS…) | `FERRETERIA` |

**Nunca parsear el CÓDIGO de zona, solo el NOMBRE.** En Los Mochis los códigos son inconsistentes: la zona con código `A5` se llama "N1 P2 IZQ" y la zona `N2P8DER` se llama "N3 LINEAL". Verificado contra datos reales: derivando por nombre, el reparto (536 NAVE1 / 150 NAVE2 / 194 NAVE3 / 27 PATIO / 2482 FERRETERIA) coincide exactamente con `censo_ubicaciones.tipo`.

**Multiárea.** 230 productos están en más de una zona; de esos, 24 cruzan dos áreas distintas (19 Ferretería+Nave1, 4 Ferretería+Nave3, 1 Ferretería+Patio). Decisión del usuario: **gana Ferretería**. Se implementa con un `ORDER BY` determinista, no con `TOP 1` arbitrario.

**Sin zona = no se pide.** 152 productos con existencia en Mochis no tienen zona en BMS (~$398k). Decisión del usuario: se bloquean con aviso. El alta la hace inventarios en BMS; cuando la hagan, se habilitan solos sin tocar código.

**Cuán seguido pega el bloqueo (medido, no estimado).** Se corrieron 20 búsquedas reales ("PIJA", "CEMENTO", "CABLE", "MARTILLO"…) contra el ERP: 495 resultados, de los cuales 306 (62%) no traen zona. Ese 62% asusta pero engaña: **de los 306, solo 1 tiene existencia > 0.** Los otros 305 son códigos de catálogo con cero en piso, que nadie podría llevarse de todos modos. El bloqueo que de verdad frustra a alguien es ~1 de cada 495 búsquedas.

Consecuencia de diseño para la Task 4: **el bloqueo al enviar es correcto, pero llega tarde.** El empleado va a ver muchos resultados sin zona mientras busca. La búsqueda debe marcarlos en el momento (en gris, con el motivo) en vez de dejar que descubra el problema al mandar la solicitud. Ver Task 4 Step 7.

**Alcance de sucursales.** Solo Los Mochis (`cod_estab = 1`) tiene áreas. Las demás sucursales deben seguir funcionando **exactamente igual que hoy**: un solo encargado que entrega todo. Esto es un requisito duro — no se puede romper Culiacán, El Fuerte, etc.

**Seguridad ya establecida (no aflojar).** La identidad sale siempre de la cookie firmada, nunca del body. Las RPC son `security definer` y solo `service_role` las ejecuta. El catálogo se reconfirma contra el ERP al crear (`confirmar.ts`) — de ahí también saldrá el área, para que el cliente no la pueda inventar.

---

## Estructura de archivos

**censos-web** (fuente del dato):
- `models/materiales.js` — añadir la derivación de área al SQL de búsqueda

**devoluciones-ac-web**:
| Archivo | Responsabilidad |
|---|---|
| `packages/domain/src/areas.ts` (nuevo) | Catálogo de áreas y `areaDeZona()`. Única fuente de verdad del vocabulario. |
| `packages/domain/src/roles.ts` | Rol `almacen` gana `area` opcional |
| `src/lib/materiales/tipos.ts` | `Material.area` |
| `src/lib/materiales/normalizar.ts` | Leer `area` del ERP |
| `src/lib/materiales/confirmar.ts` | Bloquear sin área; congelar área en la línea |
| `src/lib/materiales/totales.ts` | `LineaGuardada.area`, `resumenPorArea()` |
| `src/lib/materiales/actor.ts` | Actor lleva `area` |
| `supabase/migrations/0031_*.sql` | Columna `area` en líneas |
| `supabase/migrations/0032_*.sql` | `material_entregar` por área |
| `src/components/materiales/TablaLineas.tsx` | Columna de área + filtrado visual |
| `src/components/materiales/ProgresoAreas.tsx` (nuevo) | "2 de 3 áreas entregadas" |
| `src/app/(app)/materiales-almacen/page.tsx` | Capturar solo lo de su área |

---

## Task 1: Catálogo de áreas en domain

**Files:**
- Create: `packages/domain/src/areas.ts`
- Create: `packages/domain/src/areas.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/domain/src/areas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AREAS, areaDeZona, esArea, etiquetaArea, type Area } from "./areas";

describe("areaDeZona", () => {
  it("manda el patio N0 a NAVE1", () => {
    expect(areaDeZona("N0 PATIO")).toBe("NAVE1");
  });

  it("deriva las naves por el prefijo del nombre", () => {
    expect(areaDeZona("N1 P1 DER")).toBe("NAVE1");
    expect(areaDeZona("N1 P2 IZQ")).toBe("NAVE1");
    expect(areaDeZona("N2 DER")).toBe("NAVE2");
    expect(areaDeZona("N2 PISO")).toBe("NAVE2");
    expect(areaDeZona("N3 LINEAL")).toBe("NAVE3");
  });

  it("todo lo que no es nave cae en ferretería", () => {
    expect(areaDeZona("PASILLO FERR IZQ")).toBe("FERRETERIA");
    expect(areaDeZona("ELECTRICIDAD")).toBe("FERRETERIA");
    expect(areaDeZona("CHAPAS")).toBe("FERRETERIA");
    expect(areaDeZona("BODEGA PATIO")).toBe("FERRETERIA");
  });

  // El nombre real de la zona en Mochis trae doble espacio: "N1 P3  IZQ".
  it("tolera espacios de sobra y minúsculas", () => {
    expect(areaDeZona("  n1 p3  izq ")).toBe("NAVE1");
  });

  // Sin zona no hay área: quien llame decide qué hacer, pero no se inventa.
  it("devuelve null cuando no hay zona", () => {
    expect(areaDeZona("")).toBeNull();
    expect(areaDeZona(null)).toBeNull();
    expect(areaDeZona(undefined)).toBeNull();
    expect(areaDeZona("   ")).toBeNull();
  });

  // "NAVEGACION" empieza con N pero no es una nave: el dígito es obligatorio.
  it("no confunde palabras que empiezan con N", () => {
    expect(areaDeZona("NAVEGACION")).toBe("FERRETERIA");
    expect(areaDeZona("NORTE")).toBe("FERRETERIA");
  });

  it("N4 en adelante no existe todavía, cae en ferretería", () => {
    expect(areaDeZona("N4 ALGO")).toBe("FERRETERIA");
  });
});

describe("esArea", () => {
  it("acepta las cuatro áreas", () => {
    expect(esArea("FERRETERIA")).toBe(true);
    expect(esArea("NAVE1")).toBe(true);
    expect(esArea("NAVE2")).toBe(true);
    expect(esArea("NAVE3")).toBe(true);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(esArea("PATIO")).toBe(false);
    expect(esArea("")).toBe(false);
    expect(esArea(null)).toBe(false);
    expect(esArea(undefined)).toBe(false);
    expect(esArea("nave1")).toBe(false);
  });
});

describe("etiquetaArea", () => {
  it("da nombres legibles para la pantalla", () => {
    expect(etiquetaArea("FERRETERIA")).toBe("Ferretería");
    expect(etiquetaArea("NAVE1")).toBe("Nave 1");
    expect(etiquetaArea("NAVE2")).toBe("Nave 2");
    expect(etiquetaArea("NAVE3")).toBe("Nave 3");
  });
});

describe("AREAS", () => {
  it("son exactamente cuatro y ferretería va primero", () => {
    expect(AREAS).toEqual(["FERRETERIA", "NAVE1", "NAVE2", "NAVE3"]);
  });

  it("toda área tiene etiqueta", () => {
    for (const a of AREAS) {
      expect(etiquetaArea(a as Area).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `packages/domain`, porque el vitest raíz excluye `packages/**` y cada paquete corre con su propio config):

```bash
cd "c:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web/packages/domain" && npx vitest run src/areas.test.ts
```

Expected: FAIL — `Failed to resolve import "./areas"`

- [ ] **Step 3: Write minimal implementation**

Create `packages/domain/src/areas.ts`:

```ts
// Áreas que entregan material de uso interno. Hoy solo aplica a Los Mochis;
// las demás sucursales tienen un único encargado que entrega todo.
//
// El área NO existe como columna en el ERP: se deriva del NOMBRE de la zona de
// inventario físico (BMSCabos.dbo.zonas_inventario_fisico.nombre). Se deriva del
// nombre y NUNCA del código de zona, porque en Mochis los códigos mienten: la
// zona con código 'A5' se llama "N1 P2 IZQ" y la 'N2P8DER' se llama "N3 LINEAL".

export const AREAS = ["FERRETERIA", "NAVE1", "NAVE2", "NAVE3"] as const;
export type Area = (typeof AREAS)[number];

const ETIQUETAS: Record<Area, string> = {
  FERRETERIA: "Ferretería",
  NAVE1: "Nave 1",
  NAVE2: "Nave 2",
  NAVE3: "Nave 3",
};

export function etiquetaArea(a: Area): string {
  return ETIQUETAS[a];
}

export function esArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

/**
 * Deriva el área a partir del nombre de la zona de inventario físico.
 *
 * El patio (N0) se le asigna a Nave 1: son 27 productos y el encargado de
 * Nave 1 es quien los surte.
 *
 * Devuelve null si no hay zona. Un producto sin zona en BMS no se puede pedir
 * (decisión del negocio): quien llame trata el null como bloqueo, no como
 * "ponlo en ferretería".
 */
export function areaDeZona(nombreZona: string | null | undefined): Area | null {
  const z = String(nombreZona ?? "").trim().toUpperCase();
  if (!z) return null;

  // El dígito es obligatorio: así "NAVEGACION" o "NORTE" no se cuelan como nave.
  const m = /^N([0-3])(?![0-9])/.exec(z);
  if (!m) return "FERRETERIA";

  switch (m[1]) {
    case "0": return "NAVE1"; // patio
    case "1": return "NAVE1";
    case "2": return "NAVE2";
    default:  return "NAVE3";
  }
}
```

- [ ] **Step 4: Export it from the package**

Read `packages/domain/src/index.ts` first, then add the re-export alongside the existing ones (keep the file's existing style):

```ts
export * from "./areas";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "c:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web/packages/domain" && npx vitest run src/areas.test.ts`

Expected: PASS — 8 tests

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/areas.ts packages/domain/src/areas.test.ts packages/domain/src/index.ts
git commit -m "feat(uso-interno): catálogo de áreas y derivación desde la zona del ERP"
```

---

## Task 2: censos-web devuelve el área de cada producto

**Files:**
- Modify: `C:/censos-web/models/materiales.js:32-56`

**Contexto:** `censo_productos_inventario` vive en `BMSCabos`, igual que `productos`, así que no hace falta `COLLATE DATABASE_DEFAULT` (eso solo se necesita al cruzar con `AcerosCabos_Pagos`). Se usa `OUTER APPLY` con `TOP 1` para no multiplicar filas cuando un producto está en varias zonas.

**Multiárea:** el `ORDER BY` decide quién gana. Se ordena poniendo las zonas que NO empiezan con `N`+dígito primero, lo que hace ganar a Ferretería en los 24 casos que cruzan áreas, tal como se decidió.

- [ ] **Step 1: Modify the query**

In `C:/censos-web/models/materiales.js`, replace the `.query(...)` block (lines 32-48) with:

```js
    .query(`
      SELECT TOP (@lim)
             RTRIM(p.cod_prod)    AS cod_prod,
             RTRIM(p.descripcion) AS descripcion,
             RTRIM(u.abreviatura) AS unidad,
             pe.exist_unidades    AS existencia,
             pe.costo_promedio    AS costo,
             zif.zona_nombre      AS zona
        FROM ${tProd} p WITH (NOLOCK)
        LEFT JOIN ${tUni} u
               ON u.unidad = p.unidad_compra
        LEFT JOIN ${tPe} pe
               ON RTRIM(pe.cod_prod) = RTRIM(p.cod_prod)
              AND pe.cod_estab = @estab
        OUTER APPLY (
          SELECT TOP 1 RTRIM(z.nombre) AS zona_nombre
            FROM ${tCpi} c WITH (NOLOCK)
            LEFT JOIN ${tZif} z
                   ON z.cod_estab = c.cod_estab
                  AND RTRIM(z.zona_inventario_fisico) = RTRIM(c.zona_inventario_fisico)
           WHERE c.cod_estab = @estabTxt
             AND RTRIM(c.cod_prod) = RTRIM(p.cod_prod)
             AND z.nombre IS NOT NULL
           -- Un producto puede estar en varias zonas (230 en Mochis). Cuando
           -- las zonas cruzan áreas distintas (24 casos, todos Ferretería + una
           -- nave), gana Ferretería: se ordenan primero los nombres que NO son
           -- de nave. Sin este ORDER BY el TOP 1 sería arbitrario y el mismo
           -- producto podría cambiar de encargado entre dos búsquedas.
           ORDER BY CASE WHEN RTRIM(z.nombre) LIKE 'N[0-3]%' THEN 1 ELSE 0 END,
                    RTRIM(z.nombre)
        ) zif
       WHERE p.descripcion LIKE '%' + @q + '%'
          OR p.cod_prod    LIKE '%' + @q + '%'
       ORDER BY p.descripcion
    `);
```

- [ ] **Step 2: Add the two new table refs and the string param**

In the same file, after line 26 (`const tPe = tablaBMS('prodestab', [estab]);`) add:

```js
  const tCpi  = tablaBMS('censo_productos_inventario', [estab]);
  const tZif  = tablaBMS('zonas_inventario_fisico', [estab]);
```

And in the `.input(...)` chain (after line 30), add — `censo_productos_inventario.cod_estab` se compara como texto en toda la base de censos, no como int:

```js
    .input('estabTxt', sql.VarChar(10), String(estab))
```

- [ ] **Step 3: Return the zone in the mapped result**

Replace the `return result.recordset.map(...)` block (lines 50-56) with:

```js
  return result.recordset.map(r => ({
    cod_prod:    r.cod_prod,
    descripcion: r.descripcion,
    unidad:      r.unidad || null,
    existencia:  r.existencia === null || r.existencia === undefined ? null : Number(r.existencia),
    costo:       r.costo === null || r.costo === undefined ? null : Number(r.costo),
    // Nombre de la zona de inventario físico. null = el producto no está dado
    // de alta en el censo. Quien consume decide qué hacer con eso; aquí no se
    // inventa un valor por defecto.
    zona:        r.zona ? String(r.zona).trim() : null,
  }));
```

- [ ] **Step 4: Verify against the real ERP**

Create `C:/censos-web/scripts/tmp-verificar-area.js`:

```js
/** SOLO LECTURA. Verifica que /api/materiales ya devuelve la zona. */
require('dotenv').config();
const { buscarMateriales } = require('../models/materiales');

async function main() {
  for (const q of ['PIJA', 'CEMENTO', 'VARILLA', 'KITOX']) {
    const r = await buscarMateriales({ q, codEstab: 1, limite: 5 });
    console.log(`\n--- ${q} (${r.length}) ---`);
    for (const m of r) {
      console.log(`  ${m.cod_prod.padEnd(12)} zona=${String(m.zona ?? 'NULL').padEnd(20)} ${m.descripcion.slice(0, 45)}`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
```

Run: `cd C:/censos-web && node scripts/tmp-verificar-area.js`

Expected: cada producto trae `zona=` con el nombre de zona (p. ej. `PASILLO FERR IZQ`, `N1 P1 DER`) o `zona=NULL` para los 152 sin dar de alta. Los `KITOX` (familia PRI) deben salir todos `NULL` — es la comprobación de que el bloqueo va a funcionar.

Then delete it: `rm C:/censos-web/scripts/tmp-verificar-area.js`

- [ ] **Step 5: Commit (in the censos-web repo)**

```bash
cd C:/censos-web
git add models/materiales.js
git commit -m "feat(materiales): devolver la zona de inventario fisico de cada producto"
```

---

## Task 3: El área viaja del ERP al carrito

**Files:**
- Modify: `src/lib/materiales/tipos.ts`
- Modify: `src/lib/materiales/normalizar.ts:27-33`
- Modify: `src/lib/materiales/normalizar.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/materiales/normalizar.test.ts`:

```ts
describe("normalizarMateriales — área", () => {
  it("deriva el área desde la zona que manda el ERP", () => {
    const r = normalizarMateriales([
      { cod_prod: "FER001", descripcion: "PIJA 2\"", zona: "PASILLO FERR IZQ" },
      { cod_prod: "VAR001", descripcion: "VARILLA 3/8", zona: "N1 P1 DER" },
      { cod_prod: "PTR001", descripcion: "PTR 2X2", zona: "N3 LINEAL" },
    ]);
    expect(r.map((m) => m.area)).toEqual(["FERRETERIA", "NAVE1", "NAVE3"]);
  });

  it("deja el área en null cuando el producto no tiene zona", () => {
    const r = normalizarMateriales([
      { cod_prod: "PRI010", descripcion: "KITOX BLANCO", zona: null },
      { cod_prod: "TRU123", descripcion: "MARTILLO" },
      { cod_prod: "CEM095", descripcion: "MULTIPLAST", zona: "   " },
    ]);
    expect(r.map((m) => m.area)).toEqual([null, null, null]);
  });

  it("ignora una zona que no sea texto", () => {
    const r = normalizarMateriales([
      { cod_prod: "X1", descripcion: "COSA", zona: 42 },
    ]);
    expect(r[0]!.area).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/materiales/normalizar.test.ts`

Expected: FAIL — `Property 'area' does not exist on type 'Material'`

- [ ] **Step 3: Add `area` to the Material type**

In `src/lib/materiales/tipos.ts`, replace the `Material` interface with:

```ts
import type { Area } from "@devoluciones/domain";

/** Un material del catálogo del ERP, ya normalizado para la app. */
export interface Material {
  codProd: string;
  descripcion: string;
  /** Abreviatura de la unidad de compra (PZ, KG, MT). Null si el ERP no la tiene. */
  unidad: string | null;
  /** Existencia en la sucursal. Null = no hay dato, distinto de 0 = agotado. */
  existencia: number | null;
  /** Costo promedio en la sucursal. Null = no hay dato. */
  costo: number | null;
  /**
   * Área que lo entrega, derivada de la zona de inventario del ERP.
   * Null = el producto no está dado de alta en el censo, así que nadie puede
   * entregarlo: no se deja pedir.
   */
  area: Area | null;
}
```

- [ ] **Step 4: Derive the area in the normalizer**

In `src/lib/materiales/normalizar.ts`, add the import at the top:

```ts
import { areaDeZona } from "@devoluciones/domain";
```

And replace the `out.push({...})` block (lines 27-33) with:

```ts
    out.push({
      codProd,
      descripcion,
      unidad: aTexto(f.unidad) || null,
      existencia: aNumero(f.existencia),
      costo: aNumero(f.costo),
      // aTexto devuelve "" para cualquier cosa que no sea string, y areaDeZona
      // trata "" como "sin zona": una zona numérica o un objeto no se cuelan.
      area: areaDeZona(aTexto(f.zona)),
    });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/materiales/normalizar.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/materiales/tipos.ts src/lib/materiales/normalizar.ts src/lib/materiales/normalizar.test.ts
git commit -m "feat(uso-interno): el material del ERP trae su área"
```

---

## Task 4: No se puede pedir material sin área

**Files:**
- Modify: `src/lib/materiales/confirmar.ts:18-25,79-92`
- Modify: `src/lib/materiales/confirmar.test.ts`

**Contexto:** `confirmarConElErp` es el guardián: relee el catálogo del ERP y arma las líneas que se van a guardar. Es el único lugar donde el área puede congelarse sin que el cliente la toque, y el único punto donde el bloqueo es efectivo.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/materiales/confirmar.test.ts` (reusar el estilo de fake `buscar` que ya usa ese archivo; este bloque trae el suyo completo para poder leerse solo):

```ts
describe("confirmarConElErp — área", () => {
  const conArea = (over: Partial<Material> = {}): Material => ({
    codProd: "FER001",
    descripcion: 'PIJA 2"',
    unidad: "PZ",
    existencia: 100,
    costo: 3,
    area: "FERRETERIA",
    ...over,
  });

  it("congela el área en la línea confirmada", async () => {
    const buscar = async () => [conArea({ codProd: "VAR001", area: "NAVE2" })];
    const r = await confirmarConElErp([{ codProd: "VAR001", cantidad: 2 }], buscar);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineas[0]!.area).toBe("NAVE2");
  });

  it("rechaza un material sin área y lo nombra", async () => {
    const buscar = async () => [conArea({ codProd: "PRI010", descripcion: "KITOX BLANCO", area: null })];
    const r = await confirmarConElErp([{ codProd: "PRI010", cantidad: 1 }], buscar);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("PRI010");
      expect(r.error).toContain("no tiene área");
    }
  });

  // Si el área la mandara el cliente podría elegir quién le entrega. Solo cuenta
  // lo que dice el ERP.
  it("ignora el área que venga del carrito y usa la del ERP", async () => {
    const buscar = async () => [conArea({ codProd: "FER001", area: "FERRETERIA" })];
    const pedidas = [{ codProd: "FER001", cantidad: 1, area: "NAVE3" } as never];
    const r = await confirmarConElErp(pedidas, buscar);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineas[0]!.area).toBe("FERRETERIA");
  });

  it("nombra todos los materiales sin área, no solo el primero", async () => {
    const buscar = async (q: string) => [conArea({ codProd: q, area: null })];
    const r = await confirmarConElErp(
      [{ codProd: "PRI010", cantidad: 1 }, { codProd: "TRU123", cantidad: 1 }],
      buscar,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("PRI010");
      expect(r.error).toContain("TRU123");
    }
  });
});
```

Make sure `Material` is imported at the top of that test file:

```ts
import type { Material } from "@/lib/materiales/tipos";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/materiales/confirmar.test.ts`

Expected: FAIL — `Property 'area' does not exist on type 'LineaConfirmada'`

- [ ] **Step 3: Add `area` to LineaConfirmada and block the missing ones**

In `src/lib/materiales/confirmar.ts`, add the import at the top:

```ts
import type { Area } from "@devoluciones/domain";
```

Replace the `LineaConfirmada` interface (lines 18-25) with:

```ts
/** Una línea lista para `material_crear`, con los datos del ERP. */
export interface LineaConfirmada {
  cod_prod: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costo_unitario: number | null;
  existencia_al_pedir: number | null;
  /** Área que la entrega. Nunca null: sin área la solicitud ni se crea. */
  area: Area;
}
```

Then replace the final `return {...}` block (lines 79-92) with:

```ts
  // Sin área no hay quién lo entregue. El área sale de la zona de inventario
  // del ERP; si el producto no está dado de alta en el censo, la solicitud no
  // se crea, porque cerrarla exigiría que un encargado valide partidas que no
  // son de nadie. El alta la hace inventarios en BMS y esto se destraba solo.
  const sinArea = distintos.filter((c) => !catalogo.get(c)!.area);
  if (sinArea.length > 0) {
    return {
      ok: false,
      error:
        `${sinArea.join(", ")} no tiene área asignada en el inventario, ` +
        `así que nadie puede entregarlo. Pide a inventarios que lo dé de alta.`,
    };
  }

  return {
    ok: true,
    lineas: limpias.map((l) => {
      const m = catalogo.get(l.codProd.toUpperCase())!;
      return {
        cod_prod: m.codProd,
        descripcion: m.descripcion,
        unidad: m.unidad,
        cantidad: l.cantidad,
        costo_unitario: m.costo,
        existencia_al_pedir: m.existencia,
        area: m.area!, // garantizado por la verificación de arriba
      };
    }),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/materiales/confirmar.test.ts`

Expected: PASS

- [ ] **Step 5: Run the whole suite — this changes a shared type**

Run: `npx vitest run`

Expected: PASS. If any test builds a `Material` literal without `area`, add `area: "FERRETERIA"` to it.

- [ ] **Step 6: Avisar en la búsqueda, no al enviar**

**Files:** `src/components/empleado/BuscadorMaterial.tsx`

Bloquear al enviar es correcto pero llega tarde: medido contra el ERP, 62% de los resultados de búsqueda no traen zona (casi todos sin existencia, pero el empleado los ve igual). Descubrir el problema después de armar el carrito es la peor versión.

En `src/components/empleado/BuscadorMaterial.tsx`, replace the `<li>` block inside the results list (lines 94-105) with:

```tsx
          {resultados.map((m) => (
            <li key={m.codProd}>
              <button
                type="button"
                className="mat-resultado"
                onClick={() => elegir(m)}
                disabled={m.area === null}
                title={
                  m.area === null
                    ? "No tiene área asignada en el inventario, avisa a inventarios"
                    : undefined
                }
              >
                <span className="mat-desc">{m.descripcion}</span>
                <span className="mat-meta">
                  {m.codProd}
                  {m.unidad ? ` · ${m.unidad}` : ""}
                  {m.existencia === null ? "" : ` · hay ${m.existencia}`}
                </span>
                {m.area === null && (
                  <span className="mat-sin-area">Sin área asignada · no se puede pedir</span>
                )}
              </button>
            </li>
          ))}
```

Guard `elegir` too, so a keyboard activation can't slip past the disabled button:

```tsx
  function elegir(m: Material) {
    if (m.area === null) return; // sin área no se puede pedir; el aviso ya está en la lista
    onElegir(m);
    ultima.current++;
    setTexto("");
    setResultados([]);
  }
```

Add the style next to the other `mat-*` rules (find them with `grep -rn "mat-resultado" src/ --include=*.css`):

```css
.mat-resultado:disabled { opacity: .55; cursor: not-allowed; }
.mat-sin-area { display: block; font-size: .75rem; color: #b45309; margin-top: .15rem; }
```

- [ ] **Step 7: Verify**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`

Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/materiales/confirmar.ts src/lib/materiales/confirmar.test.ts src/components/empleado/BuscadorMaterial.tsx
git commit -m "feat(uso-interno): no se puede pedir material sin área asignada"
```

---

## Task 5: Migración — columna `area` en las líneas

**Files:**
- Create: `supabase/migrations/0031_material_area_linea.sql`

**Contexto:** las líneas viejas se quedan en `null`. Eso es correcto y deliberado: son de solicitudes que se crearon antes de que existieran las áreas, y la RPC de la Task 6 las trata como "las entrega cualquiera", que es exactamente el comportamiento de hoy. Por eso la columna es nullable y no lleva default.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_material_area_linea.sql`:

```sql
-- Área que entrega cada partida. Se congela al crear la solicitud, igual que
-- la descripción y el costo: si mañana inventarios mueve el producto de zona,
-- una solicitud ya autorizada no puede cambiar de encargado a media entrega.
--
-- Nullable a propósito:
--   * Las líneas creadas antes de este cambio se quedan en null y las entrega
--     cualquiera, que es el comportamiento que ya tenían.
--   * Las sucursales sin áreas (todas menos Los Mochis) siguen guardando null.
-- Sin default: un default obligaría a elegir un área para quien no tiene.

alter table public.rnd_material_lineas
  add column if not exists area text;

alter table public.rnd_material_lineas
  drop constraint if exists rnd_material_lineas_area_check;

alter table public.rnd_material_lineas
  add constraint rnd_material_lineas_area_check
  check (area is null or area in ('FERRETERIA', 'NAVE1', 'NAVE2', 'NAVE3'));

-- La pantalla de almacén filtra por área dentro de una solicitud.
create index if not exists idx_material_lineas_area
  on public.rnd_material_lineas (solicitud_id, area);

comment on column public.rnd_material_lineas.area is
  'Área que entrega esta partida (FERRETERIA|NAVE1|NAVE2|NAVE3), derivada de la '
  'zona de inventario físico del ERP al momento de pedir. Null = sucursal sin '
  'áreas o línea anterior al cambio; la entrega cualquier encargado.';
```

- [ ] **Step 2: Apply it**

Use the Supabase MCP tool `apply_migration` with name `0031_material_area_linea` and the SQL above.

- [ ] **Step 3: Verify the column and the constraint**

Use `execute_sql` with:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'rnd_material_lineas' and column_name = 'area';
```

Expected: one row — `area | text | YES`

Then verify the CHECK actually rejects garbage:

```sql
do $$
begin
  begin
    insert into public.rnd_material_lineas
      (solicitud_id, orden, cod_prod, descripcion, cantidad, area)
    values (gen_random_uuid(), 1, 'X', 'X', 1, 'PATIO');
    raise exception 'FALLO: el check dejó pasar un área inválida';
  exception
    when check_violation then raise notice 'OK: el check rechaza áreas inválidas';
    when foreign_key_violation then raise notice 'OK: llegó hasta la FK (el check pasó porque PATIO no se probó)';
  end;
end $$;
```

Expected: `NOTICE: OK: el check rechaza áreas inválidas`

- [ ] **Step 4: Update material_crear to persist the area**

Create `supabase/migrations/0031b_material_crear_area.sql`. Es la función de `0023_material_entregar_dedupe_uuid.sql` con **dos** cambios: una validación nueva del área y la columna `area` en el insert de líneas. Todo lo demás va idéntico.

```sql
-- material_crear ahora guarda el área de cada partida. El área la calcula el
-- servidor en confirmar.ts leyendo la zona del ERP; aquí solo se valida que sea
-- una de las cuatro y se escribe. El CHECK de la tabla es la última red: un
-- valor inventado aborta la transacción en vez de guardarse.

create or replace function public.material_crear(
  p_empleado_id int,
  p_nota        text,
  p_lineas      jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre    text;
  v_suc_larga text;
  v_abrev     text;
  v_cod_estab int;
  v_id        uuid;
  v_folio     text;
  v_n         int;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'La solicitud no tiene materiales');
  end if;

  -- El CASE es deliberado: en SQL el `or` no garantiza corto circuito, así que
  -- comprobar el tipo y castear en dos condiciones separadas podía castear igual
  -- y levantar 22P02 ("invalid input syntax for type numeric").
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where coalesce(trim(l->>'cod_prod'), '') = ''
        or coalesce(trim(l->>'descripcion'), '') = ''
        or case when jsonb_typeof(l->'cantidad') = 'number'
                then (l->>'cantidad')::numeric <= 0
                else true
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales sin código o con cantidad inválida');
  end if;

  -- Estos dos vienen del ERP, no del empleado: mensaje aparte para que la PWA
  -- no le señale un campo que él nunca llenó.
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where coalesce(jsonb_typeof(l->'costo_unitario')      not in ('number','null'), false)
        or coalesce(jsonb_typeof(l->'existencia_al_pedir') not in ('number','null'), false)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Los datos del catálogo llegaron corruptos, vuelve a buscar el material');
  end if;

  -- ★ NUEVO: el área, cuando viene, tiene que ser una de las cuatro. Viene
  -- ausente en las sucursales que no usan áreas, y eso es válido.
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where nullif(trim(coalesce(l->>'area', '')), '') is not null
       and trim(l->>'area') not in ('FERRETERIA','NAVE1','NAVE2','NAVE3')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales con un área desconocida');
  end if;

  select trim(concat_ws(' ', e.nombre, e.apellido)), e.sucursal
    into v_nombre, v_suc_larga
    from public.empleados e
   where e.id = p_empleado_id and e.activo;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Empleado no encontrado o inactivo');
  end if;

  select m.abrev, m.cod_estab
    into v_abrev, v_cod_estab
    from public.sucursales_map m
   where extensions.unaccent(upper(btrim(m.nombre_largo)))
       = extensions.unaccent(upper(btrim(coalesce(v_suc_larga, ''))));

  if v_abrev is null then
    return jsonb_build_object('ok', false, 'error', 'Tu sucursal no está configurada, avisa a sistemas');
  end if;

  insert into public.rnd_material_solicitudes
    (empleado_id, empleado_nombre, sucursal, cod_estab, nota)
  values
    (p_empleado_id, v_nombre, v_abrev, v_cod_estab, nullif(trim(coalesce(p_nota, '')), ''))
  returning id, folio into v_id, v_folio;

  insert into public.rnd_material_lineas
    (solicitud_id, orden, cod_prod, descripcion, unidad, cantidad, costo_unitario, existencia_al_pedir, area)
  select v_id,
         (t.ord - 1)::int,
         trim(t.l->>'cod_prod'),
         trim(t.l->>'descripcion'),
         nullif(trim(coalesce(t.l->>'unidad', '')), ''),
         (t.l->>'cantidad')::numeric,
         nullif(t.l->>'costo_unitario', '')::numeric,
         nullif(t.l->>'existencia_al_pedir', '')::numeric,
         nullif(trim(coalesce(t.l->>'area', '')), '')
    from jsonb_array_elements(p_lineas) with ordinality as t(l, ord);

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'lineas', v_n);
end;
$$;
```

Apply it with `apply_migration`, name `0031b_material_crear_area`.

- [ ] **Step 5: Verify end to end that a new request stores the area**

Create a request from the employee PWA (or call the API) with a Mochis product that has a zone, then:

```sql
select l.cod_prod, l.area, s.folio, s.sucursal
  from public.rnd_material_lineas l
  join public.rnd_material_solicitudes s on s.id = l.solicitud_id
 order by s.creado_en desc limit 5;
```

Expected: the new line shows `FERRETERIA` (or the corresponding nave), not null.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0031_material_area_linea.sql supabase/migrations/0031b_material_crear_area.sql
git commit -m "feat(uso-interno): las partidas guardan el área que las entrega"
```

---

## Task 6: `material_entregar` cierra por área, no por solicitud

**Files:**
- Create: `supabase/migrations/0032_material_entregar_por_area.sql`

**Este es el corazón del cambio.** Hoy la función marca `estado='entregada'` sin mirar quién entregó qué. Ahora:

1. Recibe `p_area` (el área de quien entrega; null = entrega todo, comportamiento viejo).
2. Solo acepta entregas de líneas de esa área.
3. Escribe `cantidad_entregada` **solo** en esas líneas.
4. Cierra la solicitud **solo si ya no quedan líneas con `cantidad_entregada is null`**.
5. Si quedan, la solicitud sigue `autorizada` y devuelve el avance.

**Decisión clave — el código no se gasta.** El código de 6 dígitos es del empleado y es el mismo para las tres áreas. `codigo_usado_en` solo se sella en el cierre final; si se sellara en la primera área, no cambiaría nada funcional (la verificación es contra `codigo_hash`), pero el dato mentiría sobre cuándo se completó la entrega.

**Decisión clave — la evidencia.** Cada área sube su propia foto. `evidencia_path` (singular) se queda con la foto de la última área para no romper lecturas existentes, y las fotos por área se guardan en una tabla nueva.

> ### ⚠️ Lo que se ELIMINA de la función vieja — no lo vuelvas a poner
>
> La versión actual termina con este bloque, justo antes de cerrar la solicitud (`0029`, líneas 137-140):
>
> ```sql
> -- ❌ ESTO SE VA. No lo reintroduzcas.
> update public.rnd_material_lineas
>    set cantidad_entregada = 0
>  where solicitud_id = p_id
>    and cantidad_entregada is null;
> ```
>
> Tenía sentido cuando una sola persona cerraba todo de un golpe: lo que no se capturó, no se entregó. **Con entrega por área es exactamente el bug que venimos a arreglar.** Cuando Ferretería entrega lo suyo, ese `update` pondría en 0 todas las líneas de Nave 2 y Nave 3; como el cierre se decide contando líneas con `cantidad_entregada is null`, la solicitud cerraría de inmediato con las naves marcadas como "entregado 0" sin que nadie de naves haya tocado nada.
>
> `null` ahora significa "todavía nadie de esa área ha entregado" y es la única señal de que falta algo. Es lo que hace funcionar el cierre parcial. Si al implementar te parece que "faltó" ese bloque porque la función vieja lo tenía: no faltó, se quitó a propósito.
>
> El caso legítimo que cubría —"no había nada de ese material"— lo sigue cubriendo el encargado capturando `0` a mano, y la RPC lo acepta (`cantidad_entregada >= 0`).

- [ ] **Step 1: Create the evidence-per-area table**

Create `supabase/migrations/0032_material_entregar_por_area.sql`, starting with:

```sql
-- Una entrega por área. La solicitud ya no se cierra de un golpe: cada
-- encargado marca lo suyo y la última en entregar es la que cierra.

create table if not exists public.rnd_material_entregas_area (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.rnd_material_solicitudes(id) on delete cascade,
  area           text not null check (area in ('FERRETERIA','NAVE1','NAVE2','NAVE3')),
  entregado_por  text not null,
  fecha_entrega  timestamptz not null default now(),
  evidencia_path text not null,
  -- Una sola entrega por área y solicitud: si el encargado de Ferretería ya
  -- entregó, no puede volver a "entregar" lo mismo.
  unique (solicitud_id, area)
);

create index if not exists idx_material_entregas_area_solicitud
  on public.rnd_material_entregas_area (solicitud_id);

alter table public.rnd_material_entregas_area enable row level security;

-- Igual que las otras dos tablas del módulo: lectura abierta al escritorio,
-- escritura solo por RPC security definer.
drop policy if exists "lectura entregas area" on public.rnd_material_entregas_area;
create policy "lectura entregas area"
  on public.rnd_material_entregas_area for select
  to anon, authenticated using (true);
```

- [ ] **Step 2: Append the new material_entregar to the same migration file**

```sql
drop function if exists public.material_entregar(uuid, text, jsonb, text, text, text);

create function public.material_entregar(
  p_id uuid, p_usuario text, p_entregas jsonb, p_sucursal text,
  p_codigo text, p_evidencia_path text, p_area text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_estado text; v_folio text; v_suc text; v_n int; v_recibidas int;
  v_hash text; v_intentos int; v_bloq timestamptz;
  v_area text; v_pendientes int; v_lineas_area int; v_cerrada boolean;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién entrega');
  end if;
  if coalesce(trim(p_sucursal), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la sucursal de quien entrega');
  end if;
  if coalesce(trim(p_evidencia_path), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la foto de la entrega');
  end if;
  if p_entregas is not null and jsonb_typeof(p_entregas) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Las entregas deben venir en una lista');
  end if;

  -- null = encargado sin área (sucursales que no las usan): entrega todo, que
  -- es el comportamiento anterior a este cambio.
  v_area := nullif(trim(coalesce(p_area, '')), '');
  if v_area is not null and v_area not in ('FERRETERIA','NAVE1','NAVE2','NAVE3') then
    return jsonb_build_object('ok', false, 'error', 'Área desconocida: ' || v_area);
  end if;

  select estado, folio, sucursal, codigo_hash, codigo_intentos, codigo_bloqueado_hasta
    into v_estado, v_folio, v_suc, v_hash, v_intentos, v_bloq
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if trim(p_sucursal) <> '*'
     and upper(btrim(coalesce(v_suc, ''))) <> upper(btrim(p_sucursal)) then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud es de otra sucursal');
  end if;
  if v_estado <> 'autorizada' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Solo se entrega lo autorizado; esta solicitud está ' || v_estado);
  end if;

  -- Bloqueo vigente: ni siquiera se gasta intento.
  if v_bloq is not null and v_bloq > now() then
    return jsonb_build_object('ok', false, 'error',
      'Demasiados intentos con el código. Espera unos minutos y vuelve a intentar.');
  end if;
  if v_bloq is not null and v_bloq <= now() then
    update public.rnd_material_solicitudes
       set codigo_intentos = 0, codigo_bloqueado_hasta = null
     where id = p_id;
    v_intentos := 0;
  end if;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error',
      'Esta solicitud no tiene código; pide al gerente que la vuelva a autorizar');
  end if;

  if crypt(coalesce(p_codigo, ''), v_hash) <> v_hash then
    update public.rnd_material_solicitudes
       set codigo_intentos = v_intentos + 1,
           codigo_bloqueado_hasta = case when v_intentos + 1 >= 5
                                         then now() + interval '15 minutes' end
     where id = p_id;
    return jsonb_build_object('ok', false,
      'error', case when v_intentos + 1 >= 5
                    then 'Código incorrecto. Se bloqueó 15 minutos.'
                    else 'Código incorrecto. Quedan ' || (5 - (v_intentos + 1))::text || ' intentos.' end);
  end if;

  -- Doble entrega de la misma área. El UNIQUE lo impediría de todos modos, pero
  -- un mensaje claro vale más que un error de constraint.
  if v_area is not null and exists (
    select 1 from public.rnd_material_entregas_area
     where solicitud_id = p_id and area = v_area
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Esa área ya entregó lo suyo en esta solicitud');
  end if;

  v_recibidas := jsonb_array_length(coalesce(p_entregas, '[]'::jsonb));
  if v_recibidas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'No se capturó ninguna cantidad; si no se surtió nada, captura ceros');
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
     where coalesce(e->>'linea_id', '') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or case when jsonb_typeof(e->'cantidad_entregada') = 'number'
                then (e->>'cantidad_entregada')::numeric < 0
                else true
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay cantidades entregadas inválidas');
  end if;

  if v_recibidas <> (
    select count(distinct (e->>'linea_id')::uuid)
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales repetidos en la entrega');
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
     where not exists (
       select 1 from public.rnd_material_lineas l
        where l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     )
  ) then
    return jsonb_build_object('ok', false, 'error', 'Alguna línea no pertenece a esta solicitud');
  end if;

  -- ★ El corazón del cambio: no puedes marcar entregado lo que no es tuyo.
  -- Una línea sin área la entrega cualquiera (líneas viejas, sucursales sin
  -- áreas); una línea con área solo la entrega su encargado.
  if v_area is not null and exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where l.area is not null and l.area <> v_area
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Hay materiales que no son de tu área; solo puedes entregar los tuyos');
  end if;

  -- No se puede re-entregar lo que otra área ya marcó.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where l.cantidad_entregada is not null
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Alguno de esos materiales ya se había entregado');
  end if;

  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where (e->>'cantidad_entregada')::numeric > l.cantidad
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes entregar más de lo que se pidió');
  end if;

  -- Debe venir TODA su área, no una parte. Si el encargado de Ferretería manda
  -- 2 de sus 5 partidas, las otras 3 quedarían pendientes para siempre sin que
  -- nadie sepa que faltan.
  if v_area is not null then
    select count(*) into v_lineas_area
      from public.rnd_material_lineas
     where solicitud_id = p_id and area = v_area and cantidad_entregada is null;
    if v_recibidas <> v_lineas_area then
      return jsonb_build_object('ok', false,
        'error', 'Faltan materiales de tu área por capturar: son ' || v_lineas_area::text ||
                 ' y llegaron ' || v_recibidas::text);
    end if;
  end if;

  update public.rnd_material_lineas l
     set cantidad_entregada = (e->>'cantidad_entregada')::numeric
    from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
   where l.solicitud_id = p_id
     and l.id = (e->>'linea_id')::uuid;
  get diagnostics v_n = row_count;

  if v_n <> v_recibidas then
    raise exception 'material_entregar: se recibieron % entregas y se escribieron % líneas', v_recibidas, v_n;
  end if;

  if v_area is not null then
    insert into public.rnd_material_entregas_area
      (solicitud_id, area, entregado_por, fecha_entrega, evidencia_path)
    values (p_id, v_area, trim(p_usuario), now(), trim(p_evidencia_path));
  end if;

  -- ¿Queda algo por entregar? Esto es lo que decide si la solicitud se cierra.
  select count(*) into v_pendientes
    from public.rnd_material_lineas
   where solicitud_id = p_id and cantidad_entregada is null;

  v_cerrada := (v_pendientes = 0);

  if v_cerrada then
    update public.rnd_material_solicitudes
       set estado          = 'entregada',
           entregado_por   = trim(p_usuario),
           fecha_entrega   = now(),
           codigo_usado_en = now(),
           evidencia_path  = trim(p_evidencia_path)
     where id = p_id;
  else
    -- Sigue 'autorizada'. Se guarda la última foto para que la solicitud
    -- siempre tenga una evidencia visible aunque todavía no cierre.
    update public.rnd_material_solicitudes
       set evidencia_path = trim(p_evidencia_path)
     where id = p_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'estado', case when v_cerrada then 'entregada' else 'autorizada' end,
    'folio', v_folio,
    'lineas', v_n,
    'recibidas', v_recibidas,
    'cerrada', v_cerrada,
    'pendientes', v_pendientes,
    'area', v_area);
end;
$$;

revoke execute on function public.material_entregar(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.material_entregar(uuid, text, jsonb, text, text, text, text) to service_role;
```

- [ ] **Step 3: Apply the migration**

Use `apply_migration` with name `0032_material_entregar_por_area`.

- [ ] **Step 4: Verify partial delivery works — the whole point of this task**

Use `execute_sql`. Create a request with lines in two areas, then deliver one and confirm it does NOT close:

```sql
do $$
declare
  v_sol uuid; v_l1 uuid; v_l2 uuid; v_r jsonb; v_estado text;
begin
  insert into public.rnd_material_solicitudes
    (empleado_id, empleado_nombre, sucursal, cod_estab, estado, codigo_hash)
  values (1, 'PRUEBA AREA', 'LMM', 1, 'autorizada', crypt('123456', gen_salt('bf')))
  returning id into v_sol;

  insert into public.rnd_material_lineas (solicitud_id, orden, cod_prod, descripcion, cantidad, area)
  values (v_sol, 1, 'FER001', 'PIJA', 10, 'FERRETERIA') returning id into v_l1;
  insert into public.rnd_material_lineas (solicitud_id, orden, cod_prod, descripcion, cantidad, area)
  values (v_sol, 2, 'CEM001', 'CEMENTO', 5, 'NAVE2') returning id into v_l2;

  -- Ferretería entrega lo suyo
  v_r := public.material_entregar(v_sol, 'ENCARGADO FERRE',
           jsonb_build_array(jsonb_build_object('linea_id', v_l1, 'cantidad_entregada', 10)),
           'LMM', '123456', 'entregas/x/f1.jpg', 'FERRETERIA');
  raise notice 'ferreteria -> %', v_r;
  if (v_r->>'cerrada')::boolean then raise exception 'FALLO: cerró con una sola área'; end if;

  select estado into v_estado from public.rnd_material_solicitudes where id = v_sol;
  if v_estado <> 'autorizada' then raise exception 'FALLO: estado quedó % y debía seguir autorizada', v_estado; end if;

  -- Ferretería no puede tocar lo de Nave 2
  v_r := public.material_entregar(v_sol, 'ENCARGADO FERRE',
           jsonb_build_array(jsonb_build_object('linea_id', v_l2, 'cantidad_entregada', 5)),
           'LMM', '123456', 'entregas/x/f2.jpg', 'FERRETERIA');
  raise notice 'ferre invade nave2 -> %', v_r;
  if (v_r->>'ok')::boolean then raise exception 'FALLO: Ferretería entregó material de Nave 2'; end if;

  -- Nave 2 entrega y AHORA sí cierra
  v_r := public.material_entregar(v_sol, 'ENCARGADO NAVE2',
           jsonb_build_array(jsonb_build_object('linea_id', v_l2, 'cantidad_entregada', 5)),
           'LMM', '123456', 'entregas/x/n2.jpg', 'NAVE2');
  raise notice 'nave2 -> %', v_r;
  if not (v_r->>'cerrada')::boolean then raise exception 'FALLO: no cerró con todas las áreas'; end if;

  select estado into v_estado from public.rnd_material_solicitudes where id = v_sol;
  if v_estado <> 'entregada' then raise exception 'FALLO: estado final % y debía ser entregada', v_estado; end if;

  raise notice 'OK: entrega parcial por área funciona';
  delete from public.rnd_material_solicitudes where id = v_sol;
end $$;
```

Expected: `NOTICE: OK: entrega parcial por área funciona`, sin excepciones.

- [ ] **Step 5: Verify the old behaviour still works for other branches**

```sql
do $$
declare v_sol uuid; v_l uuid; v_r jsonb;
begin
  insert into public.rnd_material_solicitudes
    (empleado_id, empleado_nombre, sucursal, cod_estab, estado, codigo_hash)
  values (1, 'PRUEBA SIN AREA', 'FTE', 3, 'autorizada', crypt('654321', gen_salt('bf')))
  returning id into v_sol;
  insert into public.rnd_material_lineas (solicitud_id, orden, cod_prod, descripcion, cantidad, area)
  values (v_sol, 1, 'X1', 'COSA', 3, null) returning id into v_l;

  -- Sin p_area: un solo encargado entrega todo, como siempre
  v_r := public.material_entregar(v_sol, 'ALMACEN FTE',
           jsonb_build_array(jsonb_build_object('linea_id', v_l, 'cantidad_entregada', 3)),
           'FTE', '654321', 'entregas/y/f.jpg');
  raise notice 'sin area -> %', v_r;
  if not (v_r->>'cerrada')::boolean then raise exception 'FALLO: rompimos las sucursales sin áreas'; end if;
  raise notice 'OK: las sucursales sin áreas siguen igual';
  delete from public.rnd_material_solicitudes where id = v_sol;
end $$;
```

Expected: `NOTICE: OK: las sucursales sin áreas siguen igual`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0032_material_entregar_por_area.sql
git commit -m "feat(uso-interno): cada área entrega lo suyo y la última cierra la solicitud"
```

---

## Task 7: El encargado tiene área

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Modify: `src/lib/materiales/actor.ts:10-41`
- Modify: `src/lib/materiales/actor.test.ts`
- Create: `supabase/migrations/0033_rnd_usuarios_area.sql`

**Contexto:** el área del encargado debe salir de la sesión firmada, igual que la sucursal. Si viniera del body, cualquiera podría decir "soy de Ferretería" y entregar lo que no es suyo.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0033_rnd_usuarios_area.sql`:

```sql
-- Área del encargado de almacén. Null = entrega todo (sucursales sin áreas).
alter table public.rnd_usuarios
  add column if not exists area text;

alter table public.rnd_usuarios
  drop constraint if exists rnd_usuarios_area_check;

alter table public.rnd_usuarios
  add constraint rnd_usuarios_area_check
  check (area is null or area in ('FERRETERIA','NAVE1','NAVE2','NAVE3'));

comment on column public.rnd_usuarios.area is
  'Área del encargado de almacén en Los Mochis. Null = entrega todas las '
  'partidas, que es como funcionan las demás sucursales.';
```

Apply it with `apply_migration`, name `0033_rnd_usuarios_area`.

- [ ] **Step 2: Write the failing test**

Append to `src/lib/materiales/actor.test.ts` (follow the existing mocking style in that file for `cookies` and `verificarSesion`):

```ts
describe("actorDeMaterial — área", () => {
  it("lleva el área de la sesión al actor", async () => {
    // Sesión de rol almacen con area = 'NAVE2'
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBe("NAVE2");
  });

  it("deja el área en null cuando el usuario no tiene (sucursal sin áreas)", async () => {
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBeNull();
  });

  // Un área inventada en la sesión no debe convertirse en permiso.
  it("descarta un área que no está en el catálogo", async () => {
    const r = await actorDeMaterial("materiales-almacen");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actor.area).toBeNull();
  });
});
```

Adapt each case to set the session fixture the way the existing tests in this file do (they already stub `verificarSesion`); each `it` needs its own session with `area: "NAVE2"`, `area: null`, and `area: "PATIO"` respectively.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/materiales/actor.test.ts`

Expected: FAIL — `Property 'area' does not exist on type 'Actor'`

- [ ] **Step 4: Add area to Actor**

In `src/lib/materiales/actor.ts`, add to the imports:

```ts
import { tabsDeRol, esArea, type TabId, type Area } from "@devoluciones/domain";
```

Replace the `Actor` interface (lines 10-14) with:

```ts
export interface Actor {
  nombre: string;
  /** Abreviatura (LMM, FTE…) o '*' para admin, que ve todas. */
  sucursal: string;
  /**
   * Área que le toca entregar. Null = entrega todas las partidas, que es como
   * funcionan las sucursales sin áreas. Sale de la sesión firmada y de ningún
   * otro lado: si viniera del body, cualquiera diría ser de Ferretería.
   */
  area: Area | null;
}
```

And replace the final `return` (line 40) with:

```ts
  // esArea filtra cualquier valor que no sea una de las cuatro: un área
  // desconocida vale lo mismo que no tener área (entrega todo), nunca un
  // permiso nuevo.
  const area = esArea(sesion.area) ? sesion.area : null;

  return { ok: true, actor: { nombre: sesion.nombre, sucursal, area } };
```

- [ ] **Step 5: Carry `area` through the session — CADENA COMPLETA**

⚠️ El plan original decía "añade `area` a la sesión" como si fuera un archivo. Son **cuatro**, y falta cualquiera de ellos = `area` llega `undefined`, todos los encargados entregan todo, y el bug sigue vivo sin dar ningún error:

```
rnd_usuarios.area
   └─> Edge Function login-comida   ← el eslabón que el plan se saltaba
         └─> src/app/api/login/route.ts
               └─> src/lib/auth/sesionEscritorio.ts  (firma + verifica)
                     └─> actorDeMaterial → p_area
```

**5a. Edge Function `login-comida`** (se despliega con `deploy_edge_function`, slug `login-comida`). Dos cambios: añadir `area` al `.select(...)` y devolverla en el objeto `usuario`:

```ts
      .select("email, password, nombre, rol, sucursal, area, activo")
```

```ts
      usuario: {
        email: String(u.email),
        nombre: String(u.nombre),
        rol: String(u.rol),
        sucursal: u.sucursal ? String(u.sucursal) : null,
        // Área del encargado de almacén (Los Mochis). null = entrega todo.
        area: u.area ? String(u.area) : null,
      },
```

**5b. `src/app/api/login/route.ts`** — añadir `area` al tipo de `datos.usuario` (línea 28) y al objeto `sesion` (líneas 45-51):

```ts
  let datos: { ok?: boolean; usuario?: { email: string; nombre: string; rol: string; sucursal: string | null; area?: string | null }; error?: string };
```

```ts
  const sesion: Sesion = {
    email: datos.usuario.email,
    nombre: datos.usuario.nombre,
    rol: normalizarRol(datos.usuario.rol),
    rolCrudo: datos.usuario.rol,
    sucursal: datos.usuario.sucursal,
    area: esArea(datos.usuario.area) ? datos.usuario.area : null,
  };
```

Import `esArea` from `@devoluciones/domain` at the top.

**5c. `src/lib/auth/sesionEscritorio.ts`** — añadir el campo al tipo y validarlo al verificar. `Sesion`:

```ts
export interface Sesion {
  email: string;
  nombre: string;
  rol: Rol; // ya normalizado
  rolCrudo: string; // el rol tal cual vino de la BD
  sucursal: string | null;
  /** Área del encargado de almacén. null = entrega todas las partidas. */
  area: Area | null;
}
```

En `verificarSesion`, dentro del `return`, después de `sucursal`:

```ts
      // Se valida contra el catálogo al leer, igual que el rol se re-normaliza:
      // un área inventada en un token viejo vale lo mismo que no tener área.
      area: esArea(obj.area) ? obj.area : null,
```

Import `esArea` y el tipo `Area` from `@devoluciones/domain`.

Sesiones ya emitidas no traen `area`, así que `obj.area` es `undefined` → `null` → entregan todo, que es el comportamiento anterior. **Nadie se queda fuera al desplegar**, solo hay que volver a entrar para que el área tome efecto.

**5d. `AuthContext`** — la pantalla de almacén lee `sesion?.area`. Busca el tipo de sesión del cliente con `grep -rn "sucursal" src/lib/auth/AuthContext.tsx` y añade `area` de la misma forma.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/materiales/actor.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/roles.ts src/lib/materiales/actor.ts src/lib/materiales/actor.test.ts src/lib/auth/sesionEscritorio.ts supabase/migrations/0033_rnd_usuarios_area.sql
git commit -m "feat(uso-interno): el encargado de almacén trae su área en la sesión"
```

---

## Task 8: La ruta manda el área al RPC

**Files:**
- Modify: `src/app/api/materiales/entregar/route.ts:32-39`

- [ ] **Step 1: Pass the actor's area**

In `src/app/api/materiales/entregar/route.ts`, replace the `llamarRpcMaterial` call (lines 32-39) with:

```ts
  const r = await llamarRpcMaterial("material_entregar", {
    p_id: id,
    p_usuario: quien.actor.nombre,
    p_entregas: normalizadas,
    p_sucursal: quien.actor.sucursal,
    p_codigo: typeof codigo === "string" ? codigo : "",
    p_evidencia_path: typeof evidenciaPath === "string" ? evidenciaPath : "",
    // Del actor, jamás del body: el área es lo que decide qué partidas puede
    // marcar entregadas, así que es una credencial, no un dato de formulario.
    p_area: quien.actor.area,
  });
```

- [ ] **Step 2: Only notify the employee when the request actually closes**

Replace line 40 with:

```ts
  // El aviso "ya está listo" solo cuando cerró de verdad. Si todavía faltan
  // áreas, mandarlo haría que el empleado fuera por material que no está.
  if (r.ok && r.cerrada) await avisarEmpleado(id, "material_entregada");
```

Check the return type of `llamarRpcMaterial` in `src/lib/materiales/rpc.ts` — if it's narrowly typed, widen it to include `cerrada?: boolean`, `pendientes?: number` and `area?: string | null`.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/materiales/entregar/route.ts src/lib/materiales/rpc.ts
git commit -m "feat(uso-interno): la entrega se hace con el área de quien la marca"
```

---

## Task 9: Resumen de avance por área

**Files:**
- Modify: `src/lib/materiales/totales.ts`
- Modify: `src/lib/materiales/totales.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/materiales/totales.test.ts`:

```ts
import { resumenPorArea } from "./totales";

const linea = (over: Partial<LineaGuardada>): LineaGuardada => ({
  id: crypto.randomUUID(),
  orden: 1,
  cod_prod: "X",
  descripcion: "X",
  unidad: "PZ",
  cantidad: 1,
  costo_unitario: null,
  existencia_al_pedir: null,
  cantidad_entregada: null,
  area: null,
  ...over,
});

describe("resumenPorArea", () => {
  it("agrupa las líneas por área y cuenta lo entregado", () => {
    const r = resumenPorArea([
      linea({ area: "FERRETERIA", cantidad_entregada: 5 }),
      linea({ area: "FERRETERIA", cantidad_entregada: 2 }),
      linea({ area: "NAVE2", cantidad_entregada: null }),
    ]);
    expect(r).toEqual([
      { area: "FERRETERIA", total: 2, entregadas: 2, completa: true },
      { area: "NAVE2", total: 1, entregadas: 0, completa: false },
    ]);
  });

  it("una entrega de cero cuenta como entregada", () => {
    const r = resumenPorArea([linea({ area: "NAVE1", cantidad_entregada: 0 })]);
    expect(r[0]!.completa).toBe(true);
    expect(r[0]!.entregadas).toBe(1);
  });

  it("respeta el orden del catálogo, no el de las líneas", () => {
    const r = resumenPorArea([
      linea({ area: "NAVE3" }),
      linea({ area: "FERRETERIA" }),
      linea({ area: "NAVE1" }),
    ]);
    expect(r.map((x) => x.area)).toEqual(["FERRETERIA", "NAVE1", "NAVE3"]);
  });

  it("ignora las líneas sin área", () => {
    expect(resumenPorArea([linea({ area: null })])).toEqual([]);
  });

  it("devuelve vacío sin líneas", () => {
    expect(resumenPorArea([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/materiales/totales.test.ts`

Expected: FAIL — `resumenPorArea is not exported`

- [ ] **Step 3: Add `area` to LineaGuardada and write resumenPorArea**

In `src/lib/materiales/totales.ts`, add the import:

```ts
import { AREAS, type Area } from "@devoluciones/domain";
```

Add the field to `LineaGuardada` (after `cantidad_entregada`):

```ts
  /** Área que la entrega. Null = la entrega cualquiera (sucursal sin áreas). */
  area: Area | null;
```

Then append:

```ts
export interface AvanceArea {
  area: Area;
  /** Partidas de esa área en la solicitud. */
  total: number;
  /** Cuántas ya tienen cantidad capturada. */
  entregadas: number;
  completa: boolean;
}

/**
 * Avance de la entrega, área por área. Sirve para "2 de 3 áreas entregadas".
 *
 * `cantidad_entregada = 0` cuenta como entregada: el encargado capturó que no
 * había, y eso es una entrega hecha, no una pendiente. Lo pendiente es null.
 */
export function resumenPorArea(lineas: readonly LineaGuardada[]): AvanceArea[] {
  const out: AvanceArea[] = [];
  for (const area of AREAS) {
    const suyas = lineas.filter((l) => l.area === area);
    if (suyas.length === 0) continue;
    const entregadas = suyas.filter((l) => l.cantidad_entregada !== null).length;
    out.push({
      area,
      total: suyas.length,
      entregadas,
      completa: entregadas === suyas.length,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/materiales/totales.test.ts`

Expected: PASS

- [ ] **Step 5: Add `area` to the Supabase select**

In `src/lib/supabase/queries/materiales.ts`, replace the `rnd_material_lineas(...)` part of `CAMPOS` with:

```ts
  "rnd_material_lineas(id,orden,cod_prod,descripcion,unidad,cantidad,costo_unitario,existencia_al_pedir,cantidad_entregada,area)";
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/materiales/totales.ts src/lib/materiales/totales.test.ts src/lib/supabase/queries/materiales.ts
git commit -m "feat(uso-interno): resumen de avance por área"
```

---

## Task 10: Progreso de áreas visible

**Files:**
- Create: `src/components/materiales/ProgresoAreas.tsx`
- Modify: `src/components/materiales/SolicitudCard.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/materiales/ProgresoAreas.tsx`:

```tsx
"use client";
import { etiquetaArea } from "@devoluciones/domain";
import type { AvanceArea } from "@/lib/materiales/totales";

// "2 de 3 áreas entregadas", con el detalle de cuál falta. Sin esto, una
// solicitud a medio surtir se ve igual que una intacta y nadie sabe a quién
// apurar.

export function ProgresoAreas({ avance }: { avance: AvanceArea[] }) {
  if (avance.length <= 1) return null; // una sola área: no hay nada que repartir

  const listas = avance.filter((a) => a.completa).length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-600">
        {listas} de {avance.length} áreas entregadas
      </span>
      {avance.map((a) => (
        <span
          key={a.area}
          className={
            a.completa
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
              : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          }
          title={`${a.entregadas} de ${a.total} materiales`}
        >
          {a.completa ? "✓" : "○"} {etiquetaArea(a.area)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Show it in SolicitudCard**

Read `src/components/materiales/SolicitudCard.tsx`. Add the imports:

```tsx
import { ProgresoAreas } from "@/components/materiales/ProgresoAreas";
import { resumenPorArea } from "@/lib/materiales/totales";
```

Inside the component, compute the avance and render it right under the existing status line (near lines 76-89, where "Código verificado" already lives):

```tsx
  const avance = resumenPorArea(solicitud.rnd_material_lineas);
```

```tsx
  <ProgresoAreas avance={avance} />
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `npx tsc --noEmit && npm run lint`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/materiales/ProgresoAreas.tsx src/components/materiales/SolicitudCard.tsx
git commit -m "feat(uso-interno): la solicitud muestra qué áreas ya entregaron"
```

---

## Task 11: Almacén solo captura lo de su área

**Files:**
- Modify: `src/components/materiales/TablaLineas.tsx`
- Modify: `src/app/(app)/materiales-almacen/page.tsx`

**Contexto:** el encargado debe ver la solicitud completa (para saber qué más lleva el empleado) pero solo poder capturar sus partidas. Las de otras áreas se muestran en gris con su etiqueta.

- [ ] **Step 1: Add the area column and lock foreign rows**

In `src/components/materiales/TablaLineas.tsx`, add the import:

```tsx
import { etiquetaArea, type Area } from "@devoluciones/domain";
```

Add `areaDelUsuario` to the props:

```tsx
export function TablaLineas({
  lineas,
  capturable,
  entregas,
  onCambiar,
  areaDelUsuario = null,
}: {
  lineas: LineaGuardada[];
  /** true en la pantalla de almacén, cuando la solicitud está autorizada. */
  capturable: boolean;
  /** Mapa lineaId -> cantidad que se va a entregar (solo en modo captura). */
  entregas: Record<string, number>;
  onCambiar: (lineaId: string, cantidad: number) => void;
  /** Área de quien mira. Null = puede capturar todo (sucursal sin áreas). */
  areaDelUsuario?: Area | null;
}) {
```

Add the header cell after `Código`:

```tsx
            <th className="pb-1.5 pr-4">Área</th>
```

Inside the `map`, right after `const corto = ...`, add:

```tsx
            // Solo se captura lo propio. Una línea sin área la captura
            // cualquiera: así siguen funcionando las sucursales sin áreas y las
            // solicitudes viejas.
            const mia = areaDelUsuario === null || l.area === null || l.area === areaDelUsuario;
            const yaEntregada = l.cantidad_entregada !== null;
```

Add the area cell after the `Código` cell:

```tsx
                <td className="py-1.5 pr-4 text-xs">
                  {l.area === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className={mia ? "text-slate-700" : "text-slate-400"}>
                      {etiquetaArea(l.area)}
                    </span>
                  )}
                </td>
```

Replace the last `<td>` (the capture cell, lines 58-76) with:

```tsx
                <td className="py-1.5 text-right">
                  {capturable && mia && !yaEntregada ? (
                    <input
                      type="number"
                      min={0}
                      max={l.cantidad}
                      aria-label={`Entregado de ${l.descripcion}`}
                      value={entregas[l.id] ?? l.cantidad}
                      onChange={(e) => onCambiar(l.id, Number(e.target.value))}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                    />
                  ) : yaEntregada ? (
                    <span className="text-slate-900">
                      {l.cantidad_entregada} de {l.cantidad}
                    </span>
                  ) : capturable && !mia ? (
                    <span className="text-xs text-slate-400" title="La entrega otra área">
                      otra área
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
```

- [ ] **Step 2: Send only your own lines from the almacén page**

In `src/app/(app)/materiales-almacen/page.tsx`, get the area from the session (line 19 area):

```tsx
  const areaUsuario = sesion?.area ?? null;
```

Replace the `entregas` mapping inside `confirmarEntrega` (lines 51-54) with:

```tsx
    const capturado = capturas[s.id] ?? {};
    // Solo lo de su área y solo lo que no está entregado. Mandar de más lo
    // rechaza la RPC, pero es mejor no pedírselo.
    const mias = s.rnd_material_lineas.filter(
      (l) =>
        l.cantidad_entregada === null &&
        (areaUsuario === null || l.area === null || l.area === areaUsuario),
    );
    if (mias.length === 0) {
      setMsg("⚠ No hay materiales de tu área pendientes en esta solicitud");
      return;
    }
    const entregas = mias.map((l) => ({
      lineaId: l.id,
      cantidadEntregada: capturado[l.id] ?? l.cantidad,
    }));
```

Pass the area to both `TablaLineas` usages (line 128-133):

```tsx
                <TablaLineas
                  lineas={s.rnd_material_lineas}
                  capturable={!verEntregadas}
                  entregas={capturas[s.id] ?? {}}
                  onCambiar={(lineaId, cantidad) => cambiar(s.id, lineaId, cantidad)}
                  areaDelUsuario={areaUsuario}
                />
```

- [ ] **Step 3: Report partial delivery in the success message**

Replace the `onSuccess` callback (lines 73-77) with:

```tsx
          onSuccess: (r) => {
            if (!r.ok) { setMsg(`⚠ ${r.error}`); return; }
            setMsg(
              r.cerrada
                ? `✅ ${s.folio} entregada completa`
                : `✅ Lo tuyo de ${s.folio} quedó entregado. Faltan ${r.pendientes} materiales de otras áreas.`,
            );
            setConfirmar(null); setFoto(null); setCodigo("");
          },
```

- [ ] **Step 4: Fix the dialog counter to only count your own lines**

Replace the `incompletas` computation (lines 143-145) with:

```tsx
        const mias = s.rnd_material_lineas.filter(
          (l) =>
            l.cantidad_entregada === null &&
            (areaUsuario === null || l.area === null || l.area === areaUsuario),
        );
        const incompletas = mias.filter((l) => (capturado[l.id] ?? l.cantidad) < l.cantidad).length;
```

And the dialog message (lines 151-154):

```tsx
                <span>
                  {s.empleado_nombre} · {mias.length} materiales de tu área
                  {incompletas > 0 && (<>{" · "}<strong>{incompletas}</strong> se surten incompletos</>)}
                </span>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/components/materiales/TablaLineas.tsx "src/app/(app)/materiales-almacen/page.tsx"
git commit -m "feat(uso-interno): cada encargado captura solo las partidas de su área"
```

---

## Task 12: Verificación end-to-end y despliegue

- [ ] **Step 1: Full suite**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

Expected: everything passes. Do not proceed if anything fails.

- [ ] **Step 2: Set up the real área users**

Los Mochis needs one `rnd_usuarios` row per área with `rol = 'almacen'`:

```sql
select id, nombre, correo, rol, sucursal, area
  from public.rnd_usuarios
 where rol = 'almacen'
 order by sucursal;
```

For Mochis (`LMM`), each encargado gets their `area` set to one of `FERRETERIA`, `NAVE1`, `NAVE2`, `NAVE3`. Other branches keep `area = null`.

- [ ] **Step 3: Manual test in the real app**

1. As an employee in Los Mochis, request one product from Ferretería and one from a Nave. Confirm the request is created.
2. Try to request a `KITOX` (family PRI, no zone). Confirm it's blocked with the "no tiene área asignada" message.
3. As gerente, authorize it.
4. As the Ferretería encargado, deliver. Confirm: the Nave lines show "otra área" and cannot be captured; after delivering, the request stays in "Por surtir" and shows "1 de 2 áreas entregadas".
5. Confirm the employee did NOT get a push saying it's ready.
6. As the Nave encargado, deliver with the same 6-digit code. Confirm the request closes and the employee gets the push.
7. In another branch (El Fuerte), run a full request start to finish and confirm nothing changed.

- [ ] **Step 4: Push**

```bash
git push pruebas master:master
```

(Remote is `pruebas`, not `origin`.)

- [ ] **Step 5: Hand the CSV to inventarios**

`productos-sin-zona-mochis.csv` (on the Desktop) lists the 152 blocked products, ~$398k. The big wins: families **PRI** (62, pinturas Prisa) and **TRU** (59, Truper/Volteck) are missing entirely — those two alone unblock 80%. They get assigned to zones in BMS; no code change needed afterwards.

Two data problems worth flagging separately:
- `FER175 — FIERRO DAÑADO MIXTO (N.INV)`, 783 kg. "(N.INV)" suggests non-inventoriable on purpose — confirm whether it should be requestable at all.
- `TRU43821-A`, 6 pieces, **null description** — it exists in `prodestab` but not in `productos`. Broken ERP data, independent of this module.

---

## Notas de diseño que no deben perderse

**Por qué el área se congela en la línea y no se consulta al entregar.** Si inventarios mueve un producto de zona entre el pedido y la entrega, una solicitud autorizada cambiaría de encargado a medio camino. Se congela igual que la descripción y el costo, por la misma razón.

**Por qué `p_area` es nullable y no obligatorio.** Es lo que mantiene vivas las otras siete sucursales sin tocarles nada. Un `not null` habría obligado a inventar un área para quien no la tiene.

**Por qué la RPC exige el área COMPLETA.** Si el encargado pudiera mandar 2 de sus 5 partidas, las otras 3 quedarían en null para siempre y la solicitud nunca cerraría, sin que nadie supiera por qué.

**Por qué el push se movió a `r.cerrada`.** Avisar "ya está listo" cuando faltan áreas manda al empleado por material que no está.

**Lo que NO se hizo, a propósito:** no se generan códigos por área (el empleado maneja uno solo, decisión del usuario), no se toca el flujo de autorización del gerente, y no se creó catálogo de áreas por sucursal (solo Mochis las usa; cuando otra sucursal las necesite, se añade la columna a `sucursales_map` y `areaDeZona` no cambia).
