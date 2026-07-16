# App de Empleados — Plan B: Autenticación de empleados

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un empleado pueda registrarse (teléfono + código de empleado → fija NIP), iniciar sesión (teléfono + NIP) y cerrar sesión, con una sesión `emp_sesion` **firmada (HMAC)** y el middleware protegiendo las rutas `/empleado`. Sin UI todavía (eso es Plan C); aquí queda el backend de auth + sesión + middleware, verificable por SQL y API.

**Architecture:** El NIP se guarda con **bcrypt** (pgcrypto) en la tabla `rnd_empleado_auth`. Toda la lógica de auth vive en RPCs `SECURITY DEFINER` (service_role) con bloqueo por intentos. Unas edge functions delgadas (Deno) llaman a las RPCs. En el app Next.js, route handlers `/api/empleado/*` llaman a las edge functions y, en éxito, **firman** la cookie `emp_sesion` (HMAC-SHA256 con `EMP_SESION_SECRET`, HttpOnly). El middleware verifica esa firma para `/empleado`. El service_role nunca sale de las edge functions; el secreto de firma vive solo en el app Next.

**Tech Stack:** Supabase Postgres (pgcrypto bcrypt), Deno edge functions, Next.js 16 route handlers + middleware (Edge runtime, Web Crypto), TypeScript, vitest.

**Contexto previo:** [spec](../specs/2026-07-16-app-empleados-vales-comida-design.md) §4.1 y §5; [Plan A](2026-07-16-app-empleados-cimientos.md) (hecho). Patrón de sesión actual del personal: `src/lib/auth/session.ts` (cookie JSON sin firmar), `src/lib/edge/login.ts`, `supabase/functions/login-comida/index.ts`.

**Precondiciones / notas de entorno:**
- **Secreto de firma requerido:** el app Next necesita la variable `EMP_SESION_SECRET` (cadena aleatoria larga) en su entorno (`.env.local` para dev, y el entorno de despliegue para prod). El middleware y los route handlers la leen. Generar una con `openssl rand -hex 32`. **El controlador la define; sin ella la verificación de sesión falla.**
- Migraciones/edge deploys: los aplica el CONTROLADOR (patrón del Plan A), con rollback-tests antes.
- Numeración: la última migración aplicada es `0009`. Esta usa `0010`.

---

## Estructura de archivos

- Crear: `supabase/migrations/0010_empleado_auth.sql` — tabla `rnd_empleado_auth` + RLS + RPCs `empleado_registrar` / `empleado_login` / `empleado_reset_nip`.
- Crear: `supabase/functions/empleado-auth/index.ts` — edge delgada que enruta a las RPCs por `action`.
- Crear: `src/lib/auth/empleadoSesion.ts` — firmar/verificar `emp_sesion` (HMAC, Web Crypto).
- Test: `src/lib/auth/empleadoSesion.test.ts` — pruebas vitest de firma/verificación.
- Crear: `src/lib/edge/empleadoAuth.ts` — cliente TS que llama a la edge `empleado-auth`.
- Crear: `src/app/api/empleado/registro/route.ts`, `.../login/route.ts`, `.../reset/route.ts`, `.../logout/route.ts` — route handlers que firman/limpian la cookie.
- Modificar: `src/middleware.ts` — rama que protege `/empleado`.

---

## Task 1: Tabla `rnd_empleado_auth` + RPCs de auth (migración 0010)

**Files:**
- Create: `supabase/migrations/0010_empleado_auth.sql`

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/0010_empleado_auth.sql`:

```sql
create extension if not exists pgcrypto with schema extensions;

-- Credenciales de empleados (base de la plataforma). NIP con bcrypt (el salt va
-- embebido en el hash). RLS cerrada: solo service_role vía RPCs SECURITY DEFINER.
create table if not exists public.rnd_empleado_auth (
  id                uuid primary key default gen_random_uuid(),
  empleado_id       integer not null unique,
  telefono          text not null unique,          -- normalizado (solo dígitos)
  nip_hash          text not null,                 -- crypt(nip, gen_salt('bf'))
  estado            text not null default 'activo', -- 'activo'
  intentos_fallidos integer not null default 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz not null default now(),
  ultimo_acceso     timestamptz
);
alter table public.rnd_empleado_auth enable row level security;

-- Normaliza teléfono a solo dígitos.
create or replace function public.norm_tel(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p,''), '\D', '', 'g')
$$;

