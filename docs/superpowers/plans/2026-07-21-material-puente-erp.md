# Solicitud de Material — Puente al ERP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app pueda buscar materiales del ERP (código, descripción, unidad, existencia y costo de la sucursal) sin exponer el servidor interno ni su llave al navegador.

**Architecture:** Dos piezas en dos proyectos. En **censos-web** (Node/Express on-premise, ya conectado a SQL Server) un endpoint nuevo `GET /api/materiales` protegido por llave de header. En **Devoluciones** un route handler `GET /api/materiales` que corre solo en el servidor, guarda la llave, resuelve el `cod_estab` de la sesión del empleado y normaliza la respuesta. El navegador nunca ve la dirección interna ni la llave.

**Tech Stack:** Node/Express + mssql (censos-web), Next.js 16 route handlers, TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-solicitud-material-design.md` (§3.5, §3.6)

**Requisito previo:** el plan `2026-07-21-material-cimientos.md` debe estar completo (`sucursales_map.cod_estab` tiene que existir).

**Contexto de censos-web verificado el 2026-07-21:**
- Vive en `C:\censos-web`, corre en `http://localhost:3800` (`app.js`), conectado a SQL Server `BMSCabos` en `SERVERADP\CABOS`.
- Tablas del ERP: `productos` (`cod_prod`, `descripcion`, `unidad_compra`), `unidades` (`unidad`, `abreviatura`), `prodestab` (`cod_prod`, `cod_estab`, `exist_unidades`, `costo_promedio`).
- `config/sucursales.js` exporta `tablaBMS(tabla, estabsInv)`, que enruta por linked server cuando el establecimiento es remoto (**solo CSL Brisas, estab 8, vive en `SVRCSL\CABOS`**).
- Su middleware actual (`middleware/auth.js`) es **solo de sesión con cookie**: `requireAuth` y `requireRole`. No sirve para llamadas máquina-a-máquina.
- Sus tests son scripts de node planos con `assert` (`node services/contarFoto.test.js`), sin runner. Aquí se sigue ese estilo.

---

## File Structure

**En `C:\censos-web`:**
- **Modify** `middleware/auth.js` — agrega `requireApiKey`, hermano de `requireAuth`.
- **Create** `middleware/auth.test.js` — test del middleware nuevo, estilo node+assert.
- **Create** `models/materiales.js` — la consulta al ERP. Aislada del router para poder leerla y cambiarla sin tocar HTTP.
- **Create** `routes/materiales.js` — el endpoint HTTP. Solo valida entrada y delega.
- **Modify** `app.js` — monta el router.
- **Modify** `.env` — agrega `MATERIALES_API_KEY`.

**En Devoluciones:**
- **Create** `src/lib/materiales/tipos.ts` — el tipo `Material`, compartido por todo el módulo.
- **Create** `src/lib/materiales/normalizar.ts` — función pura que limpia lo que devuelve el ERP.
- **Create** `src/lib/materiales/normalizar.test.ts` — sus tests.
- **Create** `src/lib/materiales/sucursal.ts` — resuelve `empleado_id` → `{ abrev, codEstab }`.
- **Create** `src/app/api/materiales/route.ts` — el route handler.
- **Modify** `.env.local` — agrega `CENSOS_API_URL` y `CENSOS_API_KEY`.

---

## Task 1: Middleware de llave en censos-web

**Files:**
- Modify: `C:\censos-web\middleware\auth.js`
- Test: `C:\censos-web\middleware\auth.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crea `C:\censos-web\middleware\auth.test.js` con este contenido exacto:

```js
const assert = require('assert');
const { requireApiKey } = require('./auth');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

