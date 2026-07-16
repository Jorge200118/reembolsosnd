# App de Empleados — Plan C: PWA "Carnet cálido"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans. Pasos con checkbox (`- [ ]`).

**Goal:** Que un chofer abra el link, pueda **instalar la app** (agregar a inicio), registrarse/iniciar sesión, y ver sus comidas por cobrar con su **código** (mostrar/actualizar), todo con el look "Carnet cálido". Sin un solo `alert()`.

**Architecture:** Rutas reales bajo `src/app/empleado/*` (segmento `/empleado`, protegido por el middleware del Plan B) con su propio layout (fuera del shell de personal). Un edge `empleado-panel` (service_role) + RPC `empleado_panel` leen las comidas pendientes y **muestran o generan** el código (cifrado, mismo esquema de hash que la cajera valida). Route handler `/api/empleado/panel` verifica `emp_sesion` y pasa el `empleado_id` de la sesión (nunca del cliente). PWA vía manifest + service worker; instalación con `beforeinstallprompt` (Android) o instrucciones (iOS).

**Tech Stack:** Next.js 16 (app router, route handlers), React 19, Tailwind 4, next/font (Fraunces + Work Sans), Supabase (edge + RPC pgcrypto), TypeScript, vitest.

**Reglas de UX (obligatorias):**
- **PROHIBIDO `alert()` / `confirm()` / `prompt()`.** Errores → mensaje inline. Confirmaciones → `src/components/ui/ConfirmDialog.tsx`. Avisos efímeros → componente `Toast` (se crea aquí).
- **Instalar al entrar:** banner/botón "Instalar app" visible en el layout del empleado.

**Contexto:** [spec](../specs/2026-07-16-app-empleados-vales-comida-design.md) §3,§6,§7; Planes [A](2026-07-16-app-empleados-cimientos.md) y [B](2026-07-16-app-empleados-auth.md) (hechos). Look de referencia: mockup "Carnet cálido" (papel crema, Fraunces + Work Sans, terracota/olivo). Layout raíz `src/app/layout.tsx` (Geist + AuthProvider de personal; los pages de `/empleado` NO usan el shell de `(app)`).

**Precondición:** `EMP_SESION_SECRET` en el entorno (Plan B).

---

## Estructura de archivos

- Crear: `supabase/migrations/0011_empleado_panel.sql` — RPC `empleado_panel`.
- Crear: `supabase/functions/empleado-panel/index.ts` — edge (service_role) que llama la RPC.
- Crear: `src/app/api/empleado/panel/route.ts` — verifica sesión, pasa `empleado_id`, llama al edge.
- Crear: `src/lib/empleado/tema.ts` — tokens/fuentes "Carnet cálido".
- Crear: `src/app/empleado/layout.tsx` — layout del empleado (tema + InstallPrompt).
- Crear: `src/components/empleado/Toast.tsx`, `InstallPrompt.tsx`.
- Crear: `src/app/empleado/login/page.tsx`, `registro/page.tsx`, `page.tsx` (home).
- Crear: `src/app/manifest.ts` (o `public/empleado.webmanifest`) + `public/sw-empleado.js` + iconos.

---

## Task 1: Backend del panel (comidas + mostrar/generar código)

**Files:**
- Create: `supabase/migrations/0011_empleado_panel.sql`
- Create: `supabase/functions/empleado-panel/index.ts`
- Create: `src/app/api/empleado/panel/route.ts`

- [ ] **Step 1: Escribir la RPC** — `supabase/migrations/0011_empleado_panel.sql`:

