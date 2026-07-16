# App de Empleados — Plan A: Cimientos de datos y cifrado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el pago de comidas se ligue al empleado por `empleado_id` (confiable) en vez de por nombre, se rellenen los pendientes, el cron del repo refleje producción, y el código OTP quede cifrado en la base para poder mostrarse después en la app.

**Architecture:** Cambios en Postgres (migraciones + RPCs con pgcrypto/Vault) y en la edge function `generar-otp-comidas` (Deno). El código de 6 dígitos se persiste vía una RPC que guarda el `otp_hash` (como hoy, para validar) y además `otp_cifrado` con `pgp_sym_encrypt` usando una llave del Vault; solo una RPC `SECURITY DEFINER` puede descifrarlo. Se extrae `normalizarNombre` a un módulo compartido de Deno y se prueba con vitest.

**Tech Stack:** Supabase Postgres (pgcrypto, Vault, pg_cron), Deno edge functions, TypeScript, vitest.

**Contexto previo (spec):** [docs/superpowers/specs/2026-07-16-app-empleados-vales-comida-design.md](../specs/2026-07-16-app-empleados-vales-comida-design.md), secciones 4 y 6.

**Precondiciones / notas de entorno:**
- Aplicar migraciones: usar el MCP de Supabase (`apply_migration`) o `supabase db push`. Verificar con SQL vía el MCP (`execute_sql`) o `psql`.
- `crear-comida` (edge, ya en curso) YA persiste `empleado_id` — este plan NO lo toca; solo lo asume.
- Los tests SQL de comportamiento usan el patrón de "bloque `do $$ ... raise exception` que hace rollback" para no dejar basura (ver Task 2/5).
- Existe el secreto `service_role_key` en Vault. Se agrega uno nuevo `otp_cripto_key` para el cifrado.

---

## Estructura de archivos

- Crear: `supabase/functions/_shared/nombres.ts` — `normalizarNombre` compartido (Deno, TS puro, sin APIs de Deno).
- Crear: `supabase/functions/_shared/nombres.test.ts` — pruebas vitest del helper.
- Modificar: `vitest.config.ts` — incluir tests bajo `supabase/functions/**`.
- Modificar: `supabase/functions/generar-otp-comidas/index.ts` — preferir `empleado_id`, exponer identidades sin match, persistir vía RPC.
- Crear: `supabase/migrations/0007_backfill_empleado_id_pendientes.sql` — rellenar `empleado_id` en comidas pendientes.
- Crear: `supabase/migrations/0008_fix_cron_otp_diario.sql` — corregir el cron para que el repo == producción.
- Crear: `supabase/migrations/0009_otp_cifrado.sql` — columna `otp_cifrado`, secreto Vault, RPC `registrar_otp_comida`, RPC `revelar_codigo_comida`.

> Nota de numeración: la última migración del repo es `0006_autorizacion_columnas.sql`. Si al implementar existe una `0007+` nueva, correr los números hacia arriba manteniendo el orden.

---

## Task 1: Extraer `normalizarNombre` a módulo compartido de Deno

**Files:**
- Create: `supabase/functions/_shared/nombres.ts`
- Test: `supabase/functions/_shared/nombres.test.ts`
- Modify: `vitest.config.ts` (include)

- [ ] **Step 1: Ampliar el include de vitest para cubrir edge helpers**

En `vitest.config.ts`, cambiar la línea `include`:

```ts
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.ts"],
```

- [ ] **Step 2: Escribir el test que falla**

