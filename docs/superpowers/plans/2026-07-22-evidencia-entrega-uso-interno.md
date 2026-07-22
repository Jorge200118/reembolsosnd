# Evidencia de entrega (Uso interno) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una entrega de uso interno no pueda cerrarse sin foto del almacenista y sin el código de 6 dígitos del empleado, verificado después de capturar las cantidades.

**Architecture:** El código se genera al autorizar y vive en la propia solicitud (hash bcrypt + copia cifrada con el Vault). `material_entregar` gana dos parámetros obligatorios y verifica el código dentro del mismo `for update` que ya usa, así que no hay ventana entre verificar y cerrar. La foto va a un bucket privado nuevo y la sube un route handler con `service_role`; el navegador nunca toca storage.

**Tech Stack:** Postgres/Supabase (plpgsql `security definer`, pgcrypto, Vault, Storage), Next.js 16 App Router (route handlers), React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-evidencia-entrega-uso-interno-design.md`

---

## Estructura de archivos

**Se crean:**
- `supabase/migrations/0028_codigo_entrega.sql` — columnas, generación en `material_autorizar`, RPC `material_codigo`
- `supabase/migrations/0029_material_entregar_evidencia.sql` — `material_entregar` exige código y foto
- `supabase/migrations/0030_bucket_uso_interno.sql` — bucket privado
- `src/lib/materiales/codigo.ts` — helpers puros del código (formato, normalización)
- `src/lib/materiales/codigo.test.ts`
- `src/lib/materiales/storage.ts` — subir y firmar URLs con `service_role` (server-only)
- `src/app/api/materiales/evidencia/route.ts` — POST sube la foto, GET devuelve URL firmada
- `src/app/api/empleado/materiales/codigo/route.ts` — revela el código a su dueño
- `src/components/materiales/CapturaEntrega.tsx` — foto + 6 casilleros, para el diálogo
- `src/components/materiales/CapturaEntrega.test.tsx`

**Se modifican:**
- `src/components/ui/ConfirmDialog.tsx` — prop `deshabilitarConfirmar`
- `src/app/(app)/materiales-almacen/page.tsx` — sube la foto y manda código
- `src/lib/hooks/useAccionesMaterial.ts` — el tipo de entregar gana `codigo` y `evidenciaPath`
- `src/app/api/materiales/entregar/route.ts` — pasa los dos parámetros nuevos
- `src/app/empleado/materiales/page.tsx` — botón "Ver mi código"
- `src/lib/materiales/totales.ts` — `SolicitudGuardada` gana `evidencia_path` y `codigo_usado_en`
- `src/lib/supabase/queries/materiales.ts` — pide los campos nuevos
- `supabase/functions/enviar-push/mensajes.ts` — texto de `material_autorizada`

---

## Task 1: Código al autorizar + RPC para revelarlo

**Files:**
- Create: `supabase/migrations/0028_codigo_entrega.sql`

- [ ] **Step 1: Comprobar que hoy NO hay código**

Ejecutar (mcp supabase `execute_sql`):
```sql
select count(*) as columnas_de_codigo
from information_schema.columns
where table_schema='public' and table_name='rnd_material_solicitudes'
  and column_name like 'codigo%';
```
Esperado: `0`.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/0028_codigo_entrega.sql`:

