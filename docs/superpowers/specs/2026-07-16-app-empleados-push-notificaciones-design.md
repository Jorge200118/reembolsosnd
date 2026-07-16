# SPEC — Módulo de Notificaciones Push (PWA Vales AC)

**Estado:** Propuesta — pendiente de revisión del usuario · **Opción A (enviador central, sin cola)** · **Cero `alert`**
**Proyecto Supabase:** `uqncsqstpcynjxnjhrqu` · **Zona horaria de negocio:** América/Mazatlán (UTC-7, sin DST efectivo para los crones)
**Fecha:** 2026-07-16

---

## 1. Objetivo

Dar a los choferes avisos push web (Web Push / VAPID) en la PWA `/empleado` para tres momentos clave del flujo de vales de comida: cuando su código diario está listo, cuando se les acumula una comida nueva, y como recordatorio si no han cobrado. Todo con opt-in explícito, compatible con iOS instalado y Android, reusando los patrones existentes del repo y sin infraestructura de cola.

---

## 2. Arquitectura (Opción A, sin cola)

Una sola Edge Function **`enviar-push`** es el motor central: recibe `{ tipo, empleado_id? }`, resuelve destinatarios contra `rnd_push_suscripciones` (más `rnd_comida_otp` / `rnd_reembolsos` según el tipo), firma VAPID, cifra el payload `aes128gcm` y hace POST a cada endpoint push, todo concurrente con `Promise.allSettled` y sin reintentos. Las suscripciones que respondan **404/410** se borran en el acto. Los disparadores son tres:

- **`codigo_listo`** — **encadenado al final de `generar-otp-comidas`** (edge→edge, fire-and-forget), justo después de que esa función terminó de escribir todos los OTP del día. No es un cron por reloj: así se elimina la carrera de tiempo con la generación.
- **`comida_nueva`** — enganche edge→edge dentro de `crear-comida` tras el insert, inmediato.
- **`recordatorio`** — cron `pg_cron`+`pg_net` a las 15:00 Mazatlán (22:00 UTC).

**Seguridad de invocación (clave):** `enviar-push` y `empleado-push` **solo** aceptan llamadas cuyo `Authorization` sea el `service_role` (los únicos que lo tienen son los crons —vía Vault—, `generar-otp-comidas`, `crear-comida`, y el route handler de Next —vía env server-only—). No quedan expuestas a la anon key pública. El opt-in vive en la home `/empleado` como una tarjeta "Activar avisos" que solo aparece donde el push es soportado (en iPhone solo instalada). **No hay tabla de cola ni reintentos**; si un push falla por causa distinta a 404/410 solo se loguea (ver §16 Fuera de alcance).

---

## 3. Componentes

Cada componente tiene responsabilidad única, interfaz y dependencias.

### 3.1 Tabla `rnd_push_suscripciones` + RPCs
- **Responsabilidad:** almacenar una fila por suscripción de navegador (endpoint único) ligada a un `empleado_id`.
- **Interfaz:** RPCs `public.push_suscribir(...)` (upsert), `public.push_desuscribir(...)` (delete), `public.destinatarios_push(...)` (lectura por tipo), `public.push_borrar_endpoint(...)` (limpieza de muertas), `public.leer_vapid_keys()` (Vault).
- **Dependencias:** ninguna externa. RLS cerrada; solo service_role/RPC `security definer` entran.

### 3.2 Route handler `POST /api/empleado/suscribir`
- **Responsabilidad:** recibir la suscripción del navegador (autenticado por cookie `emp_sesion`) e insertarla vía la Edge `empleado-push`, inyectando el `empleado_id` **de la sesión** (nunca del body).
- **Interfaz:** body `{ endpoint, p256dh, auth, user_agent }` → `{ ok: true }` / `401`.
- **Dependencias:** `src/lib/auth/empleadoSesion.ts` (`verificarEmpSesion`, `NOMBRE_COOKIE_EMP`), Edge `empleado-push`, env server-only `SUPABASE_SERVICE_ROLE_KEY`.
- **Ruta:** `src/app/api/empleado/suscribir/route.ts`.

### 3.3 Route handler `POST /api/empleado/desuscribir`
- **Responsabilidad:** dar de baja una suscripción por `endpoint` para el chofer de la sesión.
- **Interfaz:** body `{ endpoint }` → `{ ok: true }` / `401`.
- **Dependencias:** iguales al anterior.
- **Ruta:** `src/app/api/empleado/desuscribir/route.ts`.

### 3.4 Edge Function `empleado-push` (enrutador opt-in)
- **Responsabilidad:** una sola función con `action: "suscribir" | "desuscribir"` que llama las RPCs con service_role (patrón `empleado-auth`). **Valida que el bearer sea el service_role** antes de actuar.
- **Interfaz:** `{ action, empleado_id, endpoint, p256dh?, auth?, user_agent? }` → `{ ok: true }`.
- **Dependencias:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Ruta:** `supabase/functions/empleado-push/index.ts`.

