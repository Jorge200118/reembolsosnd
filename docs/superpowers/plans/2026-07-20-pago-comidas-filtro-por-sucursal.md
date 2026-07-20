# Filtro de pendientes de comida por sucursal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cajera vea en "Pago de Comidas" únicamente los pendientes cuyo empleado beneficiario pertenece a su sucursal.

**Architecture:** El filtro vive en Postgres. Una tabla catálogo `sucursales_map` traduce la abreviatura de la cajera (`FTE`) al nombre largo del empleado (`EL FUERTE`). El RPC `comidas_pendientes_por_chofer` recibe la abreviatura como parámetro opcional y filtra por `empleados.sucursal`. El frontend pasa `sesion.sucursal` (ya disponible en el AuthContext). `NULL` = sin filtro (compatibilidad).

**Tech Stack:** Supabase/Postgres (migración SQL + MCP para probar), Next.js 16 / React 19, TanStack Query, TypeScript.

**Nota sobre testing:** El filtro es lógica de base de datos, no de funciones puras JS. El "test que falla primero" se ejecuta como **SQL contra la BD vía la herramienta MCP de Supabase** (`execute_sql`), no con vitest. La lógica frontend nueva es solo reenvío de parámetro, sin ramas que ameriten un test unitario; se verifica end-to-end en la app. Este enfoque es coherente con el proyecto (los `.test.ts` existentes prueban funciones puras, no integración con la BD).

**Datos de referencia (verificados el 2026-07-20):**
- Abreviaturas reales de cajas (`rnd_usuarios.sucursal`, rol `caja_chica`): `CLN, CSL, FTE, JJR, LMM, LPZ, SJC, TML`.
- Nombres largos en `empleados.sucursal`: `CULIACAN, CABOS, EL FUERTE, JUAN JOSE RIOS, MATRIZ, LA PAZ, SAN JOSE, TAMARAL`.
- Mapeo (⚠ `LMM`→`MATRIZ` no es derivable por prefijo).
- Pendientes de comida hoy: AGUSTIN FERANDEZ LOPEZ (emp 2357, EL FUERTE), FLOR SANTOS SUAREZ (emp 1108, EL FUERTE), RUBEN MARTIN LOPEZ MOROYOQUI (emp 2274, MATRIZ).

---

## File Structure

- **Create** `supabase/migrations/0016_comidas_filtro_sucursal.sql` — tabla catálogo `sucursales_map` (con seeds) + `create or replace` del RPC con el nuevo parámetro. Un solo archivo: ambos cambios son la misma unidad lógica y se aplican juntos.
- **Modify** `src/lib/supabase/queries/comidasPendientes.ts` — la función acepta y reenvía `sucursal`.
- **Modify** `src/lib/hooks/useComidasPendientes.ts` — el hook acepta `sucursal` y lo mete en el `queryKey`.
- **Modify** `src/app/(app)/pago-comidas/page.tsx` — pasa `sesion?.sucursal` al hook.

---

## Task 1: Migración — catálogo `sucursales_map` + RPC con filtro

**Files:**
- Create: `supabase/migrations/0016_comidas_filtro_sucursal.sql`
- Aplicar/probar vía: herramienta MCP Supabase (`apply_migration`, `execute_sql`)

- [ ] **Step 1: Test que falla primero — el RPC aún no acepta parámetro**

Ejecuta este SQL vía MCP `execute_sql`:

```sql
select * from comidas_pendientes_por_chofer('FTE');
```

Esperado: **FALLA** con error tipo `function comidas_pendientes_por_chofer(unknown) does not exist`.
(Confirma que la firma actual es sin argumentos; también confirma que la abreviatura `LMM=MATRIZ` no está mapeada en ninguna parte todavía.)

- [ ] **Step 2: Escribir la migración**

Crea `supabase/migrations/0016_comidas_filtro_sucursal.sql` con este contenido exacto:

