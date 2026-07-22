# Solicitud de Material — Cimientos (base de datos y roles) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar lista la base de datos del módulo de solicitud de material (tablas, RPCs con validación de estados) y el rol `almacen` en el dominio, sin ninguna pantalla todavía.

**Architecture:** Tres migraciones independientes y aplicables por separado: la columna `cod_estab` en `sucursales_map` (cuarto vocabulario de sucursal), las dos tablas con RLS de solo lectura, y las cinco RPCs `security definer` que son el único camino de escritura. Después, el dominio (`packages/domain`) gana el rol `almacen` y dos `TabId` nuevos, que el middleware recoge automáticamente porque deriva sus rutas conocidas de `ROL_TABS`.

**Tech Stack:** Supabase/Postgres (migraciones SQL aplicadas con la herramienta MCP `apply_migration`, verificadas con `execute_sql`), TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-solicitud-material-design.md` (§3.1, §3.2, §3.3, §3.4, §3.11)

**Cómo se prueba aquí:** las migraciones son lógica de base de datos, así que el "test que falla primero" es SQL ejecutado vía MCP `execute_sql`, igual que en el plan `2026-07-20-pago-comidas-filtro-por-sucursal.md`. El dominio sí es TS puro y se prueba con vitest.

**Datos reales verificados el 2026-07-21 (úsalos en las verificaciones):**
- `sucursales_map` tiene 8 filas: `CLN=CULIACAN, CSL=CABOS, FTE=EL FUERTE, JJR=JUAN JOSE RIOS, LMM=MATRIZ, LPZ=LA PAZ, SJC=SAN JOSE, TML=TAMARAL`.
- `cod_estab` del ERP (de `C:\censos-web\config\sucursales.js`): `LMM=1, FTE=3, CLN=5, LPZ=6, SJC=7, CSL=8, JJR=11, TML=17`.
- Empleado real para pruebas: **id 1006, CARLOS OMAR RUIZ COTA, sucursal `TAMARAL` → `TML` → cod_estab 17**.
- Última migración existente: `0018_normalizar_sucursal_usuario.sql`.
- Hay exactamente un gerente por sucursal en `rnd_usuarios`; **no existe ningún usuario con rol `almacen`** todavía.

**Importante:** se trabaja en `master` **local y no se pushea nada**. Las migraciones sí se aplican al Supabase real (no hay base de desarrollo aparte); son aditivas y nadie ve el módulo hasta que suba código.

---

## File Structure

- **Create** `supabase/migrations/0019_material_cod_estab.sql` — agrega y llena `sucursales_map.cod_estab`. Va sola porque toca una tabla que ya está en producción y conviene poder revisarla aislada.
- **Create** `supabase/migrations/0020_material_tablas.sql` — `rnd_material_solicitudes`, `rnd_material_lineas`, secuencia del folio, índices y RLS.
- **Create** `supabase/migrations/0021_material_rpcs.sql` — las cinco RPCs de escritura y sus `grant`/`revoke`.
- **Modify** `packages/domain/src/roles.ts` — rol `almacen`, `TabId` nuevos, reparto de pestañas.
- **Modify** `packages/domain/src/roles.test.ts` — el test `"gerente solo ve comidas-gerente"` deja de ser cierto; se actualiza y se agregan casos del rol nuevo.
- **Modify** `src/components/nav/Sidebar.tsx` — etiqueta e ícono de las dos pestañas nuevas. **No** se agregan a `RUTAS_EXISTENTES`: se muestran como "pronto" hasta que el plan 4 cree las páginas.

---

## Task 1: `cod_estab` en `sucursales_map`

**Files:**
- Create: `supabase/migrations/0019_material_cod_estab.sql`
- Aplicar/probar vía: herramienta MCP Supabase (`apply_migration`, `execute_sql`)

- [ ] **Step 1: Test que falla primero — la columna no existe**

Ejecuta vía MCP `execute_sql`:

```sql
select abrev, cod_estab from public.sucursales_map order by abrev;
```

Esperado: **FALLA** con `column "cod_estab" does not exist`.

- [ ] **Step 2: Escribir la migración**

Crea `supabase/migrations/0019_material_cod_estab.sql` con este contenido exacto:

```sql
-- Cuarto vocabulario de sucursal: el cod_estab numérico del ERP (SQL Server BMSCabos).
--
-- Ya conviven tres vocabularios:
--   * abreviatura   (rnd_usuarios.sucursal)  -> 'FTE', 'LMM', 'CSL'...
--   * nombre largo  (empleados.sucursal)     -> 'EL FUERTE', 'MATRIZ'...
--   * nombre bonito (packages/domain)        -> 'El Fuerte', 'Los Mochis'... (solo UI)
-- El ERP usa un cuarto: un entero por establecimiento. No es derivable de nada,
-- así que vive en sucursales_map, que ya es la fuente única de verdad del mapeo.
--
-- Valores tomados de C:\censos-web\config\sucursales.js (SUCURSALES).
-- Ojo: CSL (CSL Brisas, estab 8) es el único cuyo BMS vive en otro servidor y
-- se consulta por linked server; eso lo resuelve censos-web, no esta tabla.