(async () => {
  const anterior = process.env.MATERIALES_API_KEY;
  process.env.MATERIALES_API_KEY = 'llave-de-prueba';

  // 1) Con la llave correcta pasa
  let paso = false;
  requireApiKey({ headers: { 'x-api-key': 'llave-de-prueba' } }, fakeRes(), () => { paso = true; });
  assert.strictEqual(paso, true, 'con la llave correcta debe llamar a next()');

  // 2) Con llave equivocada responde 401 y NO pasa
  paso = false;
  let res = fakeRes();
  requireApiKey({ headers: { 'x-api-key': 'otra' } }, res, () => { paso = true; });
  assert.strictEqual(paso, false, 'con llave equivocada no debe pasar');
  assert.strictEqual(res.statusCode, 401);

  // 3) Sin llave responde 401
  paso = false;
  res = fakeRes();
  requireApiKey({ headers: {} }, res, () => { paso = true; });
  assert.strictEqual(paso, false, 'sin llave no debe pasar');
  assert.strictEqual(res.statusCode, 401);

  // 4) Si el servidor no tiene llave configurada, se cierra (503), no se abre
  delete process.env.MATERIALES_API_KEY;
  paso = false;
  res = fakeRes();
  requireApiKey({ headers: { 'x-api-key': 'lo-que-sea' } }, res, () => { paso = true; });
  assert.strictEqual(paso, false, 'sin llave configurada NO debe dejar pasar a nadie');
  assert.strictEqual(res.statusCode, 503);

  process.env.MATERIALES_API_KEY = anterior;
  console.log('OK auth.test.js');
})();
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
cd /c/censos-web && node middleware/auth.test.js
```

Esperado: **FALLA** con `TypeError: requireApiKey is not a function`.

- [ ] **Step 3: Implementar el middleware**

En `C:\censos-web\middleware\auth.js`, agrega esta función antes del `module.exports`:

```js
/**
 * Autenticación máquina-a-máquina por llave compartida, para que otras apps
 * internas (hoy: Devoluciones AC) consulten el catálogo del ERP.
 * Deliberadamente distinto de requireAuth: aquí no hay sesión ni usuario.
 * Si el servidor no tiene MATERIALES_API_KEY configurada, se cierra en vez de
 * abrirse: una llave vacía nunca debe equivaler a "cualquiera pasa".
 */
function requireApiKey(req, res, next) {
  const esperada = process.env.MATERIALES_API_KEY;
  if (!esperada) {
    return res.status(503).json({ ok: false, error: 'API de materiales no configurada' });
  }
  const recibida = req.headers['x-api-key'];
  if (recibida !== esperada) {
    return res.status(401).json({ ok: false, error: 'Llave invalida' });
  }
  next();
}
```

Y cambia el `module.exports` final por:

```js
module.exports = { requireAuth, requireRole, requireApiKey };
```

- [ ] **Step 4: Correr el test para verlo pasar**

```bash
cd /c/censos-web && node middleware/auth.test.js
```

Esperado: `OK auth.test.js` y salida sin errores.

- [ ] **Step 5: Definir la llave**

Agrega al final de `C:\censos-web\.env` (inventa una cadena larga y aleatoria; **este valor no se commitea**, `.env` está en `.gitignore`):

```
# Llave para que otras apps internas consulten el catalogo de materiales
MATERIALES_API_KEY=<cadena-larga-aleatoria>
```

Genera una así y usa la salida:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarda ese valor: el route handler de Devoluciones necesita **el mismo**.

- [ ] **Step 6: Commit**

```bash
cd /c/censos-web && git add middleware/auth.js middleware/auth.test.js
git commit -m "feat(materiales): middleware requireApiKey para llamadas maquina-a-maquina"
```

---

## Task 2: Consulta del catálogo al ERP

**Files:**
- Create: `C:\censos-web\models\materiales.js`

- [ ] **Step 1: Escribir el modelo**

Crea `C:\censos-web\models\materiales.js` con este contenido exacto:

```js
const { sql, getPool } = require('../config/database');
const { tablaBMS } = require('../config/sucursales');

/**
 * Busca materiales del catálogo del ERP con la existencia y el costo del
 * establecimiento pedido.
 *
 * Notas de diseño:
 *  - `tablaBMS` enruta por linked server cuando el estab es remoto (CSL Brisas,
 *    estab 8). Se usa para AMBAS tablas para que catálogo y existencia salgan
 *    del mismo servidor y no se mezclen dos verdades.
 *  - Solo se mira el estab pedido. Los almacenes auxiliares de Los Mochis
 *    (12 y 99) son para conteo de inventario, no para surtir material.
 *  - LEFT JOIN a prodestab: un producto del catálogo sin fila de existencia
 *    debe seguir apareciendo (existencia null = "no sé", distinto de 0).
 */