### 3.5 Edge Function `enviar-push` (motor)
- **Responsabilidad:** validar el bearer (service_role), firmar VAPID, resolver destinatarios por `tipo`, enviar Web Push, borrar suscripciones muertas.
- **Interfaz:** `{ tipo, empleado_id? }` → `{ ok, tipo, total, enviados, muertas, fallidos }`.
- **Dependencias:** `jsr:@negrel/webpush@^0.5.0` (verificar API antes de codificar, ver §6.3), `jsr:@supabase/supabase-js@2`, RPCs `leer_vapid_keys` / `destinatarios_push` / `push_borrar_endpoint`, Vault (`vapid_keys`).
- **Ruta:** `supabase/functions/enviar-push/index.ts`.

### 3.6 Service Worker — handlers `push` y `notificationclick`
- **Responsabilidad:** mostrar la notificación y enfocar/abrir `/empleado` al hacer clic.
- **Interfaz:** listeners `self.addEventListener("push"|"notificationclick", ...)` **appendeados** al final del archivo existente.
- **Dependencias:** íconos `public/icons/icon-192.png`, `public/icons/badge-72.png`.
- **Ruta:** `public/sw-empleado.js` (cache actual `vales-ac-v1`, intacta).

### 3.7 UI opt-in — tarjeta "Activar avisos"
- **Responsabilidad:** detectar soporte/estado y ofrecer activar/desactivar; nunca pide permiso al cargar.
- **Interfaz:** componente React `AvisosCard` insertado en la home; usa `useToast()` para feedback.
- **Dependencias:** `src/lib/push/soporte.ts`, `src/lib/push/suscribir.ts`, `src/components/empleado/Toast.tsx`, clases de `src/app/empleado/carnet.css`.
- **Rutas:** `src/components/empleado/AvisosCard.tsx`, insertado en `src/app/empleado/page.tsx`.

### 3.8 Disparadores
- **`codigo_listo`** — al final de `supabase/functions/generar-otp-comidas/index.ts`: fire-and-forget `fetch` a `enviar-push` con `{"tipo":"codigo_listo"}` y bearer service_role.
- **`comida_nueva`** — enganche edge→edge dentro de `supabase/functions/crear-comida/index.ts` tras el insert, fire-and-forget, `{"tipo":"comida_nueva","empleado_id":<id>}`.
- **`recordatorio`** — cron `pg_cron` `0 22 * * 1-5` → `{"tipo":"recordatorio"}`.
- **Rutas:** `supabase/migrations/0012_push.sql` (tabla+RPCs), `supabase/migrations/0013_push_crons.sql` (solo el cron de recordatorio).

---

## 4. Flujo de datos por evento

### 4.1 `codigo_listo` (encadenado tras generar los códigos)
1. El cron diario existente (`30 16` UTC = 9:30 Mazatlán, L-V) invoca `generar-otp-comidas`, que genera/actualiza todos los OTP del día en `rnd_comida_otp` (`estado='generado'`).
2. **Al terminar** (después del último insert/update, en un `try/catch` que no altera su resultado), `generar-otp-comidas` hace edge→edge `fetch` a `enviar-push` con `{tipo:"codigo_listo"}` y `Authorization: Bearer <service_role de su propio env>`.
3. `enviar-push` valida el bearer, recibe `{ tipo:"codigo_listo" }` (sin `empleado_id`).
4. Llama `destinatarios_push('codigo_listo', null)`: join de `rnd_push_suscripciones` con `rnd_comida_otp` donde `semana = (now() at time zone 'America/Mazatlan')::date` **y** `estado = 'generado'`, por `empleado_id`.
5. Arma el `ApplicationServer` (cacheado por cold start) leyendo `leer_vapid_keys` del Vault.
6. Por cada fila envía el push (`title:"Vales AC"`, `body:"Ya está tu código de comida de hoy."`, `url:"/empleado"`, `tag:"cl-<id>"`), todos concurrentes, `ttl 12h`.
7. 201 → cuenta `enviados`. 404/410 → `push_borrar_endpoint(endpoint)` + `muertas`. Otro error → loguea + `fallidos`.
8. El SW de cada dispositivo recibe `push`, muestra la notificación; al tocarla enfoca/abre `/empleado`.

> **Por qué encadenado y no un cron a las 9:35:** un cron por reloj asume que `generar-otp-comidas` terminó en ≤5 min; si tardara o fallara, el push saldría con filas incompletas y **sin reintento** (Opción A). Encadenar garantiza que los códigos ya están escritos antes de avisar.

### 4.2 `comida_nueva` (inmediato)
1. Un usuario crea una comida: `crear-comida/index.ts` inserta en `rnd_reembolsos` (`concepto='COMIDAS'`, `estado='comida_pendiente'`, `empleado_id`).
2. Tras el insert exitoso, en un `try/catch` que **no** aborta la creación, hace edge→edge `fetch` a `enviar-push` con `{tipo:"comida_nueva", empleado_id}` y bearer service_role.
3. `enviar-push` valida el bearer, recibe `{ tipo:"comida_nueva", empleado_id }`.
4. Llama `destinatarios_push('comida_nueva', empleado_id)`: filas de `rnd_push_suscripciones` de ese `empleado_id`, con `monto` = `coalesce(sum(monto),0)` de sus comidas pendientes.
5. Mensaje: `body = "Se te acumuló una comida, ya son $<monto formateado>."`, `tag:"cn-<id>"`, `ttl 12h`.
6. Envío + limpieza 404/410 igual que §4.1.