```sql
-- El empleado prueba que recibió dictando un código de 6 dígitos que solo él
-- tiene. Se genera al autorizar: una solicitud autorizada siempre trae código,
-- una pendiente nunca.
--
-- Mismo patrón que el código de comidas (en producción desde julio de 2026):
-- se guarda el HASH para verificar y una copia CIFRADA con la llave del Vault
-- para poder volver a mostrárselo al empleado si cierra la app. Sin la copia
-- cifrada el código sería irrecuperable y una app cerrada dejaría al empleado
-- sin poder recoger su material.

alter table public.rnd_material_solicitudes
  add column if not exists codigo_hash             text,
  add column if not exists codigo_cifrado          text,
  add column if not exists codigo_intentos         int not null default 0,
  add column if not exists codigo_bloqueado_hasta  timestamptz,
  add column if not exists codigo_usado_en         timestamptz,
  add column if not exists evidencia_path          text;

-- OJO con el search_path: crypt, gen_salt, pgp_sym_encrypt, armor y
-- gen_random_bytes viven en el esquema `extensions`, no en `public`. Con
-- `set search_path = public` a secas, esta función revienta.
drop function if exists public.material_autorizar(uuid, text, text);

create function public.material_autorizar(p_id uuid, p_usuario text, p_sucursal text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_estado text; v_folio text; v_suc text;
  v_bytes bytea; v_codigo text; v_key text;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién autoriza');
  end if;
  if coalesce(trim(p_sucursal), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la sucursal de quien autoriza');
  end if;

  select estado, folio, sucursal into v_estado, v_folio, v_suc
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
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'La solicitud ya está ' || v_estado);
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la llave de cifrado, avisa a sistemas');
  end if;

  -- gen_random_bytes y no random(): random() es predecible, y un código
  -- adivinable dejaría al almacenista cerrar entregas sin el empleado enfrente,
  -- que es justo lo que este código existe para impedir. El sesgo del módulo
  -- sobre 3 bytes (16.7M -> 1M) es despreciable aquí.
  v_bytes := gen_random_bytes(3);
  v_codigo := lpad(
    ((( get_byte(v_bytes,0)::int << 16)
      | (get_byte(v_bytes,1)::int << 8)
      |  get_byte(v_bytes,2)::int) % 1000000)::text, 6, '0');

  update public.rnd_material_solicitudes
     set estado                 = 'autorizada',
         autorizado_por         = trim(p_usuario),
         fecha_autorizacion     = now(),
         codigo_hash            = crypt(v_codigo, gen_salt('bf')),
         codigo_cifrado         = armor(pgp_sym_encrypt(v_codigo, v_key)),
         codigo_intentos        = 0,
         codigo_bloqueado_hasta = null,
         codigo_usado_en        = null
   where id = p_id;

  -- El código NO se devuelve: quien autoriza es el gerente, y el código es del
  -- empleado. Se revela solo por material_codigo, contra su propia sesión.
  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', v_folio);
end;
$$;

revoke execute on function public.material_autorizar(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.material_autorizar(uuid, text, text) to service_role;

-- Revelar el código a su dueño. Todos los rechazos contestan lo mismo: si el
-- mensaje cambiara según el motivo, serviría para averiguar qué solicitudes
-- existen y de quién son.
create or replace function public.material_codigo(p_id uuid, p_empleado_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_estado text; v_dueno int; v_cif text; v_key text;
begin
  select estado, empleado_id, codigo_cifrado
    into v_estado, v_dueno, v_cif
    from public.rnd_material_solicitudes
   where id = p_id;

  if v_estado is null
     or v_dueno is distinct from p_empleado_id
     or v_estado <> 'autorizada'
     or v_cif is null then
    return jsonb_build_object('ok', false, 'error', 'No disponible');
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'No disponible');
  end if;

  return jsonb_build_object('ok', true, 'codigo', pgp_sym_decrypt(dearmor(v_cif), v_key));
end;
$$;

revoke execute on function public.material_codigo(uuid, int) from public, anon, authenticated;
grant  execute on function public.material_codigo(uuid, int) to service_role;
```

- [ ] **Step 3: Aplicar y verificar con datos reales**

Aplicar con `apply_migration` (nombre `codigo_entrega`). Después, en sentencias
**separadas** (dentro de una sola sentencia las CTE ven el mismo snapshot y no
ven lo que insertó la función):

```sql
select public.material_crear(1013, 'prueba codigo', '[{"cod_prod":"TRU47364","descripcion":"CAJA","unidad":"CJ","cantidad":1,"costo_unitario":387.74,"existencia_al_pedir":5}]'::jsonb);
```
```sql
select public.material_autorizar('<id-devuelto>', 'Gerente Prueba', 'LMM');
```
```sql
select public.material_codigo('<id-devuelto>', 1013) as mio,
       public.material_codigo('<id-devuelto>', 1006) as de_otro;
```
Esperado: `mio` trae `{"ok":true,"codigo":"NNNNNN"}` con 6 dígitos; `de_otro`
trae `{"ok":false,"error":"No disponible"}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0028_codigo_entrega.sql
git commit -m "feat(uso-interno): codigo de 6 digitos al autorizar, revelable solo a su dueno"
```

---

## Task 2: `material_entregar` exige código y foto

**Files:**
- Create: `supabase/migrations/0029_material_entregar_evidencia.sql`

- [ ] **Step 1: Comprobar que hoy se puede entregar sin nada**

```sql
select pg_get_function_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='material_entregar';
```
Esperado: `p_id uuid, p_usuario text, p_entregas jsonb, p_sucursal text` (sin código ni evidencia).

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/0029_material_entregar_evidencia.sql`. Se hace
DROP + CREATE (no `create or replace`) porque agregar parámetros crea una función
nueva y la vieja seguiría existiendo como sobrecarga: PostgREST llamaría con
gusto la versión sin evidencia. DROP borra los permisos, así que se reponen.

```sql
drop function if exists public.material_entregar(uuid, text, jsonb, text);