```sql
-- Panel del empleado: comidas pendientes + código (mostrar existente o generar).
-- Regenera solo si p_regenerar o no hay OTP vigente hoy. Si hay comidas nuevas
-- no cubiertas por el código actual, devuelve hay_nuevas=true (la UI ofrece
-- "actualizar"). Mismo esquema de hash que valida la cajera: sha256(salt||codigo).
create or replace function public.empleado_panel(
  p_empleado_id integer,
  p_regenerar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_semana date := (now() at time zone 'America/Mazatlan')::date;
  v_expira timestamptz := ((v_semana::text || ' 23:59:59')::timestamp) at time zone 'America/Mazatlan';
  v_comidas jsonb; v_total numeric; v_ids uuid[];
  v_codigo text; v_ex record; v_salt text; v_hash text; v_nuevas boolean := false;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'fecha',fecha,'monto',monto) order by fecha),'[]'::jsonb),
         coalesce(sum(monto),0), coalesce(array_agg(id), array[]::uuid[])
    into v_comidas, v_total, v_ids
  from rnd_reembolsos
  where empleado_id=p_empleado_id and concepto='COMIDAS' and estado='comida_pendiente';

  if array_length(v_ids,1) is null then
    return jsonb_build_object('comidas','[]'::jsonb,'total',0,'codigo',null,'expira_en',null,'hay_nuevas',false);
  end if;

  select * into v_ex from rnd_comida_otp where empleado_id=p_empleado_id and semana=v_semana;

  if p_regenerar or v_ex.id is null or v_ex.estado <> 'generado' then
    v_codigo := lpad((abs(('x'||encode(gen_random_bytes(4),'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    v_salt := gen_random_uuid()::text;
    v_hash := encode(digest(v_salt || v_codigo, 'sha256'), 'hex');
    perform public.registrar_otp_comida(p_empleado_id, v_semana, v_codigo, v_hash, v_salt, v_expira, v_ids, null);
  else
    v_codigo := public.revelar_codigo_comida(p_empleado_id, v_semana);
    v_nuevas := not (v_ids <@ v_ex.reembolso_ids and v_ex.reembolso_ids <@ v_ids);
  end if;

  return jsonb_build_object('comidas',v_comidas,'total',v_total,'codigo',v_codigo,
    'expira_en',v_expira,'hay_nuevas',v_nuevas);
end $$;

revoke all on function public.empleado_panel(integer,boolean) from public, anon, authenticated;
```

- [ ] **Step 2: (Controlador) Aplicar** vía `apply_migration` name `0011_empleado_panel`.

- [ ] **Step 3: Rollback-test** (crea empleado + comidas de prueba, revierte):

```sql
do $$
declare v_emp int; v_p1 jsonb; v_p2 jsonb; v_cod text;
begin
  insert into empleados (codigo_empleado,nombre,apellido,telefono_whatsapp,activo)
    values ('TESTC-1','Cee','Test','6870009999',true) returning id into v_emp;
  insert into rnd_reembolsos (nombre_beneficiario,empleado_id,fecha,monto,concepto,estado)
    values ('Cee Test',v_emp,current_date,120,'COMIDAS','comida_pendiente');
  insert into rnd_reembolsos (nombre_beneficiario,empleado_id,fecha,monto,concepto,estado)
    values ('Cee Test',v_emp,current_date-1,150,'COMIDAS','comida_pendiente');

  v_p1 := public.empleado_panel(v_emp, false);           -- genera
  v_cod := v_p1->>'codigo';
  v_p2 := public.empleado_panel(v_emp, false);           -- muestra el mismo

  raise exception 'TOTAL=% CODIGO_LEN=% MISMO=% HAY_NUEVAS=%',
    v_p1->>'total', length(v_cod), (v_cod = v_p2->>'codigo'), v_p2->>'hay_nuevas';
end $$;
```

Expected: `TOTAL=270 CODIGO_LEN=6 MISMO=true HAY_NUEVAS=false`.

- [ ] **Step 4: Edge** `supabase/functions/empleado-panel/index.ts`:

```ts
// EDGE: empleado-panel — llama a la RPC empleado_panel. service_role.
// Body: { empleado_id: number, regenerar?: boolean }. El empleado_id lo pone el
// route handler de Next desde la sesión firmada, NUNCA el cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  try {
    const { empleado_id, regenerar } = await req.json();
    if (typeof empleado_id !== "number") return new Response(JSON.stringify({ error: "empleado_id requerido" }), { status: 400, headers: CORS });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.rpc("empleado_panel", { p_empleado_id: empleado_id, p_regenerar: Boolean(regenerar) });
    if (error) throw error;
    return new Response(JSON.stringify(data), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }), { status: 500, headers: CORS });
  }
});
```
(Controlador despliega con `verify_jwt: true`.)

- [ ] **Step 5: Route handler** `src/app/api/empleado/panel/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  const { regenerar } = await req.json().catch(() => ({}));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/empleado-panel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ empleado_id: sesion.empleadoId, regenerar: Boolean(regenerar) }),
  });
  const data = await res.json();
  return NextResponse.json({ ok: true, ...data });
}
```

- [ ] **Step 6: Commit** `git add supabase/migrations/0011_empleado_panel.sql supabase/functions/empleado-panel src/app/api/empleado/panel && git commit -m "feat(empleado): panel comidas + mostrar/generar codigo"`

---

## Task 2: Sistema visual "Carnet cálido" + layout + Toast + InstallPrompt + PWA

**Files:** `src/lib/empleado/tema.ts`, `src/app/empleado/layout.tsx`, `src/components/empleado/Toast.tsx`, `src/components/empleado/InstallPrompt.tsx`, `src/app/manifest.ts`, `public/sw-empleado.js`, iconos.