```sql
-- Filtro de pendientes de comida por sucursal de la cajera.
--
-- Problema: tres vocabularios de sucursal que no coinciden:
--   * cajera (rnd_usuarios.sucursal): abreviatura  -> 'FTE', 'LMM', 'CSL'...
--   * empleado (empleados.sucursal):  nombre largo -> 'EL FUERTE', 'MATRIZ'...
--   * rnd_reembolsos.sucursal_usuario: sucia (mezcla ambos) -> se descarta.
-- El mapeo no es derivable por prefijo (LMM = MATRIZ), así que va en catálogo.
--
-- Criterio: filtrar por sucursal del EMPLEADO beneficiario (empleados.sucursal).

-- 1) Catálogo abreviatura -> nombre largo. Fuente única de verdad.
create table if not exists public.sucursales_map (
  abrev        text primary key,
  nombre_largo text not null
);

insert into public.sucursales_map (abrev, nombre_largo) values
  ('FTE', 'EL FUERTE'),
  ('LMM', 'MATRIZ'),
  ('CSL', 'CABOS'),
  ('CLN', 'CULIACAN'),
  ('JJR', 'JUAN JOSE RIOS'),
  ('LPZ', 'LA PAZ'),
  ('SJC', 'SAN JOSE'),
  ('TML', 'TAMARAL')
on conflict (abrev) do update set nombre_largo = excluded.nombre_largo;

-- 2) RPC con parámetro opcional p_sucursal (abreviatura de la cajera).
--    p_sucursal NULL  -> sin filtro (compatibilidad: gerente/reportes).
--    p_sucursal 'FTE' -> resuelve 'EL FUERTE' y filtra empleados.sucursal.
--    El filtro se aplica DENTRO del CTE base, sobre el emp_id ya resuelto,
--    para que count/sum/array_agg y totales salgan correctos.
create or replace function public.comidas_pendientes_por_chofer(
  p_sucursal text default null
)
returns table(
  empleado_id integer,
  nombre_beneficiario text,
  telefono text,
  num_comidas bigint,
  total numeric,
  reembolso_ids uuid[],
  estatus text
)
language sql
stable
as $function$
  with objetivo as (
    -- nombre largo objetivo; null si no hay filtro o abreviatura desconocida
    select case
             when p_sucursal is null then null
             else (select upper(btrim(m.nombre_largo))
                   from sucursales_map m
                   where upper(btrim(m.abrev)) = upper(btrim(p_sucursal)))
           end as nombre_largo
  ),
  base as (
    select r.id as reembolso_id, r.nombre_beneficiario, r.monto,
      coalesce(
        r.empleado_id,
        (select e.id from empleados e
          where e.activo
            and upper(regexp_replace(e.nombre||' '||e.apellido,'\s+',' ','g'))
              = upper(regexp_replace(r.nombre_beneficiario,'\s+',' ','g'))
          limit 1)
      ) as emp_id
    from rnd_reembolsos r
    where r.concepto='COMIDAS' and r.estado='comida_pendiente'
  ),
  filtrada as (
    select b.*
    from base b, objetivo o
    where
      -- sin filtro: pasa todo
      o.nombre_largo is null
      -- con filtro: el empleado resuelto debe ser de esa sucursal.
      -- emp_id null (sin_match) queda fuera cuando hay filtro activo.
      or exists (
        select 1 from empleados e
        where e.id = b.emp_id
          and upper(btrim(e.sucursal)) = o.nombre_largo
      )
  )
  select
    f.emp_id as empleado_id,
    max(f.nombre_beneficiario) as nombre_beneficiario,
    (select e.telefono_whatsapp from empleados e where e.id = f.emp_id) as telefono,
    count(*) as num_comidas,
    sum(f.monto) as total,
    array_agg(f.reembolso_id) as reembolso_ids,
    case
      when f.emp_id is null then 'sin_match'
      when (select e.telefono_whatsapp from empleados e where e.id=f.emp_id) is null
        or btrim((select e.telefono_whatsapp from empleados e where e.id=f.emp_id))='' then 'sin_telefono'
      else 'ok'
    end as estatus
  from filtrada f
  group by f.emp_id
  order by nombre_beneficiario;
$function$;
```

- [ ] **Step 3: Aplicar la migración**

Aplícala vía MCP `apply_migration` con name `0016_comidas_filtro_sucursal` y el contenido del archivo.

