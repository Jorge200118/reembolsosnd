# Notificaciones Push (PWA Vales AC) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir Web Push (VAPID) a la PWA `/empleado` con tres avisos: código listo (encadenado), comida nueva (inmediato) y recordatorio (cron 15:00), con opt-in y motor de envío blindado.

**Architecture:** Opción A (enviador central `enviar-push`, sin cola). Suscripciones en `rnd_push_suscripciones` (RLS cerrada). Disparadores: encadenado en `generar-otp-comidas`, edge→edge en `crear-comida`, cron `pg_cron` para recordatorio. Funciones de envío exigen `service_role` como bearer. Todo detalle en `docs/superpowers/specs/2026-07-16-app-empleados-push-notificaciones-design.md`.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19, TypeScript, vitest, Supabase (Postgres, Edge Functions Deno, Vault, pg_cron/pg_net), `jsr:@negrel/webpush@^0.5.0`, Web Push API + Service Worker.

**Referencia:** el spec es la fuente de verdad para los bloques de código largos; las tareas citan la sección (§) correspondiente y reproducen las piezas críticas y los tests.

---

## Task 0: Rama de trabajo

**Files:** ninguno (git).

- [ ] **Step 1: Crear y cambiar a la rama de la feature**

Estamos en `master` (rama de deploy). La implementación va en su propia rama.

Run:
```bash
git checkout -b feat/push-notificaciones
git branch --show-current
```
Expected: `feat/push-notificaciones`.

> Nota: hay WIP sin commitear de `crear-comida` en el working tree; viaja con el checkout sin conflicto (mismos archivos en ambas ramas). No se toca hasta la Task 11.

---

## Task 1: Generar llaves VAPID y cargar secretos

**Files:** ninguno en el repo (Vault de Supabase + env de Netlify). Guardar `vapid.json` FUERA del repo (no commitear).

- [ ] **Step 1: Generar el par VAPID**

Run:
```bash
deno run -A https://raw.githubusercontent.com/negrel/webpush/master/cmd/generate-vapid-keys.ts > vapid.json
```
Expected: `vapid.json` con `{ "publicKey": {JWK}, "privateKey": {JWK} }` en stdout; en stderr aparece `your application server key is: <BASE64URL>`. **Anotar ese BASE64URL.**

> Si la URL/comando cambió en 0.5.0, consultar el README de `negrel/webpush`. Alternativa: cualquier generador VAPID que produzca el par en JWK + la pública en base64url raw.

- [ ] **Step 2: Cargar el par en el Vault de Supabase**

Ejecutar en el SQL editor de Supabase (proyecto `uqncsqstpcynjxnjhrqu`), pegando el contenido íntegro de `vapid.json`:
```sql
select vault.create_secret(
  '<CONTENIDO_INTEGRO_DE_vapid.json>',
  'vapid_keys',
  'Llaves VAPID (JWK) para Web Push de la app de empleados'
);
```
Expected: devuelve un uuid (id del secreto).

- [ ] **Step 3: Verificar lectura del Vault**

Run (SQL editor):
```sql
select name from vault.decrypted_secrets where name in ('vapid_keys','service_role_key');
```
Expected: dos filas (`vapid_keys` nueva, `service_role_key` ya existente).

- [ ] **Step 4: Configurar variables en Netlify**

En Netlify → Site settings → Environment variables (All scopes, todos los contextos):
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = el BASE64URL del Step 1.
- `SUPABASE_SERVICE_ROLE_KEY` = el service_role (Supabase → Project Settings → API → `service_role`). **Server-only, sin prefijo NEXT_PUBLIC.**

Expected: ambas guardadas. (El deploy que las use se hace en Task 12; Netlify hornea env en build-time.)

- [ ] **Step 5: Añadir a `.env.local` para dev y verificar `.gitignore`**