-- REGISTRO: verifica teléfono + código de empleado contra `empleados`, y fija NIP.
create or replace function public.empleado_registrar(
  p_telefono text, p_codigo_empleado text, p_nip text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_emp record; v_ya boolean;
begin
  if p_nip !~ '^\d{4,6}$' then return jsonb_build_object('resultado','nip_invalido'); end if;
  select id, nombre, apellido into v_emp
  from empleados
  where norm_tel(telefono_whatsapp) = norm_tel(p_telefono)
    and codigo_empleado = p_codigo_empleado and activo = true
  limit 1;
  if not found then return jsonb_build_object('resultado','datos_incorrectos'); end if;
  select exists(select 1 from rnd_empleado_auth where empleado_id = v_emp.id and estado='activo') into v_ya;
  if v_ya then return jsonb_build_object('resultado','ya_registrado'); end if;
  insert into rnd_empleado_auth (empleado_id, telefono, nip_hash, estado)
  values (v_emp.id, norm_tel(p_telefono), crypt(p_nip, gen_salt('bf')), 'activo')
  on conflict (empleado_id) do update
    set telefono = excluded.telefono, nip_hash = excluded.nip_hash,
        estado='activo', intentos_fallidos=0, bloqueado_hasta=null;
  return jsonb_build_object('resultado','ok','empleado_id',v_emp.id,
    'nombre', trim(v_emp.nombre || ' ' || v_emp.apellido));
end $$;

-- LOGIN: verifica NIP con bloqueo por 5 intentos (15 min).
create or replace function public.empleado_login(
  p_telefono text, p_nip text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_a record; v_nombre text;
begin
  select * into v_a from rnd_empleado_auth where telefono = norm_tel(p_telefono) for update;
  if not found then return jsonb_build_object('resultado','no_encontrado'); end if;
  if v_a.bloqueado_hasta is not null and v_a.bloqueado_hasta > now() then
    return jsonb_build_object('resultado','bloqueado','hasta',v_a.bloqueado_hasta);
  end if;
  if crypt(p_nip, v_a.nip_hash) = v_a.nip_hash then
    update rnd_empleado_auth set intentos_fallidos=0, bloqueado_hasta=null, ultimo_acceso=now()
      where id = v_a.id;
    select trim(nombre || ' ' || apellido) into v_nombre from empleados where id = v_a.empleado_id;
    return jsonb_build_object('resultado','ok','empleado_id',v_a.empleado_id,'nombre',coalesce(v_nombre,''));
  else
    update rnd_empleado_auth
      set intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
          bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
      where id = v_a.id;
    return jsonb_build_object('resultado','nip_incorrecto');
  end if;
end $$;

-- RESET NIP: mismo chequeo que registro (teléfono + código de empleado), fija NIP nuevo.
create or replace function public.empleado_reset_nip(
  p_telefono text, p_codigo_empleado text, p_nip text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_emp record;
begin
  if p_nip !~ '^\d{4,6}$' then return jsonb_build_object('resultado','nip_invalido'); end if;
  select id into v_emp from empleados
  where norm_tel(telefono_whatsapp) = norm_tel(p_telefono)
    and codigo_empleado = p_codigo_empleado and activo = true limit 1;
  if not found then return jsonb_build_object('resultado','datos_incorrectos'); end if;
  update rnd_empleado_auth
    set nip_hash = crypt(p_nip, gen_salt('bf')), intentos_fallidos=0, bloqueado_hasta=null, estado='activo'
    where empleado_id = v_emp.id;
  if not found then return jsonb_build_object('resultado','no_registrado'); end if;
  return jsonb_build_object('resultado','ok');
end $$;

revoke all on function public.empleado_registrar(text,text,text) from public, anon, authenticated;
revoke all on function public.empleado_login(text,text) from public, anon, authenticated;
revoke all on function public.empleado_reset_nip(text,text,text) from public, anon, authenticated;
```

- [ ] **Step 2: (Controlador) Aplicar la migración** vía MCP `apply_migration` name `0010_empleado_auth`.

- [ ] **Step 3: Rollback-test de las RPCs (SQL, se revierte solo)**

Requiere un empleado real con teléfono + código. Usa uno de prueba insertándolo dentro del bloque:

```sql
do $$
declare v_out jsonb; v_login jsonb; v_bad jsonb; v_emp_id integer;
begin
  insert into empleados (codigo_empleado, nombre, apellido, telefono_whatsapp, activo)
    values ('TESTB-001', 'Test', 'Empleado B', '6870000001', true) returning id into v_emp_id;

  v_out := public.empleado_registrar('687 000 0001', 'TESTB-001', '1234');
  v_login := public.empleado_login('6870000001', '1234');
  v_bad := public.empleado_login('6870000001', '9999');

  raise exception 'REG=% LOGIN=% BADLOGIN=%', v_out->>'resultado', v_login->>'resultado', v_bad->>'resultado';
end $$;
```

Expected: `REG=ok LOGIN=ok BADLOGIN=nip_incorrecto`. (El `raise exception` revierte el empleado de prueba y la fila de auth.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_empleado_auth.sql
git commit -m "feat(empleado-auth): tabla rnd_empleado_auth + RPCs registro/login/reset (bcrypt)"
```

---

## Task 2: Edge function `empleado-auth`

**Files:**
- Create: `supabase/functions/empleado-auth/index.ts`

- [ ] **Step 1: Escribir la edge function**

Crear `supabase/functions/empleado-auth/index.ts`:

```ts
// EDGE FUNCTION: empleado-auth
// Enruta a las RPCs de auth por `action`. service_role. NO firma sesión (eso
// lo hace el route handler de Next).
// Body: { action: "registro"|"login"|"reset", telefono, nip?, codigo_empleado?, nip_nuevo? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  try {
    const b = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let data, error;
    if (b.action === "registro") {
      ({ data, error } = await supabase.rpc("empleado_registrar", { p_telefono: b.telefono, p_codigo_empleado: b.codigo_empleado, p_nip: b.nip }));
    } else if (b.action === "login") {
      ({ data, error } = await supabase.rpc("empleado_login", { p_telefono: b.telefono, p_nip: b.nip }));
    } else if (b.action === "reset") {
      ({ data, error } = await supabase.rpc("empleado_reset_nip", { p_telefono: b.telefono, p_codigo_empleado: b.codigo_empleado, p_nip: b.nip_nuevo }));
    } else {
      return new Response(JSON.stringify({ error: "action invalida" }), { status: 400, headers: CORS });
    }
    if (error) throw error;
    return new Response(JSON.stringify(data), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});
```

- [ ] **Step 2: (Controlador) Desplegar** `empleado-auth` con `verify_jwt: true` (se llama con el anon bearer desde el route handler de Next).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/empleado-auth/index.ts
git commit -m "feat(empleado-auth): edge que enruta a las RPCs de auth"
```

---

## Task 3: Helper de sesión firmada (`emp_sesion`)

**Files:**
- Create: `src/lib/auth/empleadoSesion.ts`
- Test: `src/lib/auth/empleadoSesion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/auth/empleadoSesion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { firmarEmpSesion, verificarEmpSesion } from "./empleadoSesion";

const SECRET = "secreto-de-prueba-super-largo-0123456789";

describe("empleadoSesion", () => {
  it("firma y verifica un payload válido", async () => {
    const token = await firmarEmpSesion({ empleadoId: 42, nombre: "Jorge" }, SECRET);
    const payload = await verificarEmpSesion(token, SECRET);
    expect(payload).toEqual({ empleadoId: 42, nombre: "Jorge" });
  });
  it("rechaza un token manipulado", async () => {
    const token = await firmarEmpSesion({ empleadoId: 42, nombre: "Jorge" }, SECRET);
    const manipulado = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(await verificarEmpSesion(manipulado, SECRET)).toBeNull();
  });
  it("rechaza con secreto distinto", async () => {
    const token = await firmarEmpSesion({ empleadoId: 42, nombre: "Jorge" }, SECRET);
    expect(await verificarEmpSesion(token, "otro-secreto")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver fallar.** Run: `npx vitest run src/lib/auth/empleadoSesion.test.ts` → FAIL (no existe el módulo).

- [ ] **Step 3: Implementar el helper** (Web Crypto, compatible con Edge runtime):

Crear `src/lib/auth/empleadoSesion.ts`:

```ts
// Firma/verifica la cookie de sesión del empleado con HMAC-SHA256.
// Compatible con Edge runtime (middleware) y Node (route handlers).
export interface EmpSesion { empleadoId: number; nombre: string; }

function b64urlEncode(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}
async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

export async function firmarEmpSesion(s: EmpSesion, secret: string): Promise<string> {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(s)));
  const sig = b64urlEncode(await hmac(payload, secret));
  return `${payload}.${sig}`;
}

export async function verificarEmpSesion(token: string, secret: string): Promise<EmpSesion | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const esperado = await hmac(payload, secret);
  if (!timingSafeEqual(b64urlToBytes(sig), esperado)) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (typeof obj?.empleadoId !== "number" || typeof obj?.nombre !== "string") return null;
    return { empleadoId: obj.empleadoId, nombre: obj.nombre };
  } catch { return null; }
}

export const NOMBRE_COOKIE_EMP = "emp_sesion";
```

- [ ] **Step 4: Correr y ver pasar.** Run: `npx vitest run src/lib/auth/empleadoSesion.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/empleadoSesion.ts src/lib/auth/empleadoSesion.test.ts
git commit -m "feat(empleado-auth): sesion emp_sesion firmada con HMAC + test"
```

---

## Task 4: Cliente edge + route handlers que firman la cookie

**Files:**
- Create: `src/lib/edge/empleadoAuth.ts`
- Create: `src/app/api/empleado/login/route.ts`, `.../registro/route.ts`, `.../reset/route.ts`, `.../logout/route.ts`

- [ ] **Step 1: Cliente edge** — Crear `src/lib/edge/empleadoAuth.ts`:

```ts
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type AccionAuth = "registro" | "login" | "reset";

export async function llamarEmpleadoAuth(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/empleado-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  return await res.json();
}
```

- [ ] **Step 2: Route handler de login** — Crear `src/app/api/empleado/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { llamarEmpleadoAuth } from "@/lib/edge/empleadoAuth";
import { firmarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

export async function POST(req: Request) {
  const { telefono, nip } = await req.json();
  if (typeof telefono !== "string" || typeof nip !== "string") {
    return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
  }
  const r = await llamarEmpleadoAuth({ action: "login", telefono, nip });
  if (r.resultado !== "ok") {
    return NextResponse.json({ ok: false, resultado: r.resultado }, { status: 401 });
  }
  const secret = process.env.EMP_SESION_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Config faltante" }, { status: 500 });
  const token = await firmarEmpSesion({ empleadoId: Number(r.empleado_id), nombre: String(r.nombre) }, secret);
  const resp = NextResponse.json({ ok: true, nombre: r.nombre });
  resp.cookies.set(NOMBRE_COOKIE_EMP, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return resp;
}
```

- [ ] **Step 3: Route handler de registro** — Crear `src/app/api/empleado/registro/route.ts` (idéntico al login pero con la acción de registro y sus campos):

```ts
import { NextResponse } from "next/server";
import { llamarEmpleadoAuth } from "@/lib/edge/empleadoAuth";
import { firmarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

export async function POST(req: Request) {
  const { telefono, codigo_empleado, nip } = await req.json();
  if (typeof telefono !== "string" || typeof codigo_empleado !== "string" || typeof nip !== "string") {
    return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
  }
  const r = await llamarEmpleadoAuth({ action: "registro", telefono, codigo_empleado, nip });
  if (r.resultado !== "ok") {
    return NextResponse.json({ ok: false, resultado: r.resultado }, { status: 400 });
  }
  const secret = process.env.EMP_SESION_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Config faltante" }, { status: 500 });
  const token = await firmarEmpSesion({ empleadoId: Number(r.empleado_id), nombre: String(r.nombre) }, secret);
  const resp = NextResponse.json({ ok: true, nombre: r.nombre });
  resp.cookies.set(NOMBRE_COOKIE_EMP, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return resp;
}
```

- [ ] **Step 4: Route handler de reset** — Crear `src/app/api/empleado/reset/route.ts` (no inicia sesión; solo cambia el NIP):

```ts
import { NextResponse } from "next/server";
import { llamarEmpleadoAuth } from "@/lib/edge/empleadoAuth";

export async function POST(req: Request) {
  const { telefono, codigo_empleado, nip_nuevo } = await req.json();
  if (typeof telefono !== "string" || typeof codigo_empleado !== "string" || typeof nip_nuevo !== "string") {
    return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
  }
  const r = await llamarEmpleadoAuth({ action: "reset", telefono, codigo_empleado, nip_nuevo });
  if (r.resultado !== "ok") {
    return NextResponse.json({ ok: false, resultado: r.resultado }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Route handler de logout** — Crear `src/app/api/empleado/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

export async function POST() {
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(NOMBRE_COOKIE_EMP, "", { httpOnly: true, path: "/", maxAge: 0 });
  return resp;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/edge/empleadoAuth.ts src/app/api/empleado
git commit -m "feat(empleado-auth): route handlers que firman/limpian emp_sesion"
```

---

## Task 5: Rama del middleware para `/empleado`

**Files:**
- Modify: `src/middleware.ts`

Hoy [src/middleware.ts](../../src/middleware.ts) protege rutas de personal por rol usando la cookie `rnd_sesion`. Agregamos una rama al inicio: las rutas `/empleado` se rigen por `emp_sesion` (firmada), independientes del mundo de personal. Las rutas públicas del empleado (`/empleado/login`, `/empleado/registro`) y la API (`/api/empleado/*`) no se custodian.

- [ ] **Step 1: Añadir la rama de empleado al middleware**

Al inicio de `export function middleware(req)` (antes de la lógica de personal), insertar. Nota: el middleware pasa a ser `async` porque la verificación HMAC es asíncrona.

```ts
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
// ... (imports existentes) ...

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // --- Mundo EMPLEADO: rutas /empleado con sesión emp_sesion firmada ---
  if (path.startsWith("/empleado")) {
    const esPublica = path.startsWith("/empleado/login") || path.startsWith("/empleado/registro");
    const token = req.cookies.get(NOMBRE_COOKIE_EMP)?.value;
    const secret = process.env.EMP_SESION_SECRET ?? "";
    const sesion = token && secret ? await verificarEmpSesion(token, secret) : null;
    if (!sesion && !esPublica) {
      const url = req.nextUrl.clone();
      url.pathname = "/empleado/login";
      return NextResponse.redirect(url);
    }
    if (sesion && esPublica) {
      const url = req.nextUrl.clone();
      url.pathname = "/empleado";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // --- Mundo PERSONAL (lógica existente, sin cambios) ---
  const rol = leerRol(req);
  // ... resto igual ...
}
```

El `matcher` existente ya cubre `/empleado` (excluye `api`, estáticos). Dejar `config.matcher` como está — las rutas `/api/empleado/*` quedan fuera del middleware por el patrón `(?!api|...)`, que es lo deseado.

- [ ] **Step 2: Verificar typecheck y build del middleware**

Run: `npx tsc --noEmit -p tsconfig.json` (o `npx next build` si el typecheck aislado no cubre el Edge runtime).
Expected: sin errores de tipos. El middleware ahora es `async` y usa `verificarEmpSesion`.

- [ ] **Step 3: Prueba de la lógica (vitest, sin levantar Next)**

Crear `src/middleware.empleado.test.ts` que verifica el contrato de verificación (la función pura), no el redirect de Next:

```ts
import { describe, it, expect } from "vitest";
import { firmarEmpSesion, verificarEmpSesion } from "@/lib/auth/empleadoSesion";

describe("middleware empleado (contrato de sesión)", () => {
  it("una cookie firmada válida resuelve a la sesión", async () => {
    const secret = "s3cr3t-middleware-test";
    const token = await firmarEmpSesion({ empleadoId: 7, nombre: "Ana" }, secret);
    expect(await verificarEmpSesion(token, secret)).toEqual({ empleadoId: 7, nombre: "Ana" });
  });
  it("sin token no hay sesión", async () => {
    expect(await verificarEmpSesion("", "x")).toBeNull();
  });
});
```

Run: `npx vitest run src/middleware.empleado.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts src/middleware.empleado.test.ts
git commit -m "feat(empleado-auth): middleware protege /empleado con emp_sesion firmada"
```

---

## Cierre del Plan B

- [ ] **Definir `EMP_SESION_SECRET`** en `.env.local` (dev) y en el entorno de despliegue (prod). Generar: `openssl rand -hex 32`. Sin ella, la sesión del empleado no verifica.
- [ ] **Suite completa:** `npx vitest run` → PASS (incluye empleadoSesion + middleware.empleado).
- [ ] **Prueba end-to-end (API):** con el server corriendo (`npm run dev`), `POST /api/empleado/registro` con un empleado real (teléfono + código) y NIP → debe devolver `ok:true` y set-cookie `emp_sesion`; luego `POST /api/empleado/login` con teléfono + NIP → `ok:true`.

**Resultado esperable:** un empleado puede registrarse, iniciar y cerrar sesión con sesión firmada, y el middleware bloquea `/empleado` sin sesión. Falta solo la UI (Plan C).

**Siguiente:** Plan C — PWA del empleado (route group `(empleado)`, pantallas "Carnet cálido", ver/actualizar código llamando a `revelar_codigo_comida`, manifiesto + service worker).