> `useCrearComidasLote` llama `crearComida` por-empleado secuencialmente → un `comida_nueva` por empleado por lote, con el total correcto.

### 4.3 `recordatorio` (cron 15:00 Mazatlán = 22:00 UTC)
1. `pg_cron` dispara `enviar-push-recordatorio` a las `0 22` UTC, L-V.
2. `net.http_post` a `enviar-push` con `{"tipo":"recordatorio"}` y `Authorization: Bearer <service_role del Vault>`.
3. `enviar-push` llama `destinatarios_push('recordatorio', null)`: `rnd_comida_otp` de la semana de hoy que **siguen** `estado='generado'` **y** `expira_en > now()`, con suscripción.
4. Mensaje: `body = "Aún no usas tu código de hoy, cóbralo antes de que cierre el comedor."`, `tag:"rc-<id>"`, `ttl 3h` (aviso perecedero).
5. Envío + limpieza 404/410 igual.

---

## 5. Modelo de datos

### 5.1 DDL — `supabase/migrations/0012_push.sql`

```sql
-- ── Tabla de suscripciones push ───────────────────────────
create table if not exists public.rnd_push_suscripciones (
  endpoint    text         not null,
  empleado_id integer      not null,
  p256dh      text         not null,
  auth        text         not null,
  user_agent  text,
  creado_en   timestamptz  not null default now(),
  constraint rnd_push_suscripciones_pkey primary key (endpoint)
);

create index if not exists rnd_push_suscripciones_empleado_idx
  on public.rnd_push_suscripciones (empleado_id);

-- RLS CERRADA: sin políticas → solo service_role / RPC security definer entra.
alter table public.rnd_push_suscripciones enable row level security;
```

### 5.2 RPC `push_suscribir` (upsert por endpoint)

```sql
create or replace function public.push_suscribir(
  p_empleado_id integer,
  p_endpoint    text,
  p_p256dh      text,
  p_auth        text,
  p_user_agent  text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.rnd_push_suscripciones (endpoint, empleado_id, p256dh, auth, user_agent)
  values (p_endpoint, p_empleado_id, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set empleado_id = excluded.empleado_id,
        p256dh      = excluded.p256dh,
        auth        = excluded.auth,
        user_agent  = excluded.user_agent,
        creado_en   = now();
end $$;

revoke all on function public.push_suscribir(integer, text, text, text, text)
  from public, anon, authenticated;
```

### 5.3 RPC `push_desuscribir`

```sql
create or replace function public.push_desuscribir(
  p_empleado_id integer,
  p_endpoint    text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.rnd_push_suscripciones
   where endpoint = p_endpoint and empleado_id = p_empleado_id;
end $$;

revoke all on function public.push_desuscribir(integer, text)
  from public, anon, authenticated;
```

### 5.4 RPC `push_borrar_endpoint` (limpieza de muertas, service_role)

```sql
create or replace function public.push_borrar_endpoint(
  p_endpoint text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.rnd_push_suscripciones where endpoint = p_endpoint;
end $$;

revoke all on function public.push_borrar_endpoint(text)
  from public, anon, authenticated;
```

### 5.5 RPC `destinatarios_push` (resolución por tipo)

Devuelve `jsonb` (array de filas) para que la Edge lo consuma directo. El `monto` solo es relevante para `comida_nueva`.

```sql
create or replace function public.destinatarios_push(
  p_tipo        text,
  p_empleado_id integer
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hoy date := (now() at time zone 'America/Mazatlan')::date;
  v_res jsonb;
begin
  if p_tipo = 'comida_nueva' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth, 'monto', t.total)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
      cross join lateral (
        select coalesce(sum(r.monto), 0) as total
          from public.rnd_reembolsos r
         where r.empleado_id = p_empleado_id
           and r.concepto = 'COMIDAS' and r.estado = 'comida_pendiente'
      ) t
     where s.empleado_id = p_empleado_id;

  elsif p_tipo = 'codigo_listo' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
      join public.rnd_comida_otp o
        on o.empleado_id = s.empleado_id and o.semana = v_hoy and o.estado = 'generado';

  elsif p_tipo = 'recordatorio' then
    -- Igual que codigo_listo, pero exige vigencia defensivamente.
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
      join public.rnd_comida_otp o
        on o.empleado_id = s.empleado_id and o.semana = v_hoy
       and o.estado = 'generado' and o.expira_en > now();

  else
    v_res := '[]'::jsonb;
  end if;

  return v_res;
end $$;

revoke all on function public.destinatarios_push(text, integer)
  from public, anon, authenticated;
```

### 5.6 RPC `leer_vapid_keys` (lectura del Vault, service_role)

```sql
create or replace function public.leer_vapid_keys()
returns text
language sql security definer set search_path = public, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_keys' limit 1;
$$;

revoke all on function public.leer_vapid_keys() from public, anon, authenticated;
grant execute on function public.leer_vapid_keys() to service_role;
```