Agregar a `.env.local` (dev): `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<BASE64URL>` y `SUPABASE_SERVICE_ROLE_KEY=<service_role>`.

Run:
```bash
git check-ignore .env.local vapid.json
```
Expected: ambos ignorados (imprime sus nombres). Si `vapid.json` no está ignorado, añadirlo a `.gitignore`.

- [ ] **Step 6: Commit (solo .gitignore si cambió)**
```bash
git add .gitignore
git commit -m "chore(push): ignorar vapid.json" || echo "sin cambios que commitear"
```

---

## Task 2: Migración 0012 — tabla `rnd_push_suscripciones` + RPCs

**Files:**
- Create: `supabase/migrations/0012_push.sql`

- [ ] **Step 1: Escribir la migración**

Copiar de spec §5 (5.1–5.6) el DDL completo: tabla con `primary key (endpoint)` + índice por `empleado_id` + RLS habilitada sin políticas; y las RPCs `push_suscribir`, `push_desuscribir`, `push_borrar_endpoint`, `destinatarios_push`, `leer_vapid_keys` con sus `revoke`/`grant`.

- [ ] **Step 2: Aplicar la migración (vía MCP supabase `apply_migration`, name `push`)**

Aplicar el contenido de `0012_push.sql`.
Expected: sin error.

- [ ] **Step 3: Verificar estructura y RLS**

Run (SQL / MCP `execute_sql`):
```sql
select relrowsecurity from pg_class where relname='rnd_push_suscripciones';                     -- t
select count(*) from pg_policies where tablename='rnd_push_suscripciones';                        -- 0
select proname from pg_proc where proname in
  ('push_suscribir','push_desuscribir','push_borrar_endpoint','destinatarios_push','leer_vapid_keys'); -- 5 filas
```
Expected: RLS `t`, 0 políticas, 5 funciones.

- [ ] **Step 4: Probar `destinatarios_push` con datos sembrados**

Run (SQL): sembrar una suscripción dummy + un OTP `generado` de hoy para un `empleado_id` de prueba, luego:
```sql
select public.destinatarios_push('codigo_listo', null);
select public.destinatarios_push('comida_nueva', <empleado_id_prueba>);
```
Expected: `codigo_listo` devuelve la fila si hay OTP `generado` de hoy + suscripción; `comida_nueva` devuelve la fila con `monto` = suma de comidas pendientes. Limpiar los datos de prueba al terminar.

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/0012_push.sql
git commit -m "feat(push): tabla rnd_push_suscripciones + RPCs (RLS cerrada)"
```

---

## Task 3: Verificar la API de `@negrel/webpush@0.5.0` (spike previo al motor)

**Files:** temporal `scratch-webpush.ts` (NO commitear).

- [ ] **Step 1: Confirmar los nombres exactos de la API 0.5.0**

Verificar en el README/typings/JSR de `@negrel/webpush@0.5.0` los nombres usados en el spec §6.3/§6.4: `ApplicationServer.new({contactInformation, vapidKeys})`, `importVapidKeys(jwks, {extractable})`, `appServer.subscribe({endpoint, keys})`, `subscriber.pushTextMessage(data, {ttl, urgency, topic})`, `webpush.Urgency.Normal`, `PushMessageError` con `.response.status` (y/o `.isGone()`).

Opcional (spike):
```bash
deno eval 'import * as w from "jsr:@negrel/webpush@^0.5.0"; console.log(Object.keys(w));'
```
Expected: lista de exports que incluya `ApplicationServer`, `importVapidKeys`, `PushMessageError`, `Urgency`.

- [ ] **Step 2: Anotar desviaciones**

Si algún nombre difiere, anotar el nombre real para usarlo en Task 4. No commitear el scratch.

---

## Task 4: Edge Function `enviar-push` (motor)

**Files:**
- Create: `supabase/functions/enviar-push/mensajes.ts` (helpers puros, testeables con vitest)
- Create: `supabase/functions/enviar-push/mensajes.test.ts`
- Create: `supabase/functions/enviar-push/index.ts`

- [ ] **Step 1: Escribir el test de los helpers puros (falla primero)**

`supabase/functions/enviar-push/mensajes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mensaje, topicCorto, fmtMonto } from "./mensajes";