alter table public.sucursales_map
  add column if not exists cod_estab int;

update public.sucursales_map as s
   set cod_estab = v.cod
  from (values
    ('LMM', 1),
    ('FTE', 3),
    ('CLN', 5),
    ('LPZ', 6),
    ('SJC', 7),
    ('CSL', 8),
    ('JJR', 11),
    ('TML', 17)
  ) as v(abrev, cod)
 where s.abrev = v.abrev;

comment on column public.sucursales_map.cod_estab is
  'cod_estab del ERP BMSCabos. Fuente: censos-web/config/sucursales.js';
```

- [ ] **Step 3: Aplicar la migración**

Aplica con MCP `apply_migration`, nombre `0019_material_cod_estab`, con el contenido del archivo.

- [ ] **Step 4: Verificar que ahora sí pasa**

Ejecuta vía MCP `execute_sql`:

```sql
select abrev, nombre_largo, cod_estab from public.sucursales_map order by cod_estab;
```

Esperado: 8 filas, **ninguna con `cod_estab` nulo**, y exactamente esta correspondencia:
`LMM=1, FTE=3, CLN=5, LPZ=6, SJC=7, CSL=8, JJR=11, TML=17`.

Si alguna sale nula, hay una abreviatura en la tabla que no está en la lista del `values`: repórtalo, no la inventes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_material_cod_estab.sql
git commit -m "feat(material): cod_estab del ERP en sucursales_map"
```

---

## Task 2: Tablas de solicitudes y líneas

**Files:**
- Create: `supabase/migrations/0020_material_tablas.sql`
- Aplicar/probar vía: herramienta MCP Supabase

- [ ] **Step 1: Test que falla primero — las tablas no existen**

Ejecuta vía MCP `execute_sql`:

```sql
select count(*) from public.rnd_material_solicitudes;
```

Esperado: **FALLA** con `relation "public.rnd_material_solicitudes" does not exist`.

- [ ] **Step 2: Escribir la migración**

Crea `supabase/migrations/0020_material_tablas.sql` con este contenido exacto:

```sql
-- Módulo de solicitud de material: empleado pide, gerente autoriza, almacén entrega.
-- Encabezado + líneas. Todo lo que viene del ERP se guarda CONGELADO (copia del
-- momento en que se pidió), para que el histórico no se mueva si cambian precios
-- y para que gerente y almacén no dependan de que SQL Server esté vivo.

-- Folio legible para que almacén pueda cantarlo: SM-000001, SM-000002...
create sequence if not exists public.rnd_material_folio_seq;

create table if not exists public.rnd_material_solicitudes (
  id                 uuid primary key default gen_random_uuid(),
  folio              text not null unique
                       default ('SM-' || lpad(nextval('public.rnd_material_folio_seq')::text, 6, '0')),
  empleado_id        int  not null,
  empleado_nombre    text not null,          -- copia: el padrón puede cambiar
  sucursal           text not null,          -- ABREVIATURA (LMM, FTE...), igual que rnd_usuarios.sucursal
  cod_estab          int,                    -- número del ERP; nulo si la sucursal no lo tenía mapeado
  nota               text,
  estado             text not null default 'pendiente'
                       check (estado in ('pendiente','autorizada','rechazada','entregada','cancelada')),
  creado_en          timestamptz not null default now(),
  autorizado_por     text,
  fecha_autorizacion timestamptz,
  motivo_rechazo     text,
  entregado_por      text,
  fecha_entrega      timestamptz
);

comment on column public.rnd_material_solicitudes.sucursal is
  'Abreviatura (vocabulario de rnd_usuarios.sucursal), para que gerente y almacén filtren por comparación directa';

-- Lo que consultan las pantallas: pendientes/autorizadas de una sucursal, y el historial de un empleado.
create index if not exists idx_material_sol_sucursal_estado
  on public.rnd_material_solicitudes (sucursal, estado, creado_en desc);
create index if not exists idx_material_sol_empleado
  on public.rnd_material_solicitudes (empleado_id, creado_en desc);

create table if not exists public.rnd_material_lineas (
  id                  uuid primary key default gen_random_uuid(),
  solicitud_id        uuid not null references public.rnd_material_solicitudes(id) on delete cascade,
  orden               int  not null default 0,
  cod_prod            text not null,         -- copia congelada del ERP
  descripcion         text not null,         -- copia congelada del ERP
  unidad              text,                  -- copia congelada del ERP
  cantidad            numeric not null check (cantidad > 0),
  costo_unitario      numeric,               -- costo_promedio del ERP al pedir
  existencia_al_pedir numeric,               -- exist_unidades del ERP al pedir (informativo)
  cantidad_entregada  numeric check (cantidad_entregada is null or cantidad_entregada >= 0)
);

create index if not exists idx_material_lineas_solicitud
  on public.rnd_material_lineas (solicitud_id, orden);

-- RLS: lectura abierta a la anon key (el escritorio lee así todo el proyecto),
-- y CERO políticas de escritura. Escribir solo se puede por las RPCs del
-- archivo 0021, que corren como service_role.
alter table public.rnd_material_solicitudes enable row level security;
alter table public.rnd_material_lineas      enable row level security;

drop policy if exists material_sol_lectura on public.rnd_material_solicitudes;
create policy material_sol_lectura
  on public.rnd_material_solicitudes
  for select to anon, authenticated
  using (true);

drop policy if exists material_lineas_lectura on public.rnd_material_lineas;
create policy material_lineas_lectura
  on public.rnd_material_lineas
  for select to anon, authenticated
  using (true);
```

- [ ] **Step 3: Aplicar la migración**

Aplica con MCP `apply_migration`, nombre `0020_material_tablas`.

- [ ] **Step 4: Verificar que las tablas existen y que la anon key NO puede escribir**

Ejecuta vía MCP `execute_sql`:

```sql
select
  (select count(*) from public.rnd_material_solicitudes) as solicitudes,
  (select count(*) from public.rnd_material_lineas)      as lineas,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('rnd_material_solicitudes','rnd_material_lineas')) as politicas,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('rnd_material_solicitudes','rnd_material_lineas')
      and cmd <> 'SELECT') as politicas_de_escritura;
```

Esperado: `solicitudes = 0`, `lineas = 0`, `politicas = 2`, **`politicas_de_escritura = 0`**.

- [ ] **Step 5: Verificar que el folio se autogenera**

Ejecuta vía MCP `execute_sql`:

```sql
insert into public.rnd_material_solicitudes (empleado_id, empleado_nombre, sucursal, cod_estab)
values (1006, 'PRUEBA BORRAR', 'TML', 17)
returning folio, estado, creado_en;
```