async function buscarMateriales({ q, codEstab, limite = 25 }) {
  const texto = String(q || '').trim();
  const estab = Number.parseInt(codEstab, 10);
  if (texto.length < 3) return [];
  if (!Number.isInteger(estab)) return [];

  const pool = await getPool();
  const tProd = tablaBMS('productos', [estab]);
  const tUni  = tablaBMS('unidades', [estab]);
  const tPe   = tablaBMS('prodestab', [estab]);

  const result = await pool.request()
    .input('q',     sql.VarChar(100), texto)
    .input('estab', sql.Int,          estab)
    .input('lim',   sql.Int,          Math.min(Number(limite) || 25, 50))
    .query(`
      SELECT TOP (@lim)
             RTRIM(p.cod_prod)    AS cod_prod,
             RTRIM(p.descripcion) AS descripcion,
             RTRIM(u.abreviatura) AS unidad,
             pe.exist_unidades    AS existencia,
             pe.costo_promedio    AS costo
        FROM ${tProd} p WITH (NOLOCK)
        LEFT JOIN ${tUni} u
               ON u.unidad = p.unidad_compra
        LEFT JOIN ${tPe} pe
               ON RTRIM(pe.cod_prod) = RTRIM(p.cod_prod)
              AND pe.cod_estab = @estab
       WHERE p.descripcion LIKE '%' + @q + '%'
          OR p.cod_prod    LIKE '%' + @q + '%'
       ORDER BY p.descripcion
    `);

  return result.recordset.map(r => ({
    cod_prod:    r.cod_prod,
    descripcion: r.descripcion,
    unidad:      r.unidad || null,
    existencia:  r.existencia === null || r.existencia === undefined ? null : Number(r.existencia),
    costo:       r.costo === null || r.costo === undefined ? null : Number(r.costo),
  }));
}

module.exports = { buscarMateriales };
```

- [ ] **Step 2: Probarlo contra el ERP real**

```bash
cd /c/censos-web && node -e "require('dotenv').config(); require('./models/materiales').buscarMateriales({q:'angulo', codEstab:1}).then(r=>{console.log(r.length, 'resultados'); console.log(r.slice(0,3));}).catch(e=>{console.error('ERROR', e.message); process.exit(1)})"
```

Esperado: varios resultados con `cod_prod`, `descripcion`, `unidad`, `existencia` y `costo`. Al menos uno con existencia numérica.

Si sale `ERROR` de conexión, SQL Server no está alcanzable desde esta máquina: es un problema de red o VPN, **no** del código. Repórtalo y detente.

- [ ] **Step 3: Probar el establecimiento remoto**

```bash
cd /c/censos-web && node -e "require('dotenv').config(); require('./models/materiales').buscarMateriales({q:'angulo', codEstab:8}).then(r=>console.log(r.length,'resultados CSL Brisas')).catch(e=>{console.error('ERROR', e.message); process.exit(1)})"
```

Esperado: resultados (pueden ser distintos a los de Mochis). Esto confirma que el linked server funciona; si falla solo aquí, repórtalo — CSL Brisas quedaría sin catálogo y hay que decidir qué hacer.

- [ ] **Step 4: Commit**

```bash
cd /c/censos-web && git add models/materiales.js
git commit -m "feat(materiales): consulta de catalogo con existencia y costo por establecimiento"
```

---

## Task 3: Endpoint HTTP en censos-web

**Files:**
- Create: `C:\censos-web\routes\materiales.js`
- Modify: `C:\censos-web\app.js`

- [ ] **Step 1: Escribir el router**

Crea `C:\censos-web\routes\materiales.js` con este contenido exacto:

```js
const express = require('express');
const router = express.Router();
const { requireApiKey } = require('../middleware/auth');
const { buscarMateriales } = require('../models/materiales');

// GET /api/materiales?q=texto&codEstab=1
// Catálogo del ERP para otras apps internas. Protegido por llave, sin sesión.
router.get('/', requireApiKey, async (req, res) => {
  try {
    const datos = await buscarMateriales({
      q: req.query.q,
      codEstab: req.query.codEstab,
    });
    res.json({ ok: true, materiales: datos });
  } catch (err) {
    console.error('[Materiales] Error consultando el ERP:', err.message);
    res.status(502).json({ ok: false, error: 'No se pudo consultar el catalogo' });
  }
});