### 5.7 RLS cerrada
`rnd_push_suscripciones` tiene RLS **habilitada y sin políticas**. Ningún rol `anon`/`authenticated` puede leer/escribir. El único acceso es vía las RPCs `security definer` y el service_role de la Edge. Igual patrón que `rnd_comida_otp` y `rnd_empleado_auth`.

---

## 6. Edge Function `enviar-push`

**Ruta:** `supabase/functions/enviar-push/index.ts`

### 6.1 Contrato de entrada
```ts
type Tipo = "codigo_listo" | "comida_nueva" | "recordatorio";
interface Entrada { tipo: Tipo; empleado_id?: number; }
```
- `tipo` obligatorio → si falta, `400`. `empleado_id` obligatorio de facto para `comida_nueva`; se ignora en los otros dos.

### 6.2 Autorización
Antes de cualquier trabajo: `if (req.headers.get("authorization") !== "Bearer " + SERVICE_ROLE) return 401`. Solo los crons (Vault), `generar-otp-comidas`, `crear-comida` (env) conocen el service_role. Cierra el hallazgo **[ALTA]** de la crítica (no invocable con la anon key pública).

### 6.3 Librería de envío elegida
`jsr:@negrel/webpush@^0.5.0` — construida solo sobre `SubtleCrypto` + `fetch` (fit nativo del runtime Deno de Edge Functions), implementa VAPID (RFC 8292) y `aes128gcm` (RFC 8291), y expone el status del error para la limpieza. Se **pinea** por seguridad. Alternativa descartada: `npm:web-push` (depende de builtins de Node, fricción en Deno).

> **OBLIGATORIO antes de codificar (primera tarea del plan):** verificar contra el README/typings de 0.5.0 los nombres exactos: `ApplicationServer.new(...)`, `importVapidKeys(jwks, {extractable})`, `appServer.subscribe({endpoint, keys})`, `subscriber.pushTextMessage(data, {ttl, urgency, topic})`, `webpush.Urgency.Normal`, y la forma del error (`PushMessageError.response.status` y/o `.isGone()`). Si un nombre difiere, ajustar; no confiar en memoria.

### 6.4 Implementación