Esperado: un `folio` con formato `SM-000001` y `estado = 'pendiente'`.

Ahora bórralo:

```sql
delete from public.rnd_material_solicitudes where empleado_nombre = 'PRUEBA BORRAR';
```

Esperado: `DELETE 1`. (El folio consumido no se recicla; da igual, es solo un contador.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0020_material_tablas.sql
git commit -m "feat(material): tablas de solicitudes y lineas con RLS de solo lectura"
```

---

## Task 3: RPCs de escritura con validación de estados

**Files:**
- Create: `supabase/migrations/0021_material_rpcs.sql`
- Aplicar/probar vía: herramienta MCP Supabase

- [ ] **Step 1: Test que falla primero — la RPC no existe**

Ejecuta vía MCP `execute_sql`:

```sql
select public.material_crear(1006, 'prueba', '[]'::jsonb);
```

Esperado: **FALLA** con `function public.material_crear(integer, unknown, jsonb) does not exist`.

- [ ] **Step 2: Escribir la migración**

Crea `supabase/migrations/0021_material_rpcs.sql` con este contenido exacto:

```sql
-- Único camino de escritura del módulo de material. Cada RPC valida la
-- transición de estado con un `for update` sobre la solicitud, para que dos
-- clics simultáneos no autoricen ni entreguen dos veces: gana el primero.
--
-- Todas devuelven jsonb {ok, ...}. Los errores de negocio vuelven como
-- ok:false con mensaje legible; solo lo verdaderamente excepcional levanta.

-- ── Crear (la llama el route handler del empleado con service_role) ──────────
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

  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where coalesce(trim(l->>'cod_prod'), '') = ''
        or coalesce(trim(l->>'descripcion'), '') = ''
        or coalesce((l->>'cantidad')::numeric, 0) <= 0
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales sin código o con cantidad inválida');
  end if;

  -- El empleado sale del padrón de comidas (`empleados`), que es el mismo que
  -- usa el login de la PWA. NO es rnd_empleados (ese es el de reembolsos).
  select trim(concat_ws(' ', e.nombre, e.apellido)), e.sucursal
    into v_nombre, v_suc_larga
    from public.empleados e
   where e.id = p_empleado_id and e.activo;

  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Empleado no encontrado o inactivo');
  end if;

  -- Nombre largo (EL FUERTE) -> abreviatura (FTE) + cod_estab del ERP.
  select m.abrev, m.cod_estab
    into v_abrev, v_cod_estab
    from public.sucursales_map m
   where upper(trim(m.nombre_largo)) = upper(trim(coalesce(v_suc_larga, '')));

  if v_abrev is null then
    return jsonb_build_object('ok', false, 'error', 'Tu sucursal no está configurada, avisa a sistemas');
  end if;

  insert into public.rnd_material_solicitudes
    (empleado_id, empleado_nombre, sucursal, cod_estab, nota)
  values
    (p_empleado_id, v_nombre, v_abrev, v_cod_estab, nullif(trim(coalesce(p_nota, '')), ''))
  returning id, folio into v_id, v_folio;

  insert into public.rnd_material_lineas
    (solicitud_id, orden, cod_prod, descripcion, unidad, cantidad, costo_unitario, existencia_al_pedir)
  select v_id,
         (t.ord - 1)::int,
         trim(t.l->>'cod_prod'),
         trim(t.l->>'descripcion'),
         nullif(trim(coalesce(t.l->>'unidad', '')), ''),
         (t.l->>'cantidad')::numeric,
         nullif(t.l->>'costo_unitario', '')::numeric,
         nullif(t.l->>'existencia_al_pedir', '')::numeric
    from jsonb_array_elements(p_lineas) with ordinality as t(l, ord);

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'lineas', v_n);
end;
$$;