module.exports = router;
```

**Desviación consciente del spec:** el spec (§3.5) también contemplaba `GET /api/materiales/:codProd` para revalidar un material al momento de enviar. **No se construye aquí**: ningún plan de esta tanda lo consumiría, y código que nadie llama es código que envejece sin que nadie note que se rompió. Cuando el costo congelado empiece a importar de verdad (por ejemplo si se usa para contabilidad), se agrega entonces, con quien lo use.

- [ ] **Step 2: Montarlo en la app**

En `C:\censos-web\app.js`, junto a los demás `app.use` de rutas (después de `app.use('/api', require('./routes/api'));`), agrega:

```js
app.use('/api/materiales', require('./routes/materiales'));
```

- [ ] **Step 3: Levantar censos-web y probar los tres casos**

```bash
cd /c/censos-web && npm run dev
```

En otra terminal (sustituye `<LLAVE>` por el valor de `MATERIALES_API_KEY`):

```bash
# 1) Sin llave -> 401
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3800/api/materiales?q=angulo&codEstab=1"

# 2) Con llave -> 200 y resultados
curl -s -H "x-api-key: <LLAVE>" "http://localhost:3800/api/materiales?q=angulo&codEstab=1" | head -c 600

# 3) Búsqueda muy corta -> 200 con lista vacía (no error)
curl -s -H "x-api-key: <LLAVE>" "http://localhost:3800/api/materiales?q=an&codEstab=1"
```

Esperado: `401`; luego un JSON `{"ok":true,"materiales":[...]}` con datos reales; luego `{"ok":true,"materiales":[]}`.

- [ ] **Step 4: Commit**

```bash
cd /c/censos-web && git add routes/materiales.js app.js
git commit -m "feat(materiales): endpoint GET /api/materiales protegido por llave"
```

---

## Task 4: Tipo y normalizador en Devoluciones

**Files:**
- Create: `src/lib/materiales/tipos.ts`
- Create: `src/lib/materiales/normalizar.ts`
- Test: `src/lib/materiales/normalizar.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/materiales/normalizar.test.ts` con este contenido exacto:

```ts
import { describe, it, expect } from "vitest";
import { normalizarMateriales } from "./normalizar";