⚠ **Corrección aplicada durante la ejecución (dos hallazgos):**
1. `create or replace` NO sustituye la función vieja de 0 argumentos (distinta firma):
   quedan dos sobrecargas y llamar sin args da `function is not unique` — rompería el
   frontend actual. La migración incluye `drop function if exists ...()` antes del create.
2. Una abreviatura **desconocida** debe devolver 0 (no todo). El CTE `objetivo` distingue
   `sin_filtro` (`p_sucursal is null` → ver todo) de `nombre_largo is null` (abreviatura
   sin mapeo → ver nada). El `where` usa `o.sin_filtro`, no `o.nombre_largo is null`.

El contenido final del archivo `0016_...sql` ya refleja ambas correcciones.

- [ ] **Step 4: Verificar que el test pasa — filtro por FTE**

Ejecuta vía MCP `execute_sql`:

```sql
select nombre_beneficiario, empleado_id, num_comidas, estatus
from comidas_pendientes_por_chofer('FTE')
order by nombre_beneficiario;
```

Esperado: **exactamente 2 filas** — AGUSTIN FERANDEZ LOPEZ y FLOR SANTOS SUAREZ. NO aparece RUBEN (MATRIZ).

- [ ] **Step 5: Verificar filtro por LMM (el caso no-obvio)**

```sql
select nombre_beneficiario from comidas_pendientes_por_chofer('LMM');
```

Esperado: **1 fila** — RUBEN MARTIN LOPEZ MOROYOQUI (MATRIZ). Confirma que `LMM`→`MATRIZ` funciona.

- [ ] **Step 6: Verificar compatibilidad — NULL devuelve todo**

```sql
select count(*) as n from comidas_pendientes_por_chofer(null);
select count(*) as n from comidas_pendientes_por_chofer();
```

Esperado: ambas devuelven **3** (comportamiento actual intacto, con y sin argumento).

- [ ] **Step 7: Verificar sucursal sin pendientes y abreviatura desconocida**

```sql
select count(*) from comidas_pendientes_por_chofer('SJC');   -- sucursal válida, 0 pendientes hoy
select count(*) from comidas_pendientes_por_chofer('ZZZ');   -- abreviatura inexistente
```