-- ── Autorizar (gerente) ─────────────────────────────────────────────────────
create or replace function public.material_autorizar(
  p_id      uuid,
  p_usuario text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text;
begin
  select estado, folio into v_estado, v_folio
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'La solicitud ya está ' || v_estado);
  end if;

  update public.rnd_material_solicitudes
     set estado = 'autorizada',
         autorizado_por = nullif(trim(coalesce(p_usuario, '')), ''),
         fecha_autorizacion = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', v_folio);
end;
$$;

-- ── Rechazar (gerente) ──────────────────────────────────────────────────────
create or replace function public.material_rechazar(
  p_id      uuid,
  p_usuario text,
  p_motivo  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text;
begin
  select estado, folio into v_estado, v_folio
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'La solicitud ya está ' || v_estado);
  end if;

  update public.rnd_material_solicitudes
     set estado = 'rechazada',
         autorizado_por = nullif(trim(coalesce(p_usuario, '')), ''),
         fecha_autorizacion = now(),
         motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'rechazada', 'folio', v_folio);
end;
$$;

-- ── Entregar (almacén) ──────────────────────────────────────────────────────
-- p_entregas: [{"linea_id": "<uuid>", "cantidad_entregada": 3}, ...]
-- Las líneas que no vengan en el arreglo se cierran en 0: si no se capturó,
-- no se entregó. Así ninguna línea queda en NULL después de cerrar.
create or replace function public.material_entregar(
  p_id       uuid,
  p_usuario  text,
  p_entregas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text; v_n int;
begin
  select estado, folio into v_estado, v_folio
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_estado <> 'autorizada' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Solo se entrega lo autorizado; esta solicitud está ' || v_estado);
  end if;

  update public.rnd_material_lineas l
     set cantidad_entregada = greatest(0, (e->>'cantidad_entregada')::numeric)
    from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
   where l.solicitud_id = p_id
     and l.id = (e->>'linea_id')::uuid;
  get diagnostics v_n = row_count;

  update public.rnd_material_lineas
     set cantidad_entregada = 0
   where solicitud_id = p_id
     and cantidad_entregada is null;

  update public.rnd_material_solicitudes
     set estado = 'entregada',
         entregado_por = nullif(trim(coalesce(p_usuario, '')), ''),
         fecha_entrega = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'entregada', 'folio', v_folio, 'lineas', v_n);
end;
$$;

-- ── Cancelar (el propio empleado, solo mientras siga pendiente) ─────────────
create or replace function public.material_cancelar(
  p_id          uuid,
  p_empleado_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_dueno int;
begin
  select estado, empleado_id into v_estado, v_dueno
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_dueno is distinct from p_empleado_id then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud no es tuya');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Ya no se puede cancelar: está ' || v_estado);
  end if;

  update public.rnd_material_solicitudes
     set estado = 'cancelada'
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'cancelada');
end;
$$;

-- ── Cerrojo: solo service_role escribe ──────────────────────────────────────
-- Por defecto Postgres da execute a public; hay que quitarlo explícitamente,
-- o la anon key del navegador podría llamar estas funciones.
revoke execute on function public.material_crear(int, text, jsonb)      from public, anon, authenticated;
revoke execute on function public.material_autorizar(uuid, text)        from public, anon, authenticated;
revoke execute on function public.material_rechazar(uuid, text, text)   from public, anon, authenticated;
revoke execute on function public.material_entregar(uuid, text, jsonb)  from public, anon, authenticated;
revoke execute on function public.material_cancelar(uuid, int)          from public, anon, authenticated;