Crear `supabase/functions/_shared/nombres.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizarNombre } from "./nombres";

describe("normalizarNombre", () => {
  it("mayúsculas y espacios colapsados", () => {
    expect(normalizarNombre("  Jorge Arturo   Felix Armenta  ")).toBe("JORGE ARTURO FELIX ARMENTA");
  });
  it("quita acentos y trata ñ como está (comparación consistente)", () => {
    expect(normalizarNombre("Jorge Arturo Félix Armenta")).toBe("JORGE ARTURO FELIX ARMENTA");
    expect(normalizarNombre("JORGE ENRIQUE GARCIA NUÑEZ")).toBe("JORGE ENRIQUE GARCIA NUNEZ");
  });
  it("dos escrituras equivalentes normalizan igual", () => {
    expect(normalizarNombre("josé lópez")).toBe(normalizarNombre("JOSE   LOPEZ"));
  });
});
```

- [ ] **Step 3: Correr el test para verlo fallar**

Run: `npx vitest run supabase/functions/_shared/nombres.test.ts`
Expected: FAIL — "Failed to resolve import './nombres'".

- [ ] **Step 4: Implementar el helper**

Crear `supabase/functions/_shared/nombres.ts` (TS puro, idéntico en semántica al que hoy vive duplicado en las edge functions, pero con la clase Unicode explícita para no depender de la codificación del archivo):

```ts
// Normaliza un nombre para comparar de forma estable: MAYÚSCULAS, un solo espacio
// entre palabras, sin acentos combinables (rango U+0300–U+036F).
export function normalizarNombre(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
```

- [ ] **Step 5: Correr el test para verlo pasar**

Run: `npx vitest run supabase/functions/_shared/nombres.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts supabase/functions/_shared/nombres.ts supabase/functions/_shared/nombres.test.ts
git commit -m "refactor(edge): normalizarNombre compartido + test"
```

---

## Task 2: Generador prefiere `empleado_id` y expone identidades sin match

**Files:**
- Modify: `supabase/functions/generar-otp-comidas/index.ts`