describe("normalizarMateriales", () => {
  it("limpia espacios de código y descripción (el ERP usa CHAR con relleno)", () => {
    const r = normalizarMateriales([
      { cod_prod: "  ANG130  ", descripcion: " ANGULO 1/8 ", unidad: " PZ ", existencia: 40, costo: 180.5 },
    ]);
    expect(r).toEqual([
      { codProd: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", existencia: 40, costo: 180.5 },
    ]);
  });

  it("distingue existencia desconocida (null) de existencia cero", () => {
    const r = normalizarMateriales([
      { cod_prod: "A", descripcion: "sin fila en prodestab", unidad: null, existencia: null, costo: null },
      { cod_prod: "B", descripcion: "agotado de verdad", unidad: "PZ", existencia: 0, costo: 0 },
    ]);
    expect(r[0]!.existencia).toBeNull();
    expect(r[0]!.costo).toBeNull();
    expect(r[1]!.existencia).toBe(0);
    expect(r[1]!.costo).toBe(0);
  });

  it("acepta números que llegan como texto", () => {
    const r = normalizarMateriales([
      { cod_prod: "A", descripcion: "x", unidad: null, existencia: "12.5", costo: "3.25" },
    ]);
    expect(r[0]!.existencia).toBe(12.5);
    expect(r[0]!.costo).toBe(3.25);
  });

  it("descarta filas sin código o sin descripción, no las inventa", () => {
    const r = normalizarMateriales([
      { cod_prod: "", descripcion: "sin codigo" },
      { cod_prod: "A", descripcion: "   " },
      { cod_prod: "B", descripcion: "buena" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.codProd).toBe("B");
  });

  it("devuelve lista vacía ante basura, sin reventar", () => {
    expect(normalizarMateriales(null)).toEqual([]);
    expect(normalizarMateriales(undefined)).toEqual([]);
    expect(normalizarMateriales("no soy un arreglo")).toEqual([]);
    expect(normalizarMateriales([null, 3, "x"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

```bash
npx vitest run src/lib/materiales/normalizar.test.ts
```

Esperado: **FALLA** con `Failed to resolve import "./normalizar"`.

- [ ] **Step 3: Escribir el tipo**

Crea `src/lib/materiales/tipos.ts` con este contenido exacto:

```ts
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
}

/** Una línea de la solicitud, tal como la arma el empleado antes de enviarla. */
export interface LineaSolicitud {
  codProd: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costoUnitario: number | null;
  existenciaAlPedir: number | null;
}
```

- [ ] **Step 4: Escribir el normalizador**

Crea `src/lib/materiales/normalizar.ts` con este contenido exacto:

```ts
import type { Material } from "./tipos";

// Los campos numéricos del ERP pueden llegar como número, como texto (mssql
// serializa DECIMAL así a veces) o ausentes. `null` significa "no hay dato" y
// NO es lo mismo que 0: un producto sin fila en prodestab no está agotado,
// simplemente no sabemos cuánto hay.
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function aTexto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Convierte la respuesta cruda del ERP en materiales limpios. Nunca lanza. */
export function normalizarMateriales(crudo: unknown): Material[] {
  if (!Array.isArray(crudo)) return [];
  const out: Material[] = [];
  for (const fila of crudo) {
    if (typeof fila !== "object" || fila === null) continue;
    const f = fila as Record<string, unknown>;
    const codProd = aTexto(f.cod_prod);
    const descripcion = aTexto(f.descripcion);
    if (!codProd || !descripcion) continue;
    out.push({
      codProd,
      descripcion,
      unidad: aTexto(f.unidad) || null,
      existencia: aNumero(f.existencia),
      costo: aNumero(f.costo),
    });
  }
  return out;
}
```

- [ ] **Step 5: Correr el test para verlo pasar**

```bash
npx vitest run src/lib/materiales/normalizar.test.ts
```

Esperado: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/materiales/tipos.ts src/lib/materiales/normalizar.ts src/lib/materiales/normalizar.test.ts
git commit -m "feat(material): tipo Material y normalizador de la respuesta del ERP"
```

---

## Task 5: Resolver la sucursal del empleado

**Files:**
- Create: `src/lib/materiales/sucursal.ts`

- [ ] **Step 1: Escribir el módulo**

Crea `src/lib/materiales/sucursal.ts` con este contenido exacto:

```ts
import { supabase } from "@/lib/supabase/client";

export interface SucursalEmpleado {
  /** Abreviatura (LMM, FTE...), el vocabulario de rnd_usuarios.sucursal. */
  abrev: string;
  /** cod_estab del ERP (1, 3, 5...). Null si la sucursal no lo tiene mapeado. */
  codEstab: number | null;
}

/**
 * Traduce el empleado a su sucursal en los dos vocabularios que importan aquí.
 * `empleados.sucursal` guarda el nombre largo (EL FUERTE) y `sucursales_map`
 * es la fuente única de verdad para pasar a abreviatura y a cod_estab.
 * Devuelve null si el empleado no existe, no tiene sucursal, o su sucursal no
 * está en el mapa: en ninguno de esos casos se debe adivinar una por defecto.
 */
export async function sucursalDelEmpleado(empleadoId: number): Promise<SucursalEmpleado | null> {
  const { data: emp, error: e1 } = await supabase
    .from("empleados")
    .select("sucursal")
    .eq("id", empleadoId)
    .maybeSingle();
  if (e1) throw e1;
  const larga = (emp?.sucursal as string | null)?.trim();
  if (!larga) return null;

  const { data: mapa, error: e2 } = await supabase
    .from("sucursales_map")
    .select("abrev, cod_estab")
    .eq("nombre_largo", larga.toUpperCase())
    .maybeSingle();
  if (e2) throw e2;
  if (!mapa?.abrev) return null;

  return {
    abrev: mapa.abrev as string,
    codEstab: (mapa.cod_estab as number | null) ?? null,
  };
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

Si TypeScript se queja de que `cod_estab` no existe en el tipo de `sucursales_map`, es porque `src/types/db.ts` está desactualizado (se generó antes de la migración 0019). Regenéralo con la herramienta MCP `generate_typescript_types` y guarda el resultado en `src/types/db.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/materiales/sucursal.ts src/types/db.ts
git commit -m "feat(material): resolver sucursal y cod_estab del empleado"
```

---

## Task 6: Route handler que consume censos

**Files:**
- Create: `src/app/api/materiales/route.ts`
- Modify: `.env.local`

- [ ] **Step 1: Configurar el entorno**

Agrega al final de `.env.local` (usa **la misma llave** que pusiste en `C:\censos-web\.env`):

```
# Puente al catalogo del ERP via censos-web (solo red interna; en Netlify no aplica)
CENSOS_API_URL=http://localhost:3800
CENSOS_API_KEY=<la-misma-llave-de-censos-web>
```

`.env.local` está en `.gitignore`: no se commitea.

- [ ] **Step 2: Escribir el route handler**

Crea `src/app/api/materiales/route.ts` con este contenido exacto:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { sucursalDelEmpleado } from "@/lib/materiales/sucursal";
import { normalizarMateriales } from "@/lib/materiales/normalizar";

// Este handler es el ÚNICO que conoce la dirección interna de censos-web y su
// llave. Nunca se llama desde el navegador a censos directamente: eso filtraría
// la llave y chocaría con CORS.
//
// El cod_estab NO viene del cliente: sale de la sucursal del empleado
// autenticado, para que nadie consulte inventario de una sucursal ajena.

const TIMEOUT_MS = 5000;

export async function GET(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const base = process.env.CENSOS_API_URL;
  const llave = process.env.CENSOS_API_KEY;
  if (!base || !llave) {
    return NextResponse.json(
      { ok: false, error: "El catálogo no está configurado en este entorno" },
      { status: 503 },
    );
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ ok: true, materiales: [] });

  const suc = await sucursalDelEmpleado(sesion.empleadoId);
  if (!suc?.codEstab) {
    return NextResponse.json(
      { ok: false, error: "Tu sucursal no está configurada, avisa a sistemas" },
      { status: 409 },
    );
  }

  const url = `${base.replace(/\/$/, "")}/api/materiales?q=${encodeURIComponent(q)}&codEstab=${suc.codEstab}`;
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": llave },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "No se pudo consultar el catálogo, intenta de nuevo" },
        { status: 503 },
      );
    }
    const data = (await res.json()) as { materiales?: unknown };
    return NextResponse.json({ ok: true, materiales: normalizarMateriales(data.materiales) });
  } catch {
    // Timeout, DNS, servidor apagado: para el empleado es el mismo problema.
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar el catálogo, intenta de nuevo" },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 3: Probar sin sesión**

Con censos-web corriendo, levanta Devoluciones:

```bash
npm run dev
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/materiales?q=angulo"
```

Esperado: `401`. Sin cookie de empleado no se contesta nada.

- [ ] **Step 4: Probar con sesión real**

Abre `http://localhost:3000/empleado` en el navegador, entra con un empleado registrado (o regístrate con un teléfono real de `empleados`), y en la consola del navegador (DevTools) ejecuta:

```js
await (await fetch('/api/materiales?q=angulo')).json()
```

Esperado: `{ ok: true, materiales: [ { codProd: "...", descripcion: "...", unidad: "...", existencia: n, costo: n }, ... ] }`, con la existencia **de la sucursal de ese empleado**.

Verifica también la búsqueda corta:

```js
await (await fetch('/api/materiales?q=an')).json()
```

Esperado: `{ ok: true, materiales: [] }`.

- [ ] **Step 5: Probar el ERP caído**

Detén censos-web (Ctrl+C en su terminal) y repite en la consola del navegador:

```js
await (await fetch('/api/materiales?q=angulo')).json()
```

Esperado: `{ ok: false, error: "No se pudo consultar el catálogo, intenta de nuevo" }` con status 503, **en menos de 6 segundos**. Si se queda colgado, el `AbortSignal.timeout` no está funcionando: arréglalo antes de seguir.

Vuelve a levantar censos-web.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/materiales/route.ts
git commit -m "feat(material): route handler que consulta el catalogo del ERP via censos"
```

---

## Verificación final del plan

- [ ] `cd /c/censos-web && node middleware/auth.test.js` → `OK auth.test.js`.
- [ ] `npx vitest run` (raíz) → verde, incluidos los 5 tests del normalizador.
- [ ] `npx tsc --noEmit -p tsconfig.json` → sin errores.
- [ ] El endpoint responde con datos reales para **al menos dos sucursales**, una de ellas CSL (estab 8, la del linked server).
- [ ] Con censos-web apagado, la app responde 503 con mensaje legible en menos de 6 segundos.
- [ ] **Nada pusheado**, ni en Devoluciones ni en censos-web.

**Siguiente plan:** `2026-07-21-material-pwa-empleado.md` — la pantalla del empleado y sus route handlers de escritura.