```ts
import * as webpush from "jsr:@negrel/webpush@^0.5.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = "mailto:jorgefelixa1810@gmail.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Tipo = "codigo_listo" | "comida_nueva" | "recordatorio";
interface SubRow { empleado_id: number; endpoint: string; p256dh: string; auth: string; monto?: number; }

// ApplicationServer se arma UNA vez por cold start; si falla, NO se cachea el rechazo.
let appServerPromise: Promise<webpush.ApplicationServer> | null = null;
function getAppServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const { data, error } = await admin.rpc("leer_vapid_keys");
      if (error || !data) throw new Error("VAPID no leído: " + (error?.message ?? "vacío"));
      const exported = JSON.parse(data as string) as { publicKey: JsonWebKey; privateKey: JsonWebKey };
      const vapidKeys = await webpush.importVapidKeys(exported, { extractable: false });
      return webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
    })().catch((e) => { appServerPromise = null; throw e; }); // no envenenar la instancia caliente
  }
  return appServerPromise;
}

function fmtMonto(m: unknown) { return Number(m ?? 0).toLocaleString("es-MX"); }

function mensaje(tipo: Tipo, row: SubRow) {
  const tag = topicCorto(tipo, row.empleado_id);
  switch (tipo) {
    case "codigo_listo": return { title: "Vales AC", body: "Ya está tu código de comida de hoy.", url: "/empleado", tag };
    case "comida_nueva": return { title: "Vales AC", body: `Se te acumuló una comida, ya son $${fmtMonto(row.monto)}.`, url: "/empleado", tag };
    case "recordatorio": return { title: "Vales AC", body: "Aún no usas tu código de hoy, cóbralo antes de que cierre el comedor.", url: "/empleado", tag };
  }
}

async function destinatarios(tipo: Tipo, empleadoId?: number): Promise<SubRow[]> {
  const { data, error } = await admin.rpc("destinatarios_push", { p_tipo: tipo, p_empleado_id: empleadoId ?? null });
  if (error) throw error;
  return (data ?? []) as SubRow[];
}

// Topic/tag RFC 8030: <=32 chars, base64url. Colapsa por (tipo, chofer).
function topicCorto(tipo: Tipo, empleadoId: number) {
  const t = { codigo_listo: "cl", comida_nueva: "cn", recordatorio: "rc" }[tipo];
  return `${t}-${empleadoId}`;
}

function conTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_ROLE}`)
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: CORS });

  try {
    const { tipo, empleado_id } = await req.json() as { tipo: Tipo; empleado_id?: number };
    if (!tipo) return new Response(JSON.stringify({ error: "tipo requerido" }), { status: 400, headers: CORS });

    const [appServer, subs] = await Promise.all([getAppServer(), destinatarios(tipo, empleado_id)]);

    const ttl = tipo === "recordatorio" ? 3 * 3600 : 12 * 3600; // segundos
    const results = await Promise.allSettled(subs.map((row) => {
      const subscriber = appServer.subscribe({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
      return conTimeout(subscriber.pushTextMessage(JSON.stringify(mensaje(tipo, row)), {
        ttl, urgency: webpush.Urgency.Normal, topic: topicCorto(tipo, row.empleado_id),
      }));
    }));

    let enviados = 0, muertas = 0, fallidos = 0;
    await Promise.all(results.map(async (r, i) => {
      if (r.status === "fulfilled") { enviados++; return; }
      const err = r.reason as unknown;
      const status = err instanceof webpush.PushMessageError ? err.response.status : undefined;
      if (status === 404 || status === 410) { muertas++; await admin.rpc("push_borrar_endpoint", { p_endpoint: subs[i].endpoint }); }
      else { fallidos++; console.error("push falló", subs[i].endpoint, status, String(err)); }
    }));

    return new Response(JSON.stringify({ ok: true, tipo, total: subs.length, enviados, muertas, fallidos }), { headers: CORS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error interno" }), { status: 500, headers: CORS });
  }
});
```

### 6.5 Borrado de suscripciones muertas
**404 / 410** → suscripción revocada/inválida → `push_borrar_endpoint(endpoint)`. Cualquier otro código (400/401/403 VAPID, 413 payload, 429 rate limit) **no** borra: se loguea como `fallidos`, sin reintentar (429 se respeta implícitamente).

### 6.6 Despliegue
Desplegar con `verify_jwt = true` (patrón del repo). La autorización real es el chequeo explícito del service_role en §6.2 (defensa en profundidad).

---

## 7. Edge Function `empleado-push` (enrutador opt-in) + route handlers

**Ruta:** `supabase/functions/empleado-push/index.ts`

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_ROLE}`)
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: CORS });
  try {
    const { action, empleado_id, endpoint, p256dh, auth, user_agent } = await req.json();
    if (typeof empleado_id !== "number") return new Response(JSON.stringify({ error: "empleado_id invalido" }), { status: 400, headers: CORS });
    if (typeof endpoint !== "string" || !endpoint) return new Response(JSON.stringify({ error: "endpoint invalido" }), { status: 400, headers: CORS });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE);

    if (action === "suscribir") {
      if (typeof p256dh !== "string" || typeof auth !== "string")
        return new Response(JSON.stringify({ error: "llaves invalidas" }), { status: 400, headers: CORS });
      const { error } = await supabase.rpc("push_suscribir", {
        p_empleado_id: empleado_id, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_user_agent: user_agent ?? null });
      if (error) throw error;
    } else if (action === "desuscribir") {
      const { error } = await supabase.rpc("push_desuscribir", { p_empleado_id: empleado_id, p_endpoint: endpoint });
      if (error) throw error;
    } else {
      return new Response(JSON.stringify({ error: "action invalida" }), { status: 400, headers: CORS });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }), { status: 500, headers: CORS });
  }
});
```

> **Confianza end-to-end (cierra [MEDIA] de la crítica):** como `empleado-push` exige el service_role y ese secreto solo lo tiene el **route handler server-side** (que ya verificó la cookie `emp_sesion` e inyecta el `empleado_id` de la sesión), un cliente con la anon key **no** puede registrar un endpoint bajo el `empleado_id` de otro. El body `empleado_id` es confiable porque su único emisor legítimo es el route handler autenticado.

### 7.1 Route handler `src/app/api/empleado/suscribir/route.ts`
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only, NO NEXT_PUBLIC

export async function POST(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/empleado-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({
      action: "suscribir",
      empleado_id: sesion.empleadoId,      // SIEMPRE de la sesión
      endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth, user_agent: body.user_agent,
    }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ ok: false, ...data }, { status: 502 });
  return NextResponse.json({ ok: true });
}
```

### 7.2 Route handler `src/app/api/empleado/desuscribir/route.ts`
Idéntico, con `action: "desuscribir"` y body `{ endpoint }` únicamente (más el `empleado_id` de la sesión).

---

## 8. Service Worker (append sin romper el actual)

**Ruta:** `public/sw-empleado.js`. Los handlers `install`/`activate`/`fetch` y la cache `vales-ac-v1` **no se tocan**. Se agregan al final dos listeners:

```js
// ── Web Push (append; no interfiere con install/activate/fetch) ──
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: "Vales AC", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Vales AC";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-72.png", // solo Android lo usa
    data: { url: data.url || "/empleado" },
    tag: data.tag,
    renotify: Boolean(data.tag),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/empleado";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/empleado") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
```

**Reglas:** `event.waitUntil(...)` obligatorio en ambos. **Todo `push` debe mostrar una notificación visible** (`userVisibleOnly:true`): nunca pushes silenciosos, o iOS revoca el permiso. El `tag` (viene del servidor, ej. `cl-2204`) hace que el dispositivo **reemplace** el aviso anterior del mismo tipo/chofer en vez de apilar. Los íconos referenciados deben existir en `public/icons/`.

---

## 9. UI opt-in — tarjeta "Activar avisos"