create function public.material_entregar(
  p_id uuid, p_usuario text, p_entregas jsonb, p_sucursal text,
  p_codigo text, p_evidencia_path text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_estado text; v_folio text; v_suc text; v_n int; v_recibidas int;
  v_hash text; v_intentos int; v_bloq timestamptz;
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
  -- Bloqueo vencido: los intentos vuelven a cero. Sin esto el sexto intento
  -- volvería a bloquear de inmediato y la solicitud quedaría tostada.
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
    -- El incremento se escribe y DESPUÉS se devuelve el error. Persiste, porque
    -- la función corre en la transacción de quien llama y un `return` normal no
    -- revierte (la misma propiedad que en 0022 era una trampa; aquí se
    -- aprovecha). Si esto se cambiara a `raise`, el contador dejaría de contar.
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

  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where (e->>'cantidad_entregada')::numeric > l.cantidad
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes entregar más de lo que se pidió');
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

  update public.rnd_material_lineas
     set cantidad_entregada = 0
   where solicitud_id = p_id
     and cantidad_entregada is null;

  update public.rnd_material_solicitudes
     set estado          = 'entregada',
         entregado_por   = trim(p_usuario),
         fecha_entrega   = now(),
         codigo_usado_en = now(),
         evidencia_path  = trim(p_evidencia_path)
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'entregada', 'folio', v_folio,
                            'lineas', v_n, 'recibidas', v_recibidas);
end;
$$;

revoke execute on function public.material_entregar(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant  execute on function public.material_entregar(uuid, text, jsonb, text, text, text) to service_role;
```

- [ ] **Step 3: Aplicar y probar los tres caminos**

Aplicar con `apply_migration` (nombre `material_entregar_evidencia`). Con la
solicitud autorizada de la Task 1 y su código real, en sentencias separadas:

```sql
-- 1) sin foto -> "Falta la foto de la entrega"
select public.material_entregar('<id>', 'Almacen', '[]'::jsonb, 'LMM', '000000', '');
```
```sql
-- 2) código equivocado -> "Quedan 4 intentos."
select public.material_entregar('<id>', 'Almacen', '[]'::jsonb, 'LMM', '000000', 'entregas/x.jpg');
```
```sql
-- 3) el contador quedó escrito pese al error
select codigo_intentos from public.rnd_material_solicitudes where id = '<id>';
```
Esperado: `1`.

- [ ] **Step 4: Verificar que no quedó la sobrecarga vieja**

```sql
select pg_get_function_arguments(p.oid) as args,
       coalesce(array_to_string(p.proacl::text[],' | '),'(default PUBLIC <- MAL)') as permisos
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='material_entregar';
```
Esperado: **una sola fila**, con 6 argumentos y permisos `postgres | service_role`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0029_material_entregar_evidencia.sql
git commit -m "feat(uso-interno): entregar exige codigo verificado y foto"
```

---

## Task 3: Bucket privado

**Files:**
- Create: `supabase/migrations/0030_bucket_uso_interno.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Bucket PRIVADO para la evidencia de entrega. No se reusa `rnd-documentos`
-- (el de la evidencia de reembolsos) porque está marcado como público:
-- cualquiera con la URL ve el archivo sin sesión.
--
-- A propósito NO se crean políticas: sin políticas, sólo `service_role` puede
-- leer o escribir, y toda la subida y la lectura pasan por nuestros route
-- handlers, que verifican rol y sucursal antes de tocar nada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rnd-uso-interno', 'rnd-uso-interno', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar y verificar que está cerrado**

```sql
select id, public, file_size_limit,
       (select count(*) from pg_policies
         where schemaname='storage' and tablename='objects'
           and qual like '%rnd-uso-interno%') as politicas
from storage.buckets where id='rnd-uso-interno';
```
Esperado: `public=false`, `politicas=0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0030_bucket_uso_interno.sql
git commit -m "feat(uso-interno): bucket privado para la evidencia de entrega"
```

---

## Task 4: Helpers puros del código (con tests)

**Files:**
- Create: `src/lib/materiales/codigo.ts`
- Test: `src/lib/materiales/codigo.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/materiales/codigo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { soloDigitos, esCodigoCompleto, LARGO_CODIGO } from "./codigo";

describe("soloDigitos", () => {
  it("quita todo lo que no sea número", () => {
    expect(soloDigitos("47-29 15")).toBe("472915");
    expect(soloDigitos("abc")).toBe("");
  });

  it("no deja pasar más de 6", () => {
    expect(soloDigitos("1234567890")).toBe("123456");
  });

  it("aguanta que le peguen el código completo de un jalón", () => {
    // El almacenista puede pegar desde WhatsApp, no solo teclear dígito a dígito.
    expect(soloDigitos("Tu código: 472915")).toBe("472915");
  });
});