grant execute on function public.material_crear(int, text, jsonb)       to service_role;
grant execute on function public.material_autorizar(uuid, text)         to service_role;
grant execute on function public.material_rechazar(uuid, text, text)    to service_role;
grant execute on function public.material_entregar(uuid, text, jsonb)   to service_role;
grant execute on function public.material_cancelar(uuid, int)           to service_role;
```

- [ ] **Step 3: Aplicar la migración**

Aplica con MCP `apply_migration`, nombre `0021_material_rpcs`.

- [ ] **Step 4: Verificar el camino feliz completo**

Ejecuta vía MCP `execute_sql`, un bloque a la vez.

Crear (empleado 1006 = CARLOS OMAR RUIZ COTA, TAMARAL):

```sql
select public.material_crear(
  1006,
  'prueba del plan de cimientos',
  '[{"cod_prod":"ANG130","descripcion":"ANGULO 1/8 X 1 1/4","unidad":"PZ","cantidad":2,"costo_unitario":180.5,"existencia_al_pedir":40},
    {"cod_prod":"TOR001","descripcion":"TORNILLO 1/4","unidad":"PZ","cantidad":10}]'::jsonb
) as r;
```

Esperado: `{"ok": true, "id": "...", "folio": "SM-0000NN", "lineas": 2}`.

Comprobar que la sucursal se tradujo sola:

```sql
select folio, empleado_nombre, sucursal, cod_estab, estado
  from public.rnd_material_solicitudes
 where empleado_id = 1006
 order by creado_en desc limit 1;
```

Esperado: `sucursal = 'TML'`, `cod_estab = 17`, `estado = 'pendiente'`. **Si `sucursal` trae `TAMARAL` (nombre largo) la traducción está al revés — deténte y repórtalo.**

Autorizar y verificar que no se puede autorizar dos veces:

```sql
select public.material_autorizar(
  (select id from public.rnd_material_solicitudes where empleado_id = 1006 order by creado_en desc limit 1),
  'Guillermo Corrales'
) as primera,
       public.material_autorizar(
  (select id from public.rnd_material_solicitudes where empleado_id = 1006 order by creado_en desc limit 1),
  'Guillermo Corrales'
) as segunda;
```

Esperado: `primera` → `{"ok": true, "estado": "autorizada", ...}`; `segunda` → `{"ok": false, "estado": "autorizada", "error": "La solicitud ya está autorizada"}`.

Entregar con una línea corta (se pidieron 10 tornillos, se entregan 6):

```sql
with s as (
  select id from public.rnd_material_solicitudes where empleado_id = 1006 order by creado_en desc limit 1
), l as (
  select jsonb_agg(jsonb_build_object('linea_id', li.id, 'cantidad_entregada',
                                      case when li.cod_prod = 'TOR001' then 6 else li.cantidad end)) as entregas
    from public.rnd_material_lineas li, s where li.solicitud_id = s.id
)
select public.material_entregar((select id from s), 'Encargado Almacen TML', (select entregas from l));
```

Esperado: `{"ok": true, "estado": "entregada", "lineas": 2}`.

```sql
select li.cod_prod, li.cantidad, li.cantidad_entregada
  from public.rnd_material_lineas li
  join public.rnd_material_solicitudes s on s.id = li.solicitud_id
 where s.empleado_id = 1006
 order by s.creado_en desc, li.orden limit 2;
```

Esperado: `ANG130` con `cantidad = 2` y `cantidad_entregada = 2`; `TOR001` con `cantidad = 10` y `cantidad_entregada = 6`.

- [ ] **Step 5: Verificar los caminos infelices**

```sql
-- Empleado inexistente
select public.material_crear(999999, null, '[{"cod_prod":"X","descripcion":"X","cantidad":1}]'::jsonb) as empleado_malo;
-- Sin materiales
select public.material_crear(1006, null, '[]'::jsonb) as sin_lineas;
-- Cantidad inválida
select public.material_crear(1006, null, '[{"cod_prod":"X","descripcion":"X","cantidad":0}]'::jsonb) as cantidad_cero;
-- Entregar algo que ya se entregó
select public.material_entregar(
  (select id from public.rnd_material_solicitudes where empleado_id = 1006 order by creado_en desc limit 1),
  'Alguien', '[]'::jsonb) as ya_entregada;