### 9.1 Helpers de soporte — `src/lib/push/soporte.ts`
```ts
export function pushSoportado(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function esStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: fullscreen)").matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(mm || iosStandalone);
}
export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}
```

### 9.2 Suscripción cliente — `src/lib/push/suscribir.ts`
```ts
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function activarAvisos(): Promise<{ ok: true } | { ok: false; motivo: "denied" | "error" }> {
  const permiso = await Notification.requestPermission();  // PRIMERO, dentro del gesto de click
  if (permiso !== "granted") return { ok: false, motivo: "denied" };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) });
  const raw = sub.toJSON();
  const res = await fetch("/api/empleado/suscribir", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: raw.endpoint, p256dh: raw.keys?.p256dh, auth: raw.keys?.auth, user_agent: navigator.userAgent }),
  });
  if (!res.ok) return { ok: false, motivo: "error" };
  return { ok: true };
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/empleado/desuscribir", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
}
```

### 9.3 Componente — `src/components/empleado/AvisosCard.tsx`
- Usa `useToast()` (`const { mostrar } = useToast()`) — **cero `alert/confirm/prompt`** (ver [[no-usar-alert]]).
- En `useEffect` calcula estado (`soportado`, `standalone`, `ios`, `permiso`, `yaSuscrito` vía `getSubscription()`), pero **la acción de permiso solo se dispara en `onClick`**.
- Reusa clases de marca de `carnet.css`: contenedor tipo tarjeta, botón primario azul `#2563eb`, secundario outline, caja de aviso azul suave, mini-título, texto gris. (La API exacta de clases se confirma leyendo `carnet.css` en la primera tarea de UI.)
- **Inserción:** en `src/app/empleado/page.tsx`, como bloque nuevo tras la barra superior (`carnet-topbar`) y antes de la tarjeta de comidas — así queda arriba, siempre visible.

### 9.4 Matriz de plataformas

| Plataforma | ¿Push web? | ¿Requiere instalada? | Detección | Endpoint |
|---|---|---|---|---|
| iOS/iPadOS Safari 16.4+ | Sí | **Sí (obligatorio)**, manifest `display: standalone` | `pushSoportado() && esStandalone()` | `web.push.apple.com` |
| iOS Safari (pestaña) | No | — | `PushManager` ausente → `pushSoportado()=false` | — |
| iOS < 16.4 | No | — | Falla detección | — |
| Android Chrome | Sí | No | `pushSoportado()=true` | `fcm.googleapis.com` |
| Android Firefox | Sí | No | `pushSoportado()=true` | `push.services.mozilla.com` |
| Desktop Chrome/Edge/Firefox | Sí | No | `pushSoportado()=true` | FCM / Mozilla |
| Desktop Safari (macOS 13+) | Sí | Depende | `pushSoportado()=true` | `web.push.apple.com` |

iOS es Web Push **estándar** enrutado por el push service de Apple: **no** requiere cuenta Apple Developer ni certificados APNs. La limpieza 404/410 aplica igual a endpoints `web.push.apple.com`.

### 9.5 Reglas de visibilidad y textos por estado (Toast, cero alert)

Estado leído en cliente: `soportado`, `standalone`, `ios`, `permiso` (`'granted'|'denied'|'default'`), `yaSuscrito`.

| Condición (en orden) | Qué mostrar | Texto |
|---|---|---|
| `ios && !standalone` | Hint de instalación (no botón de permiso) | "Recibe avisos de tu código. Para activarlos, instala la app: toca Compartir y elige 'Agregar a inicio'." |
| `!soportado` (no-iOS) | Nada (ocultar la sección) | — |
| `soportado && permiso==='denied'` | Aviso de reactivación (sin botón que repida permiso) | iOS: "Avisos bloqueados. Ve a Ajustes › Notificaciones › Vales AC y actívalas." · Android/Chrome: "Toca el candado en la barra de dirección › Notificaciones › Permitir." |
| `soportado && granted && yaSuscrito` | Estado activo | Chip "Avisos activados" + acción secundaria "Desactivar". |
| `soportado && granted && !yaSuscrito` | Botón "Activar avisos" | "Activar avisos" |
| `soportado && permiso==='default'` | Botón "Activar avisos" | "Activar avisos" + subtítulo "Te avisamos cuando esté tu código y antes de que cierre el comedor." |

Transiciones al pulsar "Activar avisos" → `activarAvisos()`:
- `{ok:true}` → `mostrar("Listo, te avisaremos.")` + UI a "Avisos activados".
- `{motivo:'denied'}` → si `Notification.permission==='denied'` cambiar a fila de reactivación; si quedó `'default'`, dejar botón y `mostrar("No se activaron los avisos.")`.
- `{motivo:'error'}` → `mostrar("No se pudo activar, intenta de nuevo.")`.

Regla de oro: si `permiso==='denied'`, `requestPermission()` devuelve `'denied'` sin prompt → en ese estado **no** se ofrece botón que reintente permiso, solo instrucciones de Ajustes.

---

## 10. Disparadores (encadenados + cron)