describe("push mensajes", () => {
  it("topicCorto <=32 chars y base64url por tipo", () => {
    for (const t of ["codigo_listo","comida_nueva","recordatorio"] as const) {
      const tag = topicCorto(t, 2204);
      expect(tag.length).toBeLessThanOrEqual(32);
      expect(tag).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    expect(topicCorto("codigo_listo", 2204)).toBe("cl-2204");
  });
  it("fmtMonto formatea es-MX y nunca vacío", () => {
    expect(fmtMonto(undefined)).toBe("0");
    expect(fmtMonto(1250)).toBe("1,250");
  });
  it("mensaje trae textos exactos + tag", () => {
    expect(mensaje("codigo_listo", { empleado_id: 1, endpoint:"e", p256dh:"p", auth:"a" }))
      .toEqual({ title:"Vales AC", body:"Ya está tu código de comida de hoy.", url:"/empleado", tag:"cl-1" });
    expect(mensaje("comida_nueva", { empleado_id: 1, endpoint:"e", p256dh:"p", auth:"a", monto: 405 }).body)
      .toBe("Se te acumuló una comida, ya son $405.");
    expect(mensaje("recordatorio", { empleado_id: 1, endpoint:"e", p256dh:"p", auth:"a" }).body)
      .toContain("Aún no usas tu código");
  });
});
```

- [ ] **Step 2: Ejecutar el test → debe fallar**

Run: `pnpm vitest run supabase/functions/enviar-push/mensajes.test.ts`
Expected: FAIL (módulo `./mensajes` no existe).

- [ ] **Step 3: Implementar `mensajes.ts`**

```ts
export type Tipo = "codigo_listo" | "comida_nueva" | "recordatorio";
export interface SubRow { empleado_id: number; endpoint: string; p256dh: string; auth: string; monto?: number; }

export function fmtMonto(m: unknown): string { return Number(m ?? 0).toLocaleString("es-MX"); }

export function topicCorto(tipo: Tipo, empleadoId: number): string {
  const t = { codigo_listo: "cl", comida_nueva: "cn", recordatorio: "rc" }[tipo];
  return `${t}-${empleadoId}`;
}

export function mensaje(tipo: Tipo, row: SubRow) {
  const tag = topicCorto(tipo, row.empleado_id);
  switch (tipo) {
    case "codigo_listo": return { title: "Vales AC", body: "Ya está tu código de comida de hoy.", url: "/empleado", tag };
    case "comida_nueva": return { title: "Vales AC", body: `Se te acumuló una comida, ya son $${fmtMonto(row.monto)}.`, url: "/empleado", tag };
    case "recordatorio": return { title: "Vales AC", body: "Aún no usas tu código de hoy, cóbralo antes de que cierre el comedor.", url: "/empleado", tag };
  }
}
```

- [ ] **Step 4: Ejecutar el test → debe pasar**

Run: `pnpm vitest run supabase/functions/enviar-push/mensajes.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar `index.ts`**

Copiar de spec §6.4 el cuerpo completo, **importando `mensaje`/`topicCorto` desde `./mensajes.ts`** (no duplicarlos) y aplicando los nombres de API confirmados en Task 3. Debe incluir: chequeo `Authorization === Bearer SERVICE_ROLE` (§6.2), `getAppServer()` con `.catch(() => { appServerPromise = null; throw })`, `Promise.allSettled`, `conTimeout`, y borrado 404/410 vía `push_borrar_endpoint`.

- [ ] **Step 6: Desplegar y verificar autorización**

Desplegar `enviar-push` (MCP `deploy_edge_function`, `verify_jwt: true`).
Run (curl con bearer inválido):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/enviar-push \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" -d '{"tipo":"codigo_listo"}'
```
Expected: `401` (la anon key no es el service_role → rechazada).

- [ ] **Step 7: Verificar envío con service_role**

Sembrar una suscripción real (de un navegador de prueba tras Task 8–10, o dummy) + OTP `generado`; invocar con `Authorization: Bearer <SERVICE_ROLE>` y `{"tipo":"codigo_listo"}`.
Expected: `{ ok:true, tipo:"codigo_listo", total, enviados, muertas, fallidos }`. (Con suscripción real, llega la notificación.)

- [ ] **Step 8: Commit**
```bash
git add supabase/functions/enviar-push/
git commit -m "feat(push): edge function enviar-push (motor VAPID, service_role only)"
```

---

## Task 5: Edge Function `empleado-push` (enrutador opt-in)

**Files:**
- Create: `supabase/functions/empleado-push/index.ts`

- [ ] **Step 1: Implementar `index.ts`**

Copiar de spec §7 el cuerpo: chequeo `Authorization === Bearer SERVICE_ROLE`, validación de `empleado_id`/`endpoint`, ramas `action: "suscribir" | "desuscribir"` que llaman las RPCs `push_suscribir`/`push_desuscribir`.

- [ ] **Step 2: Desplegar y verificar autorización**

Desplegar (MCP `deploy_edge_function`, `verify_jwt: true`).
Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/empleado-push \
  -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"action":"suscribir","empleado_id":1,"endpoint":"x","p256dh":"y","auth":"z"}'
```
Expected: `401`.

- [ ] **Step 3: Verificar suscripción con service_role**

Invocar con `Authorization: Bearer <SERVICE_ROLE>` y un body válido; luego consultar `select count(*) from rnd_push_suscripciones where endpoint='x';` → 1. Con `action:"desuscribir"` → 0. Limpiar.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/empleado-push/
git commit -m "feat(push): edge function empleado-push (opt-in, service_role only)"
```

---

## Task 6: Route handlers `/api/empleado/suscribir` y `/desuscribir`

**Files:**
- Create: `src/app/api/empleado/suscribir/route.ts`
- Create: `src/app/api/empleado/desuscribir/route.ts`

- [ ] **Step 1: Implementar `suscribir/route.ts`**

Copiar de spec §7.1: verifica cookie `emp_sesion` (`verificarEmpSesion`, `NOMBRE_COOKIE_EMP`), `401` si no hay sesión; llama a `empleado-push` con `Authorization: Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, inyectando `empleado_id: sesion.empleadoId` y el `endpoint/p256dh/auth/user_agent` del body.

- [ ] **Step 2: Implementar `desuscribir/route.ts`**

Idéntico pero `action: "desuscribir"` y solo `endpoint` del body (§7.2).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Verificar 401 sin cookie (dev)**

Con el server dev corriendo (`pnpm dev`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/empleado/suscribir \
  -H "Content-Type: application/json" -d '{"endpoint":"x","p256dh":"y","auth":"z"}'
```
Expected: `401` (sin cookie de sesión).

- [ ] **Step 5: Commit**
```bash
git add src/app/api/empleado/suscribir/ src/app/api/empleado/desuscribir/
git commit -m "feat(push): route handlers suscribir/desuscribir (auth emp_sesion)"
```

---

## Task 7: Service Worker — handlers `push` y `notificationclick`

**Files:**
- Modify: `public/sw-empleado.js` (append al final; no tocar install/activate/fetch)

- [ ] **Step 1: Añadir los listeners**

Copiar de spec §8 los dos `self.addEventListener("push", ...)` y `("notificationclick", ...)` al final del archivo. No modificar la cache `vales-ac-v1` ni los handlers existentes.

- [ ] **Step 2: Verificar sintaxis JS**

Run: `node --check public/sw-empleado.js`
Expected: sin salida (sintaxis válida).

- [ ] **Step 3: Commit**
```bash
git add public/sw-empleado.js
git commit -m "feat(push): service worker push + notificationclick"
```

---

## Task 8: Helpers de soporte cliente `src/lib/push/soporte.ts`

**Files:**
- Create: `src/lib/push/soporte.ts`
- Create: `src/lib/push/soporte.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`src/lib/push/soporte.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { pushSoportado, esIOS } from "./soporte";

afterEach(() => vi.unstubAllGlobals());

describe("soporte push", () => {
  it("pushSoportado true con todas las APIs", () => {
    vi.stubGlobal("navigator", { serviceWorker: {}, userAgent: "x", platform: "x", maxTouchPoints: 0 });
    vi.stubGlobal("window", { PushManager: function () {}, Notification: function () {} });
    expect(pushSoportado()).toBe(true);
  });
  it("pushSoportado false sin PushManager", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("window", { Notification: function () {} });
    expect(pushSoportado()).toBe(false);
  });
  it("esIOS detecta iPhone", () => {
    vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 });
    expect(esIOS()).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar → falla**

Run: `pnpm vitest run src/lib/push/soporte.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `soporte.ts`**

Copiar de spec §9.1 (`pushSoportado`, `esStandalone`, `esIOS`).

- [ ] **Step 4: Ejecutar → pasa**

Run: `pnpm vitest run src/lib/push/soporte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/push/soporte.ts src/lib/push/soporte.test.ts
git commit -m "feat(push): helpers de soporte (pushSoportado/esStandalone/esIOS)"
```

---

## Task 9: Suscripción cliente `src/lib/push/suscribir.ts`

**Files:**
- Create: `src/lib/push/suscribir.ts`
- Create: `src/lib/push/suscribir.test.ts` (solo `urlBase64ToUint8Array`)

- [ ] **Step 1: Escribir el test del conversor (falla primero)**

Exportar `urlBase64ToUint8Array` desde `suscribir.ts` para poder testearlo.
`src/lib/push/suscribir.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "./suscribir";

describe("urlBase64ToUint8Array", () => {
  it("decodifica base64url con y sin padding", () => {
    // "AQID" -> [1,2,3]; base64url sin padding
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    // con - y _ (base64url) equivalentes a + y /
    expect(urlBase64ToUint8Array("-_8").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Ejecutar → falla**

Run: `pnpm vitest run src/lib/push/suscribir.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `suscribir.ts`**

Copiar de spec §9.2 (`urlBase64ToUint8Array` **exportado**, `activarAvisos`, `desactivarAvisos`).

- [ ] **Step 4: Ejecutar → pasa + type-check**

Run: `pnpm vitest run src/lib/push/suscribir.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS y sin errores de tipo.

- [ ] **Step 5: Commit**
```bash
git add src/lib/push/suscribir.ts src/lib/push/suscribir.test.ts
git commit -m "feat(push): suscribir/desuscribir cliente + conversor VAPID"
```

---

## Task 10: Componente `AvisosCard` + inserción en la home

**Files:**
- Create: `src/components/empleado/AvisosCard.tsx`
- Create: `src/components/empleado/AvisosCard.test.tsx`
- Modify: `src/app/empleado/page.tsx`
- Read (para clases): `src/app/empleado/carnet.css`

- [ ] **Step 1: Leer `carnet.css` y `page.tsx`**

Identificar clases reutilizables (tarjeta, botón primario azul, secundario, caja de aviso, textos) y el punto de inserción tras la barra superior. Anotar los nombres reales.

- [ ] **Step 2: Escribir el test de máquina de estados (falla primero)**

`AvisosCard.test.tsx` con `@testing-library/react`: mockear `@/lib/push/soporte` y `@/lib/push/suscribir` y el `useToast`. Para cada fila de spec §9.5 renderizar con el estado correspondiente y assert del texto/botón:
- `ios && !standalone` → texto "instala la app", sin botón "Activar avisos".
- `!soportado` (no-iOS) → no renderiza nada.
- `denied` → texto de reactivación, sin botón que repida permiso.
- `granted && yaSuscrito` → "Avisos activados" + "Desactivar".
- `granted && !yaSuscrito` y `default` → botón "Activar avisos".

(Escribir los mocks de `soporte`/`suscribir` para controlar `pushSoportado`, `esStandalone`, `esIOS`, y `Notification.permission` / `getSubscription` según cada caso.)

- [ ] **Step 3: Ejecutar → falla**

Run: `pnpm vitest run src/components/empleado/AvisosCard.test.tsx`
Expected: FAIL (componente no existe).

- [ ] **Step 4: Implementar `AvisosCard.tsx`**

Client component. En `useEffect`: calcular `soportado`, `standalone`, `ios`, `permiso` (`Notification.permission`), `yaSuscrito` (`await reg.pushManager.getSubscription()`). Render según la tabla §9.5, con clases de marca. `onClick` "Activar avisos" → `activarAvisos()` y manejar los 3 resultados con `useToast().mostrar(...)` (cero alert). "Desactivar" → `desactivarAvisos()` + volver a estado botón. La acción de permiso **solo** en `onClick`.

- [ ] **Step 5: Ejecutar → pasa**

Run: `pnpm vitest run src/components/empleado/AvisosCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Insertar `<AvisosCard/>` en `page.tsx`**

Importar e insertar tras la barra superior (§9.3), antes de la tarjeta de comidas.

- [ ] **Step 7: Type-check + build**

Run: `npx tsc --noEmit -p tsconfig.json && npx next build`
Expected: sin errores; build OK.

- [ ] **Step 8: Commit**
```bash
git add src/components/empleado/AvisosCard.tsx src/components/empleado/AvisosCard.test.tsx src/app/empleado/page.tsx
git commit -m "feat(push): tarjeta Activar avisos en la home (cero alert)"
```

---

## Task 11: Iconos de notificación

**Files:**
- Create: `public/icons/icon-192.png` (192×192)
- Create: `public/icons/badge-72.png` (72×72, monocromo para Android)

- [ ] **Step 1: Generar los PNG**

Derivar de `public/icons/vales.svg` (marca Aceros). `icon-192` a color; `badge-72` monocromo (silueta blanca sobre transparente, requisito de Android). Herramienta a elección (sharp, ImageMagick, o export manual).

- [ ] **Step 2: Verificar dimensiones**

Run:
```bash
node -e "const s=require('fs').statSync('public/icons/icon-192.png'); console.log('icon-192 ok', s.size>0)"
node -e "const s=require('fs').statSync('public/icons/badge-72.png'); console.log('badge-72 ok', s.size>0)"
```
Expected: ambos `ok true`. (Confirmar 192×192 y 72×72 con el visor de imágenes.)

- [ ] **Step 3: Commit**
```bash
git add public/icons/icon-192.png public/icons/badge-72.png
git commit -m "feat(push): iconos de notificacion (192 + badge 72)"
```

---

## Task 12: Disparadores (encadenado, edge→edge, cron)

**Files:**
- Modify: `supabase/functions/generar-otp-comidas/index.ts` (encadenar `codigo_listo`)
- Modify: `supabase/functions/crear-comida/index.ts` (enganche `comida_nueva`) — **coordinar con el WIP**
- Create: `supabase/migrations/0013_push_crons.sql` (cron recordatorio)

- [ ] **Step 1: Encadenar `codigo_listo` en `generar-otp-comidas`**

Tras generar/actualizar todos los OTP del día, añadir el bloque `try/catch` de spec §10.1 (fetch a `enviar-push` con `{tipo:"codigo_listo"}` y bearer `SUPABASE_SERVICE_ROLE_KEY`). No debe alterar la respuesta de la función.

- [ ] **Step 2: Redesplegar `generar-otp-comidas`**

Desplegar (MCP `deploy_edge_function`, mantener `verify_jwt: true`).
Expected: deploy OK. Invocarla a mano (con service_role) y confirmar en logs que encadena `enviar-push` (`{ ok:true, ... }` en el log) sin romper la generación.

- [ ] **Step 3: Enganche `comida_nueva` en `crear-comida`**

**Precondición:** revisar el estado de `supabase/functions/crear-comida/index.ts` (WIP). Localizar el punto tras el insert exitoso en `rnd_reembolsos` (donde ya dispara WhatsApp) y añadir el bloque `try/catch` de spec §10.2 con `{tipo:"comida_nueva", empleado_id}`. Si el WIP aún no está commiteado, coordinar para no pisarlo (rebase/merge del WIP primero, o aplicar el enganche sobre su versión vigente).

- [ ] **Step 4: Redesplegar `crear-comida`**

Desplegar. Crear una comida de prueba y confirmar en logs el disparo `comida_nueva` sin abortar la creación. Limpiar la comida de prueba.

- [ ] **Step 5: Escribir la migración del cron recordatorio**

`supabase/migrations/0013_push_crons.sql`: copiar de spec §10.3 (`create extension if not exists pg_cron; create extension if not exists pg_net;` + `cron.schedule('enviar-push-recordatorio','0 22 * * 1-5', ...)` con bearer del Vault).

- [ ] **Step 6: Aplicar el cron en PROD (manual, aviso operativo)**

Como en `0008`, aplicar el `cron.schedule` a mano en el SQL editor para no colisionar con jobs vivos. Verificar:
```sql
select jobname, schedule from cron.job where jobname = 'enviar-push-recordatorio';
```
Expected: una fila con `0 22 * * 1-5`.

- [ ] **Step 7: Commit**
```bash
git add supabase/functions/generar-otp-comidas/index.ts supabase/functions/crear-comida/ supabase/migrations/0013_push_crons.sql
git commit -m "feat(push): disparadores (codigo_listo encadenado, comida_nueva, cron recordatorio)"
```

---

## Task 13: Verificación end-to-end y deploy

**Files:** ninguno (verificación) + merge.

- [ ] **Step 1: Suite completa + build**

Run: `pnpm vitest run && npx tsc --noEmit -p tsconfig.json && npx next build`
Expected: todo verde.

- [ ] **Step 2: Merge a master y deploy**

```bash
git checkout master
git merge --no-ff feat/push-notificaciones -m "feat(push): notificaciones push app empleados"
git push origin master
```
Expected: Netlify construye un deploy nuevo (con `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya presentes).

- [ ] **Step 3: Verificación manual en dispositivos**

Ejecutar la checklist de spec §14.2 (Android Chrome, iOS 16.4+ instalada, invocación manual de cada tipo, revocación/limpieza 404-410, estado denegado, desactivar). Confirmar que llega cada uno de los 3 avisos y que tocar la notificación abre `/empleado`.

- [ ] **Step 4: Actualizar memoria**

Actualizar `app-empleados-progreso.md`: push notifications → HECHO (con eventos, rutas, y secretos configurados). Mover la nota de "siguiente módulo" a "hecho".

---

## Notas de implementación

- **Cero `alert/confirm/prompt`** en todo el flujo (ver [[no-usar-alert]]): usar `useToast` y mensajes inline.
- **Orden de dependencia:** Task 1 (secretos) antes de probar 4/12; Task 3 (spike API) antes de 4; Task 2 antes de 4/5; 8–9 antes de 10.
- **service_role en Netlify** es server-only: nunca `NEXT_PUBLIC`, nunca en un client component.
- **`crear-comida` es WIP:** la Task 12.3 se coordina con ese trabajo sin commitear.