```

Esperado, en orden: `"Empleado no encontrado o inactivo"`, `"La solicitud no tiene materiales"`, `"Hay materiales sin código o con cantidad inválida"`, y `"Solo se entrega lo autorizado; esta solicitud está entregada"`. Los cuatro con `ok: false` y **sin filas creadas**.

- [ ] **Step 6: Verificar el cerrojo de permisos**

```sql
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_puede,
       has_function_privilege('service_role',  p.oid, 'execute') as service_puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'material\_%'
 order by p.proname;
```

Esperado: 5 filas; `anon_puede = false` y `auth_puede = false` en **todas**; `service_puede = true` en todas.

- [ ] **Step 7: Limpiar los datos de prueba**

```sql
delete from public.rnd_material_solicitudes where empleado_id = 1006;
select count(*) as deben_ser_cero from public.rnd_material_lineas;
```

Esperado: `deben_ser_cero = 0` (el `on delete cascade` se llevó las líneas).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0021_material_rpcs.sql
git commit -m "feat(material): RPCs de crear/autorizar/rechazar/entregar/cancelar"
```

---

## Task 4: Rol `almacen` y pestañas nuevas en el dominio

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Test: `packages/domain/src/roles.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

En `packages/domain/src/roles.test.ts`, **reemplaza** el test existente `"gerente solo ve comidas-gerente"` (líneas 29-31) por este, y **agrega** el bloque del rol nuevo al final del archivo:

```ts
  it("gerente ve comidas y material", () => {
    expect(tabsDeRol("gerente")).toEqual(["comidas-gerente", "materiales-gerente"]);
  });
```

```ts
describe("rol almacen", () => {
  it("normaliza 'almacen' y su variante con acento", () => {
    expect(normalizarRol("almacen")).toBe("almacen");
    expect(normalizarRol("  Almacén ")).toBe("almacen");
  });

  it("el almacenista solo ve su tab de entrega de material", () => {
    expect(ROL_TABS.almacen).toEqual(["materiales-almacen"]);
    expect(tabsDeRol("almacen")).toEqual(["materiales-almacen"]);
  });

  it("un rol desconocido sigue cayendo a caja_chica (mínimo privilegio)", () => {
    expect(normalizarRol("intendencia")).toBe("caja_chica");
  });

  it("admin ve las dos pestañas de material", () => {
    const tabs = tabsDeRol("admin");
    expect(tabs).toContain("materiales-gerente");
    expect(tabs).toContain("materiales-almacen");
  });
});
```

- [ ] **Step 2: Correr los tests para verlos fallar**

```bash
cd packages/domain && npx vitest run
```

Esperado: **FALLA**. `tabsDeRol("gerente")` devuelve `["comidas-gerente"]`, `normalizarRol("almacen")` devuelve `"caja_chica"`, y TypeScript se queja de `ROL_TABS.almacen` porque el rol no existe.

- [ ] **Step 3: Implementar el rol y las pestañas**

En `packages/domain/src/roles.ts` haz exactamente estos cuatro cambios.

Línea 1, agregar el rol:

```ts
export const ROLES = ["admin", "caja_chica", "gerente", "autorizador", "almacen"] as const;
```

Bloque `TabId`, agregar las dos pestañas:

```ts
export type TabId =
  | "nuevo-reembolso"
  | "revision"
  | "entregas"
  | "reportes"
  | "dashboard"
  | "comidas-gerente"
  | "pago-comidas"
  | "autorizaciones"
  | "materiales-gerente"
  | "materiales-almacen";
```

En `normalizarRol`, antes del `return "caja_chica"` final:

```ts
  if (r === "almacen" || r === "almacén") return "almacen";