### 10.1 `codigo_listo` — al final de `generar-otp-comidas/index.ts`
Después de generar/actualizar todos los OTP del día, en su propio `try/catch` que **no** altera la respuesta:
```ts
try {
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enviar-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ tipo: "codigo_listo" }),
  });
} catch (e) { console.error("push codigo_listo falló", e); }
```

### 10.2 `comida_nueva` — en `crear-comida/index.ts`
Justo **después** del insert exitoso en `rnd_reembolsos` (mismo punto donde ya dispara WhatsApp), en su propio `try/catch` que no aborta:
```ts
try {
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enviar-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ tipo: "comida_nueva", empleado_id }),
  });
} catch (e) { console.error("push comida_nueva falló", e); }
```

**Por qué edge→edge y no trigger DB:** un trigger `AFTER INSERT`+`pg_net` metería una llamada HTTP dentro de la transacción que mueve dinero; el repo no tiene triggers que llamen `pg_net` (todos son desde cron). `crear-comida` es el único chokepoint que inserta `estado='comida_pendiente'` y ya conoce `empleado_id`.

### 10.3 `recordatorio` — cron `supabase/migrations/0013_push_crons.sql`
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- recordatorio: 15:00 Mazatlán (UTC-7) = 22:00 UTC, L-V
do $$ begin perform cron.unschedule('enviar-push-recordatorio'); exception when others then null; end $$;
select cron.schedule('enviar-push-recordatorio', '0 22 * * 1-5', $$
  select net.http_post(
    url := 'https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"recordatorio"}'::jsonb
  );
$$);
```

> **Aviso operativo (igual que `0008`):** en PROD los crones se aplican a mano para no colisionar con jobs vivos. Documenta el snippet pero prevé aplicarlo manualmente. Requiere que el secreto `service_role_key` exista en el Vault (ya existe, usado por el cron de `generar-otp-comidas`).

---

## 11. Secretos / entorno

| Pieza | Dónde | Formato | Uso |
|---|---|---|---|
| Par VAPID completo | Vault, secreto `vapid_keys` | JSON `{ publicKey: JWK, privateKey: JWK }` | `importVapidKeys()` en `enviar-push` (vía `leer_vapid_keys`) |
| Llave pública VAPID | Netlify env `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **base64url** raw | `applicationServerKey` en `pushManager.subscribe` |
| service_role para route handler | Netlify env `SUPABASE_SERVICE_ROLE_KEY` (**server-only, NO NEXT_PUBLIC**) | texto (JWT) | bearer del route handler → `empleado-push` |
| VAPID subject | Constante en `enviar-push` | `mailto:jorgefelixa1810@gmail.com` | `contactInformation` |
| service_role_key | Vault (ya existe) | texto | bearer de crons y edge→edge |

**Distinción crítica:** el Edge usa el **par JWK** (Vault); el navegador usa el **base64url raw**. Son representaciones distintas de la misma llave pública.

### 11.1 Generación del par
```bash
deno run -A https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts > vapid.json
# stdout -> vapid.json : { "publicKey": {JWK}, "privateKey": {JWK} }
# stderr -> "your application server key is: <BASE64URL>"
```
- `vapid.json` completo → Vault (`vault.create_secret(<contenido>, 'vapid_keys', ...)`).
- El base64url de stderr → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Netlify (rebuild para que entre al bundle).
- `SUPABASE_SERVICE_ROLE_KEY` (Project Settings › API) → Netlify env server-only.

> **Verificar antes de codificar:** el comando/URL de generación y el formato exacto de salida contra el repo `negrel/webpush` 0.5.0.

---

## 12. Manejo de errores y suscripciones muertas

- **Por-suscripción, no aborta el lote:** `Promise.allSettled`; `conTimeout(...,10s)` acota wall-clock.
- **404 / 410** → `push_borrar_endpoint(endpoint)`. Cuenta `muertas`.
- **Otros (400/401/403/413/429)** → loguear `fallidos`, sin reintentar.
- **Payload:** JSON < 200 B por aviso (tope seguro ~3 KB); sin imágenes en payload.
- **TTL:** `recordatorio` 3 h; los demás 12 h.
- **Enganches edge→edge:** su `try/catch` nunca aborta la operación de origen (generar OTP / crear comida).
- **Cold start:** `ApplicationServer` cacheado; el rechazo del Vault **no** se cachea (§6.4).

---

## 13. Seguridad / RLS

- `rnd_push_suscripciones` con **RLS habilitada y sin políticas** → inaccesible para `anon`/`authenticated`; solo RPCs `security definer` y service_role.
- Todas las RPCs: `security definer` + `set search_path = public, extensions` + `revoke all ... from public, anon, authenticated`. `leer_vapid_keys` además `grant execute ... to service_role`.
- La llave privada VAPID **nunca** sale del Vault salvo hacia `enviar-push` (service_role). El frontend solo ve la pública base64url.
- `empleado_id` **siempre** proviene de la cookie firmada `emp_sesion` en el route handler, **nunca** del body del cliente.
- **`enviar-push` y `empleado-push` exigen `Authorization: Bearer <service_role>`** (§6.2, §7): no invocables con la anon key pública. Cierra [ALTA] y [MEDIA] de la crítica.
- `push_desuscribir` filtra por `empleado_id` **y** `endpoint`: un chofer no puede borrar la suscripción de otro.