describe("esCodigoCompleto", () => {
  it("solo con los 6 dígitos", () => {
    expect(esCodigoCompleto("472915")).toBe(true);
    expect(esCodigoCompleto("47291")).toBe(false);
    expect(esCodigoCompleto("")).toBe(false);
  });

  it("un código que empieza en cero sigue siendo válido", () => {
    // lpad genera códigos como 004729; tratarlos como número los rompería.
    expect(esCodigoCompleto("004729")).toBe(true);
  });

  it("LARGO_CODIGO es la única fuente del 6", () => {
    expect(LARGO_CODIGO).toBe(6);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/materiales/codigo.test.ts`
Expected: FAIL — `Failed to resolve import "./codigo"`.

- [ ] **Step 3: Escribir el módulo**

Crear `src/lib/materiales/codigo.ts`:

```ts
// El código de entrega es una CADENA de 6 dígitos, nunca un número: se genera
// con lpad y puede empezar en cero (004729). Tratarlo como número lo rompe.

export const LARGO_CODIGO = 6;

/** Deja solo dígitos y corta al largo del código. Tolera pegar texto completo. */
export function soloDigitos(entrada: string): string {
  return entrada.replace(/\D/g, "").slice(0, LARGO_CODIGO);
}

export function esCodigoCompleto(codigo: string): boolean {
  return new RegExp(`^\\d{${LARGO_CODIGO}}$`).test(codigo);
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/lib/materiales/codigo.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/materiales/codigo.ts src/lib/materiales/codigo.test.ts
git commit -m "feat(uso-interno): helpers del codigo de entrega"
```

---

## Task 5: Subida y lectura de la foto (server-only)

**Files:**
- Create: `src/lib/materiales/storage.ts`
- Create: `src/app/api/materiales/evidencia/route.ts`

- [ ] **Step 1: Escribir el módulo de storage**

Crear `src/lib/materiales/storage.ts`:

```ts
// Server-only: toca el bucket privado con service_role. El navegador nunca
// habla con storage — manda el archivo a nuestro route handler, que verifica
// rol y sucursal antes de subir. Así el bucket se queda sin políticas y cerrado.

const BUCKET = "rnd-uso-interno";

function credenciales(): { url: string; servicio: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && servicio ? { url, servicio } : null;
}

/** Sube la foto y devuelve su ruta dentro del bucket. Lanza si no se pudo. */
export async function subirEvidencia(
  solicitudId: string,
  archivo: Blob,
  nombre: string,
): Promise<string> {
  const c = credenciales();
  if (!c) throw new Error("Falta configuración del servidor");

  // El nombre lo manda el cliente: se sanea para que no pueda salirse de su
  // carpeta ni meter caracteres raros en la ruta.
  const limpio = nombre.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "foto.jpg";
  const ruta = `entregas/${solicitudId}/${Date.now()}_${limpio}`;

  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: {
      apikey: c.servicio,
      Authorization: `Bearer ${c.servicio}`,
      "Content-Type": archivo.type || "image/jpeg",
    },
    body: archivo,
  });
  if (!res.ok) {
    throw new Error(`storage ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return ruta;
}

/** URL temporal para ver la foto. Caduca; no se guarda en ningún lado. */
export async function urlFirmada(ruta: string, segundos = 300): Promise<string | null> {
  const c = credenciales();
  if (!c) return null;
  const res = await fetch(`${c.url}/storage/v1/object/sign/${BUCKET}/${ruta}`, {
    method: "POST",
    headers: {
      apikey: c.servicio,
      Authorization: `Bearer ${c.servicio}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: segundos }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string };
  return data.signedURL ? `${c.url}/storage/v1${data.signedURL}` : null;
}
```

- [ ] **Step 2: Escribir el route handler**

Crear `src/app/api/materiales/evidencia/route.ts`:

```ts
import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { subirEvidencia, urlFirmada } from "@/lib/materiales/storage";
import { leerTablaMaterial } from "@/lib/materiales/rpc";

// POST: almacén sube la foto de una entrega. GET: gerente o almacén la ven,
// con una URL que caduca. En los dos casos se comprueba que la solicitud sea
// de SU sucursal: si se aceptara una ruta del bucket a secas, cualquiera con
// sesión podría ver la evidencia de otra sucursal cambiando la cadena.

async function sucursalDeLaSolicitud(id: string): Promise<{ sucursal: string; path: string | null } | null> {
  const filas = (await leerTablaMaterial(
    `rnd_material_solicitudes?id=eq.${id}&select=sucursal,evidencia_path`,
  )) as Array<{ sucursal?: string; evidencia_path?: string | null }>;
  const f = filas?.[0];
  return f?.sucursal ? { sucursal: f.sucursal, path: f.evidencia_path ?? null } : null;
}

function puedeVer(actorSucursal: string, sucursalSolicitud: string): boolean {
  return actorSucursal === "*" || actorSucursal.toUpperCase() === sucursalSolicitud.toUpperCase();
}

export async function POST(req: Request) {
  const quien = await actorDeMaterial("materiales-almacen");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const form = await req.formData().catch(() => null);
  const id = String(form?.get("solicitudId") ?? "");
  const archivo = form?.get("foto");
  if (!id || !(archivo instanceof Blob) || archivo.size === 0) {
    return NextResponse.json({ ok: false, error: "Falta la foto" }, { status: 400 });
  }

  const sol = await sucursalDeLaSolicitud(id);
  if (!sol || !puedeVer(quien.actor.sucursal, sol.sucursal)) {
    return NextResponse.json({ ok: false, error: "Esa solicitud no es de tu sucursal" }, { status: 403 });
  }

  try {
    const nombre = archivo instanceof File ? archivo.name : "foto.jpg";
    return NextResponse.json({ ok: true, path: await subirEvidencia(id, archivo, nombre) });
  } catch (e) {
    console.error("[material] no se pudo subir la evidencia:", e);
    return NextResponse.json({ ok: false, error: "No se pudo subir la foto" }, { status: 503 });
  }
}

export async function GET(req: Request) {
  // El gerente también necesita verla, no solo quien entregó.
  const almacen = await actorDeMaterial("materiales-almacen");
  const quien = almacen.ok ? almacen : await actorDeMaterial("materiales-gerente");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });

  const sol = await sucursalDeLaSolicitud(id);
  if (!sol || !puedeVer(quien.actor.sucursal, sol.sucursal)) {
    return NextResponse.json({ ok: false, error: "Esa solicitud no es de tu sucursal" }, { status: 403 });
  }
  if (!sol.path) return NextResponse.json({ ok: false, error: "Esa entrega no tiene foto" }, { status: 404 });

  const url = await urlFirmada(sol.path);
  if (!url) return NextResponse.json({ ok: false, error: "No se pudo abrir la foto" }, { status: 503 });

  // Con ?redirigir=1 se puede colgar de un <a> y abre la foto directo. Sin el
  // parámetro devuelve JSON, por si alguna pantalla la quiere embebida.
  if (new URL(req.url).searchParams.get("redirigir") === "1") {
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ ok: true, url });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/materiales/storage.ts src/app/api/materiales/evidencia/route.ts
git commit -m "feat(uso-interno): subir y ver la foto de entrega por el servidor"
```

---

## Task 6: El empleado ve su código

**Files:**
- Create: `src/app/api/empleado/materiales/codigo/route.ts`
- Modify: `src/app/empleado/materiales/page.tsx`

- [ ] **Step 1: Escribir el route handler**

Crear `src/app/api/empleado/materiales/codigo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";

// El empleado_id sale de su cookie firmada, nunca del cliente: si viniera del
// body, cualquiera pediría el código de la solicitud de otro.

export async function GET(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });

  const r = await llamarRpcMaterial("material_codigo", {
    p_id: id,
    p_empleado_id: sesion.empleadoId,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
```

- [ ] **Step 2: Agregar el botón en la PWA**

En `src/app/empleado/materiales/page.tsx`, agregar estado y función dentro del
componente (junto a `cancelar`):

```tsx
  const [codigos, setCodigos] = useState<Record<string, string>>({});

  async function verCodigo(id: string) {
    const res = await fetch(`/api/empleado/materiales/codigo?id=${id}`);
    const data = await res.json();
    if (data.ok) setCodigos((p) => ({ ...p, [id]: String(data.codigo) }));
    else mostrar("No se pudo mostrar tu código, vuelve a entrar a la app");
  }
```

Y en el renglón de cada solicitud, después del `<span className={...mat-estado...}>`:

```tsx
              {s.estado === "autorizada" && (
                codigos[s.id] ? (
                  <span className="mat-codigo">{codigos[s.id]}</span>
                ) : (
                  <button type="button" className="carnet-btn-2 mat-codigo-btn" onClick={() => verCodigo(s.id)}>
                    Ver mi código para recoger
                  </button>
                )
              )}
```

Agregar al final de `src/app/empleado/carnet.css`:

```css
/* El código de entrega: grande y espaciado, porque se dicta en voz alta
   en el mostrador y hay que leerlo de un vistazo. */
.mat-codigo {
  font-family: var(--font-work), sans-serif;
  font-size: 30px; font-weight: 800; letter-spacing: 7px;
  color: var(--azul-hondo); margin-top: 6px;
}
.mat-codigo-btn { margin-top: 8px; padding: 9px; font-size: 14px; }
```

- [ ] **Step 3: Typecheck y tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores, toda la suite verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/empleado/materiales/codigo/route.ts src/app/empleado/materiales/page.tsx src/app/empleado/carnet.css
git commit -m "feat(uso-interno): el empleado ve su codigo para recoger"
```

---

## Task 7: Captura de foto y código en la pantalla de almacén

**Files:**
- Create: `src/components/materiales/CapturaEntrega.tsx`
- Test: `src/components/materiales/CapturaEntrega.test.tsx`
- Modify: `src/components/ui/ConfirmDialog.tsx`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/materiales/CapturaEntrega.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CapturaEntrega } from "./CapturaEntrega";

// Este repo no usa `test.globals: true`, así que el auto-limpiado de
// @testing-library/react no se registra solo. Mismo patrón que AvisosCard.
afterEach(cleanup);

describe("CapturaEntrega", () => {
  it("nombra a quien recoge, para que el almacenista sepa a quién pedírselo", () => {
    render(
      <CapturaEntrega codigo="" onCodigo={() => {}} onFoto={() => {}} nombreQuienRecoge="Carlos Ruiz" />,
    );
    expect(screen.getByLabelText(/código.*Carlos Ruiz/i)).toBeInTheDocument();
  });

  it("solo deja escribir dígitos, y máximo 6", () => {
    const onCodigo = vi.fn();
    render(<CapturaEntrega codigo="" onCodigo={onCodigo} onFoto={() => {}} />);
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: "4a7-2915999" } });
    expect(onCodigo).toHaveBeenCalledWith("472915");
  });

  it("avisa cuándo falta la foto", () => {
    render(<CapturaEntrega codigo="472915" onCodigo={() => {}} onFoto={() => {}} />);
    expect(screen.getByText(/falta la foto/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/components/materiales/CapturaEntrega.test.tsx`
Expected: FAIL — no existe `./CapturaEntrega`.

- [ ] **Step 3: Escribir el componente**

Crear `src/components/materiales/CapturaEntrega.tsx`:

```tsx
"use client";
import { useState } from "react";
import { soloDigitos, LARGO_CODIGO } from "@/lib/materiales/codigo";

// El código va DESPUÉS del resumen de cantidades a propósito: pedido antes,
// solo probaría que el empleado se paró ahí; pedido después de enseñarle lo
// que se lleva, es su conformidad con esas cantidades.

export function CapturaEntrega({
  codigo,
  onCodigo,
  onFoto,
  nombreQuienRecoge,
}: {
  codigo: string;
  onCodigo: (c: string) => void;
  onFoto: (f: File | null) => void;
  nombreQuienRecoge?: string;
}) {
  const [nombreArchivo, setNombreArchivo] = useState("");

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Foto de la entrega
        </label>
        <input
          type="file"
          accept="image/*"
          aria-label="Foto de la entrega"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFoto(f);
            setNombreArchivo(f?.name ?? "");
          }}
          className="block w-full text-sm text-slate-600"
        />
        <p className="mt-1 text-xs text-slate-500">
          Lo más útil es el material sobre el mostrador, antes de entregarlo.
        </p>
        {!nombreArchivo && <p className="mt-1 text-xs text-amber-700">Falta la foto</p>}
      </div>

      <div>
        <label htmlFor="codigo-entrega" className="mb-1 block text-sm font-medium text-slate-700">
          Pídele su código {nombreQuienRecoge ? `a ${nombreQuienRecoge}` : "al empleado"}
        </label>
        <input
          id="codigo-entrega"
          // inputMode numérico pero type text: el código es una cadena y puede
          // empezar en cero, y type="number" se los come.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="6 dígitos"
          value={codigo}
          onChange={(e) => onCodigo(soloDigitos(e.target.value))}
          className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-center text-xl font-bold tracking-[0.4em] text-slate-900"
        />
        <p className="mt-1 text-xs text-slate-500">
          Lo trae en su app, en la solicitud autorizada. Van {codigo.length} de {LARGO_CODIGO}.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/components/materiales/CapturaEntrega.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Permitir deshabilitar el botón del diálogo**

En `src/components/ui/ConfirmDialog.tsx`, agregar a `ConfirmDialogProps`:

```ts
  deshabilitarConfirmar?: boolean;      // además de isPending: falta algo por capturar
```

Agregarlo a los parámetros desestructurados (`deshabilitarConfirmar = false,`) y
cambiar el botón de confirmar:

```tsx
            disabled={isPending || deshabilitarConfirmar}
```

- [ ] **Step 6: Typecheck y suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores, todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/materiales/CapturaEntrega.tsx src/components/materiales/CapturaEntrega.test.tsx src/components/ui/ConfirmDialog.tsx
git commit -m "feat(uso-interno): captura de foto y codigo en el dialogo de entrega"
```

---

## Task 8: Conectar la pantalla de almacén

**Files:**
- Modify: `src/app/(app)/materiales-almacen/page.tsx`
- Modify: `src/lib/hooks/useAccionesMaterial.ts`
- Modify: `src/app/api/materiales/entregar/route.ts`

- [ ] **Step 1: Ampliar el tipo de la mutación**

En `src/lib/hooks/useAccionesMaterial.ts`:

```ts
export function useEntregarMaterial() {
  return useAccion<{
    id: string;
    entregas: { lineaId: string; cantidadEntregada: number }[];
    codigo: string;
    evidenciaPath: string;
  }>("/api/materiales/entregar");
}
```

- [ ] **Step 2: Pasar los dos nuevos a la RPC**

En `src/app/api/materiales/entregar/route.ts`, leer los campos y pasarlos:

```ts
  const { id, entregas, codigo, evidenciaPath } = (await req.json().catch(() => ({}))) as {
    id?: unknown; entregas?: unknown; codigo?: unknown; evidenciaPath?: unknown;
  };
```
y en la llamada:
```ts
    p_codigo: typeof codigo === "string" ? codigo : "",
    p_evidencia_path: typeof evidenciaPath === "string" ? evidenciaPath : "",
```

- [ ] **Step 3: Subir la foto y mandar el código**

En `src/app/(app)/materiales-almacen/page.tsx`, agregar estado:

```tsx
  const [foto, setFoto] = useState<File | null>(null);
  const [codigo, setCodigo] = useState("");
  const [subiendo, setSubiendo] = useState(false);
```

Reemplazar `confirmarEntrega` por:

```tsx
  // La foto se sube al confirmar, no al elegirla: si el almacenista cancela,
  // no queda un archivo huérfano en el bucket. Y va ANTES de la RPC, porque
  // una entrega sin evidencia es justo lo que este cambio impide.
  async function confirmarEntrega(s: SolicitudGuardada) {
    if (!foto) { setMsg("⚠ Falta la foto de la entrega"); return; }
    const capturado = capturas[s.id] ?? {};
    const entregas = s.rnd_material_lineas.map((l) => ({
      lineaId: l.id,
      cantidadEntregada: capturado[l.id] ?? l.cantidad,
    }));
    setMsg("");
    setSubiendo(true);
    try {
      const { prepararArchivo } = await import("@/lib/files/comprimir");
      // Se usa el `tipo` que devuelve prepararArchivo, no blob.type: al
      // comprimir a JPEG el tipo correcto lo sabe el helper, y un Blob recién
      // creado puede venir con type vacío.
      const { blob, tipo, nombre } = await prepararArchivo(foto);
      const fd = new FormData();
      fd.append("solicitudId", s.id);
      fd.append("foto", new File([blob], nombre, { type: tipo }));
      const res = await fetch("/api/materiales/evidencia", { method: "POST", body: fd });
      const sub = await res.json();
      if (!sub.ok) { setMsg(`⚠ ${sub.error ?? "No se pudo subir la foto"}`); return; }

      entregar.mutate(
        { id: s.id, entregas, codigo, evidenciaPath: sub.path },
        {
          onSuccess: (r) => {
            setMsg(r.ok ? `✅ ${s.folio} entregada` : `⚠ ${r.error}`);
            if (r.ok) { setConfirmar(null); setFoto(null); setCodigo(""); }
          },
        },
      );
    } finally {
      setSubiendo(false);
    }
  }
```

En el `ConfirmDialog`, agregar la captura al `mensaje` y bloquear el botón:

```tsx
            mensaje={
              <>
                <span>
                  {s.empleado_nombre} · {s.rnd_material_lineas.length} materiales
                  {incompletas > 0 && (<>{" · "}<strong>{incompletas}</strong> se surten incompletos</>)}
                </span>
                <CapturaEntrega
                  codigo={codigo}
                  onCodigo={setCodigo}
                  onFoto={setFoto}
                  nombreQuienRecoge={s.empleado_nombre}
                />
              </>
            }
            isPending={entregar.isPending || subiendo}
            deshabilitarConfirmar={!foto || !esCodigoCompleto(codigo)}
```

Al cancelar el diálogo hay que limpiar lo capturado:
```tsx
            onCancelar={() => { setConfirmar(null); setFoto(null); setCodigo(""); }}
```

Importar arriba: `CapturaEntrega` y `esCodigoCompleto`.

- [ ] **Step 4: Typecheck, tests y lint**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src`
Expected: sin errores nuevos (los 2 de `InstallPrompt.tsx` son previos).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/materiales-almacen/page.tsx" src/lib/hooks/useAccionesMaterial.ts src/app/api/materiales/entregar/route.ts
git commit -m "feat(uso-interno): almacen sube foto y captura el codigo al entregar"
```

---

## Task 9: Mostrar la evidencia y ajustar el aviso

**Files:**
- Modify: `src/lib/materiales/totales.ts`
- Modify: `src/lib/supabase/queries/materiales.ts`
- Modify: `src/components/materiales/SolicitudCard.tsx`
- Modify: `supabase/functions/enviar-push/mensajes.ts`

- [ ] **Step 1: Traer los campos nuevos**

En `src/lib/materiales/totales.ts`, agregar a `SolicitudGuardada`:

```ts
  evidencia_path: string | null;
  codigo_usado_en: string | null;
```

En `src/lib/supabase/queries/materiales.ts`, agregar a `CAMPOS`:

```ts
  "id,folio,empleado_nombre,sucursal,nota,estado,creado_en," +
  "autorizado_por,fecha_autorizacion,motivo_rechazo,entregado_por,fecha_entrega," +
  "evidencia_path,codigo_usado_en," +
```

- [ ] **Step 2: Enseñar la evidencia en la tarjeta**

En `src/components/materiales/SolicitudCard.tsx`, dentro del bloque `{abierto && ...}`,
antes de `{detalle}`:

```tsx
          {s.evidencia_path && (
            <p className="mb-2 text-xs text-slate-500">
              Código verificado{" "}
              {s.codigo_usado_en ? new Date(s.codigo_usado_en).toLocaleString("es-MX") : ""} ·{" "}
              <a
                href={`/api/materiales/evidencia?id=${s.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 underline"
              >
                Ver foto de la entrega
              </a>
            </p>
          )}
```

El enlace usa `?redirigir=1`, la rama que ya quedó en el handler de la Task 5:
el servidor firma la URL en ese momento y redirige. Así la URL firmada nunca se
guarda ni queda en el HTML, y caduca a los 5 minutos.

```tsx
                href={`/api/materiales/evidencia?id=${s.id}&redirigir=1`}
```

- [ ] **Step 3: Ajustar el texto del aviso**

En `supabase/functions/enviar-push/mensajes.ts`:

```ts
    case "material_autorizada":
      return { title: "Vales AC", body: "Tu gerente autorizó tu uso interno. Ya tienes tu código para recoger en almacén.", url: "/empleado/materiales", tag };
```

Desplegar `enviar-push` (quedará v8) con los dos archivos (`index.ts` sin
cambios y `mensajes.ts` actualizado).

- [ ] **Step 4: Typecheck y suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/materiales/totales.ts src/lib/supabase/queries/materiales.ts src/components/materiales/SolicitudCard.tsx supabase/functions/enviar-push/mensajes.ts
git commit -m "feat(uso-interno): ver la evidencia de entrega y avisar del codigo"
```

---

## Task 10: Verificación end-to-end contra el servidor real

**Files:** ninguno (verificación)

- [ ] **Step 1: Levantar el servidor y armar sesiones**

Con el servidor de desarrollo corriendo, emitir cookies firmadas con los scripts
del scratchpad (`firmar.mjs` para el escritorio, `firmar-emp.mjs` para el
empleado) y crear una solicitud real de un empleado de LMM.

- [ ] **Step 2: Recorrer el circuito**

1. Empleado pide → `ok`
2. `GET /api/empleado/materiales/codigo?id=...` **antes** de autorizar → `404`
3. Gerente autoriza → `ok`
4. `GET /api/empleado/materiales/codigo?id=...` → `{ok:true, codigo:"NNNNNN"}`
5. La misma consulta con la cookie de **otro** empleado → `404 No disponible`
6. `POST /api/materiales/entregar` sin foto → `Falta la foto de la entrega`
7. Subir foto por `POST /api/materiales/evidencia` → devuelve `path`
8. Entregar con código equivocado → `Quedan 4 intentos.`
9. Entregar con el código bueno → `ok`
10. `GET /api/materiales/evidencia?id=...` con sesión de gerente de **otra**
    sucursal → `403`

- [ ] **Step 3: Comprobar lo que quedó escrito**

```sql
select folio, estado, entregado_por, codigo_usado_en, evidencia_path, codigo_intentos
from public.rnd_material_solicitudes where id = '<id>';
```
Esperado: `entregada`, con `codigo_usado_en` y `evidencia_path` llenos.

- [ ] **Step 4: Borrar los datos de prueba**

```sql
delete from public.rnd_material_solicitudes where id = '<id>';
```
Y borrar del bucket el objeto subido en la prueba.

---

## Notas para quien ejecute

- **El servidor de censos-web corre bajo PM2 y es producción.** Este plan no lo
  toca. Si algo parece requerirlo, es que se entendió mal el plan.
- **Una sentencia SQL por paso** al probar RPCs desde `execute_sql`: dentro de
  una sola sentencia todas las CTE ven el mismo snapshot y no ven lo que acaba
  de insertar la función.
- **No pushear** hasta que el usuario lo pida.