Hoy el generador ([generar-otp-comidas/index.ts:49-80](../../supabase/functions/generar-otp-comidas/index.ts#L49-L80)) trae comidas por `nombre_beneficiario` y las cruza contra `empleados` por nombre normalizado, contando `sin_match`/`sin_telefono` sin decir quiénes. Debe: (a) traer también `empleado_id`; (b) agrupar directo por `empleado_id` cuando existe; (c) caer al match por nombre solo para filas con `empleado_id` nulo (legado); (d) devolver los nombres/ids que quedaron sin match o sin teléfono.

- [ ] **Step 1: Escribir el test de comportamiento (SQL, con rollback)**

Este test valida la REGLA de agrupación que implementará la función: comidas con `empleado_id` se agrupan por ese id aunque el nombre no coincida con `empleados`. Correr vía el MCP de Supabase (`execute_sql`) o `psql`. Debe FALLAR hoy si se corriera contra la lógica vieja (no hay lógica SQL aún; este bloque solo comprueba que los datos de prueba se agrupan por id — sirve de contrato para la implementación en Deno):

```sql
do $$
declare
  v_emp integer := 999990;
  id1 uuid; id2 uuid; n integer;
begin
  -- Dos comidas del MISMO empleado_id pero con nombre_beneficiario escrito distinto
  insert into rnd_reembolsos (nombre_beneficiario, empleado_id, fecha, monto, concepto, estado)
    values ('NOMBRE MAL ESCRITO', v_emp, current_date, 100, 'COMIDAS', 'comida_pendiente') returning id into id1;
  insert into rnd_reembolsos (nombre_beneficiario, empleado_id, fecha, monto, concepto, estado)
    values ('otra variante del nombre', v_emp, current_date, 150, 'COMIDAS', 'comida_pendiente') returning id into id2;

  select count(distinct empleado_id) into n
    from rnd_reembolsos where id in (id1,id2);
  -- Contrato: agrupar por empleado_id da UN grupo aunque los nombres difieran.
  raise exception 'CONTRATO_AGRUPACION grupos=% (esperado 1)', n;
end $$;
```

Expected: el mensaje muestra `grupos=1`. (Confirma que `empleado_id` agrupa donde el nombre fallaría.)

- [ ] **Step 2: Reescribir el bloque de recolección/agrupación en la edge function**

En `supabase/functions/generar-otp-comidas/index.ts`:

1. Importar el helper compartido y borrar la copia local de `normalizarNombre`:

```ts
import { normalizarNombre } from "../_shared/nombres.ts";
```

2. Traer `empleado_id` en el select de comidas:

```ts
    const { data: comidas, error: errC } = await supabase
      .from("rnd_reembolsos")
      .select("id, nombre_beneficiario, monto, empleado_id")
      .eq("concepto", "COMIDAS")
      .eq("estado", "comida_pendiente");
```

3. Reemplazar el armado de `porEmpleado` (líneas ~65-80) por esta versión que prefiere `empleado_id`:

```ts
    // Índice por nombre normalizado SOLO para filas legadas sin empleado_id.
    const porNombre = new Map<string, { id: number; telefono: string | null }>();
    for (const e of empleados ?? []) {
      const full = normalizarNombre(`${e.nombre} ${e.apellido}`);
      porNombre.set(full, { id: e.id as number, telefono: e.telefono_whatsapp as string | null });
    }
    // Índice de empleados por id (para teléfono cuando la comida ya trae empleado_id).
    const empById = new Map<number, { telefono: string | null }>();
    for (const e of empleados ?? []) {
      empById.set(e.id as number, { telefono: e.telefono_whatsapp as string | null });
    }

    const porEmpleado = new Map<number, { telefono: string | null; reembolsoIds: string[]; monto: number }>();
    const sinMatch: string[] = []; // nombres de comidas legadas que no cruzan
    for (const c of comidas) {
      let empId: number | null = (c.empleado_id as number | null) ?? null;
      let telefono: string | null = null;
      if (empId !== null) {
        telefono = empById.get(empId)?.telefono ?? null;
      } else {
        const emp = porNombre.get(normalizarNombre(String(c.nombre_beneficiario)));
        if (!emp) { sinMatch.push(String(c.nombre_beneficiario)); continue; }
        empId = emp.id;
        telefono = emp.telefono;
      }
      const entry = porEmpleado.get(empId) ?? { telefono, reembolsoIds: [], monto: 0 };
      entry.reembolsoIds.push(String(c.id));
      entry.monto += Number(c.monto);
      porEmpleado.set(empId, entry);
    }
```

4. Cambiar la acumulación de sin-teléfono para guardar ids y devolver identidades en la respuesta final:

```ts
    const sinTelefono: number[] = [];
    // ... dentro del for de porEmpleado, donde hoy hace push del id, dejarlo igual ...

    return new Response(JSON.stringify({
      ok: true, semana, generados,
      sin_telefono: sinTelefono,           // ahora es lista de empleado_id
      sin_match: sinMatch,                 // ahora es lista de nombres
    }), { headers: CORS_HEADERS });
```

- [ ] **Step 3: Desplegar la función y verificar que no rompe el flujo actual**

Desplegar `generar-otp-comidas` (MCP `deploy_edge_function` o `supabase functions deploy generar-otp-comidas`). Luego dispararla como el cron y confirmar `ok:true`:

```sql
select net.http_post(
  url := 'https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/generar-otp-comidas',
  headers := jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
  body := '{}'::jsonb
) as request_id;
```

Esperar unos segundos y revisar la respuesta:

```sql
select status_code, content from net._http_response order by id desc limit 1;
```

Expected: `status_code = 200` y `content` con `"sin_match"` y `"sin_telefono"` como **listas** (no números).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generar-otp-comidas/index.ts
git commit -m "feat(otp): generador prefiere empleado_id y reporta identidades sin match"
```

---

## Task 3: Rellenar `empleado_id` en comidas pendientes

**Files:**
- Create: `supabase/migrations/0007_backfill_empleado_id_pendientes.sql`

Objetivo: poblar `empleado_id` SOLO en filas `comida_pendiente` que lo tengan nulo, cruzando por nombre normalizado. No toca el histórico ya cobrado.

- [ ] **Step 1: Ver cuántas filas se van a afectar (diagnóstico previo)**

```sql
select count(*) as pendientes_sin_empleado
from rnd_reembolsos
where concepto='COMIDAS' and estado='comida_pendiente' and empleado_id is null;
```

Anotar el número (es la cota superior de lo que el backfill puede rellenar).

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/0007_backfill_empleado_id_pendientes.sql`:

```sql
-- Rellena empleado_id en comidas PENDIENTES sin liga, cruzando por nombre
-- normalizado (MAYÚSCULAS, sin acentos, espacios colapsados). Idempotente:
-- solo toca filas con empleado_id nulo. No modifica histórico cobrado.
-- unaccent está en el esquema extensions.
create extension if not exists unaccent with schema extensions;

with match as (
  select r.id as reembolso_id, e.id as emp_id
  from rnd_reembolsos r
  join empleados e
    on upper(regexp_replace(extensions.unaccent(trim(e.nombre) || ' ' || trim(e.apellido)), '\s+', ' ', 'g'))
     = upper(regexp_replace(extensions.unaccent(trim(r.nombre_beneficiario)), '\s+', ' ', 'g'))
  where r.concepto = 'COMIDAS'
    and r.estado = 'comida_pendiente'
    and r.empleado_id is null
    and e.activo = true
)
update rnd_reembolsos r
set empleado_id = m.emp_id
from match m
where r.id = m.reembolso_id;
```

- [ ] **Step 3: Aplicar la migración**

Aplicar vía MCP `apply_migration` (name: `0007_backfill_empleado_id_pendientes`) o `supabase db push`.

- [ ] **Step 4: Verificar el resultado**

```sql
select
  count(*) filter (where empleado_id is not null) as ligadas,
  count(*) filter (where empleado_id is null) as sin_ligar
from rnd_reembolsos
where concepto='COMIDAS' and estado='comida_pendiente';
```

Expected: `sin_ligar` bajó respecto al diagnóstico del Step 1. Las que queden sin ligar son nombres que no cruzan (revisar manualmente esos `nombre_beneficiario`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_backfill_empleado_id_pendientes.sql
git commit -m "chore(db): backfill empleado_id en comidas pendientes"
```

---

## Task 4: Corregir la migración del cron (repo == producción)

**Files:**
- Create: `supabase/migrations/0008_fix_cron_otp_diario.sql`

Producción corre `30 16 * * 1-5` (L–V 9:30 Mazatlán) con el job `generar-otp-comidas-viernes`, pero [0005_pgcron_otp_viernes.sql](../../supabase/migrations/0005_pgcron_otp_viernes.sql) dice `0 15 * * 5` (viernes). Una migración correctiva idempotente deja el repo alineado sin duplicar el job.

- [ ] **Step 1: Confirmar el estado real del cron**

```sql
select jobid, jobname, schedule, active from cron.job order by jobid;
```

Anotar el `jobname` y `schedule` actuales.

- [ ] **Step 2: Escribir la migración correctiva**

Crear `supabase/migrations/0008_fix_cron_otp_diario.sql`:

```sql
-- Alinea el cron con producción: L–V 9:30 Mazatlán (UTC-7) = 16:30 UTC.
-- Idempotente: desprograma cualquier job previo con nombre viejo o nuevo y
-- reprograma uno solo con el nombre canónico 'generar-otp-comidas-diario'.
do $$
begin
  perform cron.unschedule('generar-otp-comidas-viernes');
exception when others then null;  -- no existía; ok
end $$;

do $$
begin
  perform cron.unschedule('generar-otp-comidas-diario');
exception when others then null;
end $$;

select cron.schedule(
  'generar-otp-comidas-diario',
  '30 16 * * 1-5',
  $$
  select net.http_post(
    url := 'https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/generar-otp-comidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 3: Aplicar y verificar**

Aplicar (MCP `apply_migration` name `0008_fix_cron_otp_diario`). Verificar:

```sql
select jobname, schedule, active from cron.job where jobname like 'generar-otp-comidas%';
```

Expected: UNA sola fila, `jobname = generar-otp-comidas-diario`, `schedule = 30 16 * * 1-5`, `active = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_fix_cron_otp_diario.sql
git commit -m "fix(db): cron de OTP L-V 9:30 (repo alineado con producción)"
```

---

## Task 5: `otp_cifrado` + RPCs de cifrado/descifrado con Vault

**Files:**
- Create: `supabase/migrations/0009_otp_cifrado.sql`
- Modify: `supabase/functions/generar-otp-comidas/index.ts` (persistir vía RPC)

El código de 6 dígitos debe quedar cifrado en `rnd_comida_otp.otp_cifrado` con una llave del Vault, para que la app pueda mostrarlo (Plan C) sin exponerlo en claro. El `otp_hash` sigue igual para la validación de la cajera.

- [ ] **Step 1: Crear el secreto de cifrado en el Vault**

```sql
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'otp_cripto_key');
```

Verificar que existe (sin revelar el valor en logs de más):

```sql
select name from vault.secrets where name = 'otp_cripto_key';
```

Expected: una fila `otp_cripto_key`.

- [ ] **Step 2: Escribir la migración (columna + RPCs)**

Crear `supabase/migrations/0009_otp_cifrado.sql`:

```sql
create extension if not exists pgcrypto with schema extensions;

alter table public.rnd_comida_otp
  add column if not exists otp_cifrado text;  -- pgp_sym_encrypt(codigo, key) en base64/armor

-- Registra/actualiza el OTP de un empleado para una semana, guardando el hash
-- (para validar) y el código CIFRADO (para mostrar). El código en claro nunca
-- se persiste. SECURITY DEFINER: la llave del Vault no se expone al llamador.
create or replace function public.registrar_otp_comida(
  p_empleado_id integer,
  p_semana date,
  p_codigo text,
  p_otp_hash text,
  p_otp_salt text,
  p_expira_en timestamptz,
  p_reembolso_ids uuid[],
  p_telefono text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  insert into public.rnd_comida_otp
    (empleado_id, semana, otp_hash, otp_salt, otp_cifrado, estado, intentos, expira_en, reembolso_ids, telefono)
  values
    (p_empleado_id, p_semana, p_otp_hash, p_otp_salt,
     armor(pgp_sym_encrypt(p_codigo, v_key)), 'generado', 0, p_expira_en, p_reembolso_ids, p_telefono)
  on conflict (empleado_id, semana) do update
    set otp_hash = excluded.otp_hash,
        otp_salt = excluded.otp_salt,
        otp_cifrado = excluded.otp_cifrado,
        estado = 'generado',
        intentos = 0,
        expira_en = excluded.expira_en,
        reembolso_ids = excluded.reembolso_ids,
        telefono = excluded.telefono;
end $$;

-- Devuelve el código en claro de un OTP vigente. Pensada para llamarse desde la
-- edge function de la app (service_role) DESPUÉS de autenticar al empleado dueño.
create or replace function public.revelar_codigo_comida(
  p_empleado_id integer,
  p_semana date
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_cifrado text;
  v_estado text;
begin
  select otp_cifrado, estado into v_cifrado, v_estado
  from public.rnd_comida_otp
  where empleado_id = p_empleado_id and semana = p_semana;
  if v_cifrado is null then return null; end if;
  if v_estado <> 'generado' then return null; end if;  -- usado/expirado no se muestra
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  return pgp_sym_decrypt(dearmor(v_cifrado), v_key);
end $$;

revoke all on function public.registrar_otp_comida(integer,date,text,text,text,timestamptz,uuid[],text) from public, anon, authenticated;
revoke all on function public.revelar_codigo_comida(integer,date) from public, anon, authenticated;
```

- [ ] **Step 3: Aplicar la migración**

Aplicar vía MCP `apply_migration` (name `0009_otp_cifrado`).

- [ ] **Step 4: Test de ida y vuelta (SQL con rollback)**

```sql
do $$
declare
  v_emp integer := 999991;
  v_hoy date := current_date;
  v_out text;
  v_enclaro text;
begin
  perform public.registrar_otp_comida(
    v_emp, v_hoy, '654321', 'hash_x', 'salt_x',
    now() + interval '1 hour', array[]::uuid[], '0000000000');

  -- En la base NO debe quedar el código en claro
  select otp_cifrado into v_enclaro from rnd_comida_otp where empleado_id=v_emp and semana=v_hoy;
  if v_enclaro like '%654321%' then
    raise exception 'FALLA: el código aparece en claro en otp_cifrado';
  end if;

  -- La RPC de revelado debe devolver exactamente el código
  select public.revelar_codigo_comida(v_emp, v_hoy) into v_out;
  raise exception 'ROUNDTRIP revelado=% (esperado 654321) cifrado_no_claro=OK', v_out;
end $$;
```

Expected: el mensaje muestra `revelado=654321` y `cifrado_no_claro=OK`. (El `raise exception` revierte todo.)

- [ ] **Step 5: Persistir vía la RPC desde el generador**

En `supabase/functions/generar-otp-comidas/index.ts`, reemplazar el bloque `await supabase.from("rnd_comida_otp").upsert({...})` ([líneas ~101-112](../../supabase/functions/generar-otp-comidas/index.ts#L101-L112)) por una llamada a la RPC (que ahora también guarda el cifrado):

```ts
      const { error: errUp } = await supabase.rpc("registrar_otp_comida", {
        p_empleado_id: empleadoId,
        p_semana: semana,
        p_codigo: codigo,
        p_otp_hash: hash,
        p_otp_salt: salt,
        p_expira_en: expiraEn,
        p_reembolso_ids: info.reembolsoIds,
        p_telefono: info.telefono,
      });
      if (errUp) { console.error("registrar_otp err", errUp); continue; }
```

- [ ] **Step 6: Desplegar y verificar que el OTP del día queda con cifrado**

Desplegar `generar-otp-comidas`. Dispararla (igual que Task 2, Step 3). Luego:

```sql
select empleado_id, estado, (otp_cifrado is not null) as tiene_cifrado
from rnd_comida_otp where semana = to_char(now() at time zone 'America/Mazatlan', 'YYYY-MM-DD');
```

Expected: filas con `tiene_cifrado = true`. Confirmar además que la validación de la cajera sigue viva con un OTP real (no en este plan, pero `otp_hash` no cambió, así que `liberar_comidas_otp` sigue funcionando).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0009_otp_cifrado.sql supabase/functions/generar-otp-comidas/index.ts
git commit -m "feat(otp): código cifrado en base (Vault) + RPCs registrar/revelar"
```

---

## Cierre del Plan A

- [ ] **Correr toda la suite de tests del app**

Run: `npx vitest run`
Expected: PASS (incluye el nuevo `nombres.test.ts`).

- [ ] **Typecheck**

Run: `npx tsc --noEmit` (o `pnpm --filter @devoluciones/domain typecheck` si aplica al paquete).
Expected: sin errores.

**Resultado esperable:** el pago de comidas se liga por `empleado_id`, los pendientes quedan rellenados, el cron del repo refleja producción, y cada OTP nuevo guarda su código cifrado listo para mostrarse en la app (Plan C). La validación de la cajera queda intacta.

**Siguiente:** Plan B — Autenticación de empleados (`rnd_empleado_auth`, registro/login/reset, cookie `emp_sesion` firmada, rama del middleware).
```