```

Y el reparto de pestañas:

```ts
export const ROL_TABS: Record<Rol, readonly TabId[]> = {
  admin: [
    "nuevo-reembolso",
    "revision",
    "entregas",
    "reportes",
    "dashboard",
    "materiales-gerente",
    "materiales-almacen",
  ],
  caja_chica: ["nuevo-reembolso", "revision", "reportes", "pago-comidas"],
  gerente: ["comidas-gerente", "materiales-gerente"],
  autorizador: ["autorizaciones"],
  almacen: ["materiales-almacen"],
};
```

- [ ] **Step 4: Correr los tests para verlos pasar**

```bash
cd packages/domain && npx vitest run
```

Esperado: PASS, todos los tests de `roles.test.ts` incluidos.

- [ ] **Step 5: Verificar que el resto del proyecto sigue compilando**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores. `ROL_TABS` es un `Record<Rol, ...>`, así que si faltara el rol nuevo TypeScript lo diría aquí.

Verifica también que el middleware recogió las rutas nuevas sin tocarlo: `src/middleware.ts:23-25` deriva `TABS_CONOCIDOS` de `Object.values(ROL_TABS).flat()`, así que `/materiales-gerente` y `/materiales-almacen` ya quedan custodiadas por rol automáticamente.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/roles.ts packages/domain/src/roles.test.ts
git commit -m "feat(material): rol almacen y pestanas materiales-gerente/materiales-almacen"
```

---

## Task 5: Pestañas visibles en el Sidebar (todavía como "pronto")

**Files:**
- Modify: `src/components/nav/Sidebar.tsx`

El Sidebar muestra deshabilitada, con la etiqueta "pronto", cualquier pestaña del rol que no esté en `RUTAS_EXISTENTES`. Aprovechamos eso: aquí se les da nombre e ícono, y el plan 4 las enciende cuando existan las páginas. Así el gerente ve desde ya que viene, y nadie llega a un 404.

- [ ] **Step 1: Agregar las etiquetas**

En `src/components/nav/Sidebar.tsx`, dentro de `ETIQUETAS` (línea 7), agrega estas dos entradas al final del objeto:

```ts
  "materiales-gerente": "Material",
  "materiales-almacen": "Almacén",
```

- [ ] **Step 2: Agregar los íconos**

Dentro de `ICONOS` (línea 19), agrega estas dos entradas al final del objeto:

```ts
  "materiales-gerente": (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7L12 12l8.7-5M12 22V12" />
    </>
  ),
  "materiales-almacen": (
    <>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M3 21h18" />
    </>
  ),
```

- [ ] **Step 3: Verificar que compila y se ve**

```bash
npx tsc --noEmit -p tsconfig.json
```

Esperado: sin errores. `ETIQUETAS` e `ICONOS` son `Record<TabId, ...>`, así que si faltara una entrada TypeScript lo diría.

```bash
npm run dev
```

Entra con el gerente de una sucursal (por ejemplo Guillermo Corrales, TML) y confirma en el sidebar: **Comidas** activa y **Material** en gris con la etiqueta "pronto". No debe verse "Almacén" (esa es del rol `almacen`).

- [ ] **Step 4: Commit**

```bash
git add src/components/nav/Sidebar.tsx
git commit -m "feat(material): etiquetas e iconos de las pestanas de material en el sidebar"
```

---

## Verificación final del plan

- [ ] **Las tres migraciones están aplicadas y el ciclo completo funciona en SQL** (Task 3 Step 4).
- [ ] **La anon key no puede ejecutar ninguna RPC `material_*`** (Task 3 Step 6).
- [ ] **No quedan datos de prueba** en `rnd_material_solicitudes` ni `rnd_material_lineas` (Task 3 Step 7).
- [ ] `cd packages/domain && npx vitest run` → verde.
- [ ] `npx vitest run` (raíz) → verde, sin regresiones.
- [ ] `npx tsc --noEmit -p tsconfig.json` → sin errores.
- [ ] **No se ha pusheado nada.** Confirma con `git status -sb`: debe decir que `master` está adelante del remoto, y ahí se queda.

**Siguiente plan:** `2026-07-21-material-puente-erp.md` — el endpoint de catálogo en censos-web y el route handler que lo consume.