---

## 14. Pruebas

### 14.1 Unitarias
- `urlBase64ToUint8Array`: con y sin padding; equivalencia byte a byte contra vector conocido.
- `soporte.ts`: `pushSoportado`/`esStandalone`/`esIOS` con `navigator`/`window`/`matchMedia` mockeados (Chrome, iOS pestaña, iOS standalone, sin soporte).
- `AvisosCard`: máquina de estados — para cada fila de §9.5, verificar texto/botón dado `{soportado, standalone, ios, permiso, yaSuscrito}`.
- `enviar-push` `mensaje(tipo,row)`: los tres textos exactos, `$` + `fmtMonto` en `comida_nueva`, y `tag` presente.
- `topicCorto`: ≤32 chars y base64url para los tres tipos.
- `destinatarios_push` (test SQL): sembrar OTP `generado`/`usado` de hoy y de otra semana + suscripciones; verificar que `codigo_listo`/`recordatorio` solo devuelven `generado` de hoy vigente con suscripción, y que `comida_nueva` trae `sum(monto)` correcto.
- Limpieza: simular error con `response.status` 410 y 500 → 410 llama `push_borrar_endpoint`, 500 no.
- Autorización: `enviar-push`/`empleado-push` con bearer distinto al service_role → 401.

### 14.2 Verificación manual end-to-end
1. Generar par VAPID, cargar `vapid_keys` en Vault, poner `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Netlify, redeploy.
2. Confirmar `public/icons/icon-192.png` y `badge-72.png`; manifest con `display: standalone` e íconos.
3. **Android Chrome:** `/empleado` → botón "Activar avisos" → aceptar → Toast "Listo, te avisaremos." Confirmar fila en `rnd_push_suscripciones`.
4. **iOS 16.4+:** en pestaña ver hint "instala la app" (sin botón). Instalar, abrir, activar, confirmar fila con endpoint `web.push.apple.com`.
5. Invocar `enviar-push` `{"tipo":"codigo_listo"}` con service_role (habiendo OTP `generado` de hoy) → llega; al tocar enfoca `/empleado`. Con bearer anon → 401.
6. Crear una comida (`concepto='COMIDAS'`) → llega `comida_nueva` con monto acumulado correcto.
7. `{"tipo":"recordatorio"}` con OTP `generado` → llega; marcar `usado` y reinvocar → **no** llega.
8. Revocar permiso / desinstalar → reinvocar; verificar 404/410 y que la fila se borró.
9. `permiso==='denied'`: recargar `/empleado`, ver fila de reactivación con instrucciones.
10. "Desactivar avisos": `unsubscribe()` + fila borrada; botón vuelve a "Activar avisos".
11. Correr `generar-otp-comidas` a mano → confirmar en logs que encadena `codigo_listo` con `{ ok:true, enviados, ... }`.

---

## 15. Rutas de archivo (resumen)

- `supabase/migrations/0012_push.sql` — tabla + RPCs.
- `supabase/migrations/0013_push_crons.sql` — cron `enviar-push-recordatorio`.
- `supabase/functions/enviar-push/index.ts` — motor.
- `supabase/functions/empleado-push/index.ts` — enrutador opt-in.
- `supabase/functions/generar-otp-comidas/index.ts` — **editar**: encadenar `codigo_listo`.
- `supabase/functions/crear-comida/index.ts` — **editar**: enganche `comida_nueva`.
- `src/app/api/empleado/suscribir/route.ts`, `src/app/api/empleado/desuscribir/route.ts`.
- `src/lib/push/soporte.ts`, `src/lib/push/suscribir.ts`.
- `src/components/empleado/AvisosCard.tsx`.
- `src/app/empleado/page.tsx` — **editar**: insertar `<AvisosCard/>`.
- `public/sw-empleado.js` — **editar**: append `push` + `notificationclick`.
- `public/icons/icon-192.png`, `public/icons/badge-72.png` — deben existir.

---

## 16. Fuera de alcance / YAGNI

- **Cola de reintentos (Opción B):** no se implementa. Sin tabla de cola, backoff, `Retry-After`, ni dead-letter. Se difiere hasta que la flota lo justifique.
- **Cap de concurrencia / chunks:** innecesario para decenas de choferes.
- **Declarative Web Push (Safari 18.4+):** no se usa; el SW imperativo cubre iOS 16.4+ y es cross-plataforma.
- **Preferencias por-evento, agrupación, historial, badges de conteo:** fuera de alcance.
- **Trigger DB para `comida_nueva`:** descartado a propósito (§10.2).
- **Pushes silenciosos / `image` en payload:** prohibidos (iOS revoca permiso; payload > límite).

---

## 17. Dependencia operativa

El evento `comida_nueva` requiere que exista `supabase/functions/crear-comida/index.ts` con su insert a `rnd_reembolsos`. Hoy ese código es **WIP sin commitear** (ver [[app-empleados-progreso]]). El enganche de §10.2 se añade sobre esa función; si al implementar aún no está commiteada, se coordina con ese trabajo para no pisarlo.