- [ ] **Step 1: Fuentes + tokens** — `src/lib/empleado/tema.ts`:

```ts
import { Fraunces, Work_Sans } from "next/font/google";
export const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["400","500","600","700"] });
export const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work", weight: ["300","400","500","600"] });
// Paleta Carnet cálido (usar en estilos inline o clases):
export const TEMA = {
  papel: "#f3ecde", papel2: "#faf6ec", tinta: "#33291d", tintaSuave: "#6b5d49",
  terra: "#c26b4d", olivo: "#6f7a4b", linea: "rgba(51,41,29,.14)",
};
```

- [ ] **Step 2: Toast (reemplaza alert de avisos)** — `src/components/empleado/Toast.tsx`: contexto React con `useToast()` y `mostrar(msg)`, que renderiza un aviso flotante papel/terracota que se desvanece en ~2.5s. (Sin `alert`.)

- [ ] **Step 3: InstallPrompt** — `src/components/empleado/InstallPrompt.tsx` (client): captura `beforeinstallprompt` (Android/desktop) y muestra un botón "Instalar app"; si es iOS (sin el evento) muestra instrucciones "Compartir → Agregar a inicio". Banner en el layout, visible al entrar.

- [ ] **Step 4: Layout del empleado** — `src/app/empleado/layout.tsx`: aplica las variables de fuente + fondo papel, envuelve en `ToastProvider`, monta el `InstallPrompt` y registra el service worker. NO usa el `Sidebar` de personal.

- [ ] **Step 5: Manifest + SW + iconos** — `src/app/manifest.ts` (name "Vales AC", start_url "/empleado", display "standalone", theme papel, iconos 192/512) + `public/sw-empleado.js` (cache mínimo para offline básico) + iconos en `public/icons/`.

- [ ] **Step 6: Commit.**

---

## Task 3: Pantallas Login y Registro (Carnet cálido, sin alert)

**Files:** `src/app/empleado/login/page.tsx`, `src/app/empleado/registro/page.tsx`

- [ ] **Step 1: Login** — client component: campos Teléfono + NIP, botón "Entrar", enlace a `/empleado/registro`. En submit hace `POST /api/empleado/login`; en éxito `router.replace("/empleado")`; en error muestra **mensaje inline** (según `resultado`: `no_encontrado`→"No estás registrado", `nip_incorrecto`→"NIP incorrecto", `bloqueado`→"Demasiados intentos, espera unos minutos"). Estilo del mockup (logo AC, papel, Fraunces). **Sin alert.**

- [ ] **Step 2: Registro** — campos Teléfono + Código de empleado + NIP (y confirmar NIP). `POST /api/empleado/registro`; éxito → `/empleado`; error inline (`datos_incorrectos`→"Teléfono o código no coinciden", `ya_registrado`→"Ya tienes cuenta, inicia sesión", `nip_invalido`→"El NIP debe ser 4 a 6 dígitos"). Enlace "¿Olvidaste tu NIP?" → flujo de reset (`POST /api/empleado/reset`).

- [ ] **Step 3: Commit.**

---

## Task 4: Home + Código

**Files:** `src/app/empleado/page.tsx` (+ componentes)

- [ ] **Step 1: Home** — server o client component que hace `POST /api/empleado/panel`. Muestra: saludo "Hola, {nombre}", tarjeta de comidas pendientes (fecha + monto, total), botón "Ver mi código". Si no hay comidas: estado vacío ("No tienes comidas por cobrar"). Look del mockup.

- [ ] **Step 2: Vista de código** — al tocar "Ver mi código": muestra el código grande (boleto), "Vence hoy", qué cobra ($total, N comidas), botón "Copiar" (usa el **Toast** "Código copiado", no alert), y si `hay_nuevas` un botón "Actualizar código" que hace `POST /api/empleado/panel {regenerar:true}` (confirmando con `ConfirmDialog`, no confirm()).

- [ ] **Step 3: Commit.**

---

## Cierre del Plan C

- [ ] **Suite + typecheck:** `npx vitest run` y `npx tsc --noEmit` → limpio.
- [ ] **Grep anti-alert:** `grep -rn "alert(\|confirm(\|prompt(" src/app/empleado src/components/empleado` → **sin resultados**.
- [ ] **Prueba manual (`npm run dev`):** abrir `/empleado` → redirige a login; registrarse con un empleado real; ver comidas + código; probar "Instalar app".
- [ ] **Verificación real:** invocar el skill `verify` para manejar el flujo end-to-end en el navegador.

**Resultado:** un chofer abre el link, instala la app, se registra/inicia sesión, y ve sus comidas + código. Fin del MVP usable.
```