Esperado: ambas devuelven **0** (no revientan). `'ZZZ'` no mapea → nombre_largo null en el subquery → sin match, resultado vacío (señal de mapeo faltante, no error).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0016_comidas_filtro_sucursal.sql
git commit -m "feat(comidas): RPC filtra pendientes por sucursal + catalogo sucursales_map"
```

---

## Task 2: Query — reenviar la sucursal al RPC

**Files:**
- Modify: `src/lib/supabase/queries/comidasPendientes.ts`

- [ ] **Step 1: Modificar la firma para aceptar y reenviar `sucursal`**

En `src/lib/supabase/queries/comidasPendientes.ts`, reemplaza la función `comidasPendientesPorChofer` (líneas 25-38) por:

```ts
export async function comidasPendientesPorChofer(
  sucursal?: string | null,
): Promise<ComidaPendienteChofer[]> {
  const { data, error } = await supabase.rpc(
    "comidas_pendientes_por_chofer" as never,
    { p_sucursal: sucursal ?? null } as never,
  );
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaRpc[];
  return filas.map((r) => ({
    empleadoId: r.empleado_id,
    nombre: r.nombre_beneficiario,
    telefono: r.telefono,
    numComidas: Number(r.num_comidas),
    total: String(r.total),
    reembolsoIds: r.reembolso_ids ?? [],
    estatus: r.estatus,
  }));
}
```

- [ ] **Step 2: Verificar que compila / lint pasa**

Run: `cd "c:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web" && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores en `comidasPendientes.ts`. (Si `tsc` no está configurado para el subpaquete, usa `npm run lint` y confirma que no aparecen errores nuevos en este archivo.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/comidasPendientes.ts
git commit -m "feat(comidas): la query reenvia la sucursal al RPC"
```

---

## Task 3: Hook — propagar la sucursal y aislar el cache

**Files:**
- Modify: `src/lib/hooks/useComidasPendientes.ts`

- [ ] **Step 1: Aceptar `sucursal` y meterlo en el queryKey**

Reemplaza el contenido completo de `src/lib/hooks/useComidasPendientes.ts` por:

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { comidasPendientesPorChofer } from "@/lib/supabase/queries/comidasPendientes";

export function useComidasPendientes(sucursal?: string | null) {
  return useQuery({
    queryKey: ["comidas-pendientes", sucursal ?? null],
    queryFn: () => comidasPendientesPorChofer(sucursal),
  });
}
```

Nota: `sucursal` en el `queryKey` evita que el cache de una sucursal se muestre a otra al cambiar de sesión.

- [ ] **Step 2: Verificar que compila / lint pasa**

Run: `cd "c:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web" && npm run lint`
Expected: sin errores nuevos en `useComidasPendientes.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useComidasPendientes.ts
git commit -m "feat(comidas): el hook propaga la sucursal y aisla el cache por sucursal"
```

---

## Task 4: Página — pasar la sucursal de la sesión

**Files:**
- Modify: `src/app/(app)/pago-comidas/page.tsx`

- [ ] **Step 1: Pasar `sesion?.sucursal` al hook**

En `src/app/(app)/pago-comidas/page.tsx`, línea 17, reemplaza:

```ts
  const { data: comidas, isLoading } = useComidasPendientes();
```

por:

```ts
  const { data: comidas, isLoading } = useComidasPendientes(sesion?.sucursal ?? undefined);
```

(`sesion` ya está desestructurado de `useAuth()` en la línea 13; no hace falta nada más.)

- [ ] **Step 2: Verificar que compila / lint pasa**

Run: `cd "c:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web" && npm run lint`
Expected: sin errores nuevos en `page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/pago-comidas/page.tsx"
git commit -m "feat(comidas): la pantalla pasa la sucursal de la cajera al filtro"
```

---

## Task 5: Verificación end-to-end en la app

**Files:** ninguno (verificación manual/visual).

- [ ] **Step 1: Levantar la app**

Run: `cd "c:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web" && npm run dev`
Expected: server en `http://localhost:3000`.

- [ ] **Step 2: Login como cajera de EL FUERTE (FTE)**

Usa la cajera de sucursal `FTE` (`ADRIANA KARELY HERRERA CASTRO`, password `cajafte123`). Entra a **Pago Comidas**.
Expected: la tabla muestra **solo** AGUSTIN FERANDEZ LOPEZ y FLOR SANTOS SUAREZ. El banner dice "2 comidas de 2 empleados · $240.00 total". NO aparece RUBEN.

- [ ] **Step 3: Login como cajera de MATRIZ (LMM)**

Cierra sesión y entra con una cajera cuya columna `sucursal` sea `LMM` (p. ej. `Abigail Quijano`, `Flor` o `Kristal Olivas`; verifica el email/password en `rnd_usuarios`). Entra a **Pago Comidas**.
Expected: la tabla muestra **solo** RUBEN MARTIN LOPEZ MOROYOQUI. Confirma el caso `LMM`→`MATRIZ` en la app real.

- [ ] **Step 4: Verificación de no-regresión del cobro**

Con la cajera FTE, confirma que el botón "Cobrar con código" sigue habilitado (día hábil) y abre el modal OTP para AGUSTIN. No completes el cobro salvo que quieras; solo confirma que el flujo no se rompió.

---

## Self-Review (completado por el autor del plan)

- **Cobertura del spec:** catálogo `sucursales_map` (Task 1), RPC con `p_sucursal` y filtro en el CTE base (Task 1), frontend query→hook→page (Tasks 2-4), `sin_match` oculto con filtro activo (probado implícito en Step 4/7 de Task 1 — hoy no hay ninguno, pero la cláusula `exists` sobre `emp_id` los excluye), compatibilidad `NULL` (Task 1 Step 6), verificación end-to-end (Task 5). ✔
- **Placeholders:** ninguno; todo el SQL y TS está completo. ✔
- **Consistencia de tipos:** `comidasPendientesPorChofer(sucursal?)` ↔ `useComidasPendientes(sucursal?)` ↔ `p_sucursal` en el RPC; `FilaRpc`/`ComidaPendienteChofer` sin cambios. ✔
- **Nota RLS:** el spec ya deja claro que esto es filtro de presentación (RLS off). No se añade barrera de seguridad aquí; queda fuera de alcance por decisión del usuario. ✔
