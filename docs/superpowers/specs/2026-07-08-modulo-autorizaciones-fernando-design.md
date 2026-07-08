# Módulo de Autorizaciones (Lic Fernando) — Diseño

**Fecha:** 2026-07-08
**Proyecto:** `devoluciones-ac-web` (Next.js 16, React 19, TS, Tailwind 4, React Query, Supabase)
**Autor de la solicitud:** administración (reembolsos Aceros)

## Problema

Hoy, cuando caja chica manda un lote de reembolsos "a corte", el sistema envía un
**correo** al Lic Fernando (vía Google Apps Script). Fernando responde el correo
con "AUTORIZO" o "RECHAZO", y ese proceso externo mueve los reembolsos a
`aprobado` / `rechazado`.

**El correo se le traspapela y se le pierde.** Se necesita un módulo web donde
Fernando entre, vea los lotes pendientes de autorizar, los revise (incluyendo
comprobantes) y decida ahí mismo — sin depender del correo.

## Solución (resumen)

Un nuevo módulo/pestaña **"Autorizaciones"**, visible solo para un rol nuevo
`autorizador`. Fernando inicia sesión con el login existente (`rnd_usuarios`),
ve **solo** los lotes en estado `en_corte` de **todas las sucursales**, agrupados
por `numero_lote`, y sobre cada lote presiona **Autorizar** o **Rechazar**. La app
actualiza el estado directamente en Supabase (mismo patrón que ya usa el proyecto
para "corte" y "entregas"). **Se elimina la dependencia del correo/Apps Script**
en el flujo de corte.

## Flujo de estados

El flujo de estados NO cambia; cambia *quién* y *dónde* se dispara la transición
`en_corte → aprobado | rechazado`.

```
caja_chica                 Fernando (NUEVO módulo web)          admin
pendiente ──envía a corte──▶ en_corte ──Autorizar──▶ aprobado ──▶ Entregas
             (sin correo)             └─Rechazar──▶ rechazado
```

La transición `en_corte → {aprobado, rechazado}` YA está permitida en la máquina
de estados del dominio (`packages/domain/src/estados.ts` — `TRANSICIONES`), no hay
que tocarla.

## Decisiones de diseño (confirmadas con el usuario)

1. **Cambio de estado:** la app actualiza Supabase directo (no correo, no Apps Script).
2. **Correo a corte:** se ELIMINA. Al mandar a corte, el lote solo aparece en el módulo de Fernando.
3. **Granularidad:** decisión por **lote completo** (no reembolsos individuales).
4. **Alcance:** Fernando ve lotes de **todas las sucursales**.
5. **Pantalla:** solo **pendientes** (`en_corte`). Sin historial.
6. **Comprobantes:** Fernando **sí** puede ver los comprobantes (imágenes/PDF) de cada reembolso.
7. **Confirmación:** confirmación simple antes de aplicar (con motivo opcional en rechazo).
8. **Motivo de rechazo:** **opcional**, guardado en **nueva columna** `motivo_rechazo`.
9. **Trazabilidad:** se registra **quién** (nombre de Fernando) y **cuándo** (timestamp), tanto al autorizar como al rechazar.
10. **Rol nuevo:** `autorizador`; pestaña **"Autorizaciones"**.

## Arquitectura y componentes

Sigue las 4 capas del proyecto (eslint-plugin-boundaries): `domain` → `lib` →
`components` → `app`. Se reutiliza al máximo lo existente.

### 1. Dominio — `packages/domain/src/roles.ts`

- Añadir `"autorizador"` a `ROLES`.
- Añadir `"autorizaciones"` a la unión `TabId`.
- En `normalizarRol()`: mapear `autorizador → autorizador` (antes de la caída a `caja_chica`).
- En `ROL_TABS`: `autorizador: ["autorizaciones"]`.

> El middleware (`src/middleware.ts`) protegerá la ruta automáticamente porque
> deriva los tabs conocidos de `ROL_TABS`. No requiere cambios extra.

### 2. Base de datos — migración Supabase

Nueva migración (p. ej. `supabase/migrations/0006_autorizacion_columnas.sql`):

```sql
alter table rnd_reembolsos
  add column if not exists motivo_rechazo    text,
  add column if not exists autorizado_por    text,
  add column if not exists fecha_autorizacion timestamptz;
```

Después, regenerar/actualizar `src/types/db.ts` (o añadir los 3 campos a mano en
la definición de `rnd_reembolsos`, que es como se ha manejado antes).

### 3. Capa de datos — `src/lib/supabase/queries/autorizacion.ts`

Funciones puras (patrón idéntico a `entregas.ts`), update fila por fila con el
cliente browser:

```ts
export interface AutorizarResult { ok: boolean; actualizados?: number; error?: string }

// Autoriza todos los reembolsos de un lote: estado -> "aprobado"
export async function autorizarLote(
  ids: string[],
  autorizadoPor: string,
): Promise<AutorizarResult>

// Rechaza todos los reembolsos de un lote: estado -> "rechazado" (+ motivo opcional)
export async function rechazarLote(
  ids: string[],
  autorizadoPor: string,
  motivo?: string,
): Promise<AutorizarResult>
```

Ambas escriben `estado`, `autorizado_por`, `fecha_autorizacion` (y `motivo_rechazo`
en el rechazo), y `updated_at`. Cuentan filas actualizadas igual que
`solicitarEntrega`.

### 4. Hook — `src/lib/hooks/useAutorizacion.ts`

```ts
export function useAutorizarLote()  // useMutation -> autorizarLote
export function useRechazarLote()   // useMutation -> rechazarLote
```

### 5. Página — `src/app/(app)/autorizaciones/page.tsx` (`"use client"`)

Clona la estructura de `entregas/page.tsx`:

- `useReembolsos({ estado: "en_corte", page: 0, pageSize: 500 })`.
- `agruparPorLote(rows, "numero_lote")`.
- Buscador en cliente por lote / sucursal / beneficiario.
- `PageHeader titulo="Autorizaciones"`.
- Un `<LoteCard>` por grupo:
  - `acentoColor="border-l-blue-500"` (color de `en_corte`), `chipTono` por sucursal.
  - Slot `accion`: **dos botones** — Autorizar (verde `bg-emerald-600`) y Rechazar (rojo `bg-red-600`).
  - Slot `detalle`: tabla de reembolsos con columna extra **Comprobantes**.
- Al éxito: `queryClient.invalidateQueries({ queryKey: ["reembolsos"] })` + mensaje de banda.
- Vacío: *"No hay lotes pendientes de autorizar."*

### 6. Tabla de detalle con comprobantes

Variante del `TablaDetalle` de Entregas. Columnas: Beneficiario, Concepto, Monto,
Fecha, **Comprobantes**. Los archivos se leen del campo `archivos` (JSONB) con
`normalizarArchivos()` del dominio; por cada archivo, un botón/enlace **"Ver"** que
abre `archivo.url` en pestaña nueva (`target="_blank" rel="noopener"`). Si un
reembolso no tiene archivos, se muestra "—".

### 7. Sidebar — `src/components/nav/Sidebar.tsx`

Añadir la entrada del nuevo tab:
- `ETIQUETAS["autorizaciones"] = "Autorizaciones"`.
- `ICONOS["autorizaciones"]` = ícono SVG inline (p. ej. check-circle / sello).
- Incluir `"autorizaciones"` en `RUTAS_EXISTENTES`.

### 8. Eliminar el correo del flujo de corte

En `src/lib/supabase/queries/corte.ts` (`enviarACorte`): dejar de llamar al Apps
Script `ENVIAR_CORREO_AUTORIZACION`. El corte solo debe hacer el `update({ estado:
"en_corte", numero_lote })` de cada reembolso. Concretamente: eliminar la constante
`APPS_SCRIPT_URL`, la función `enviarCorreoAppsScript`, la construcción de
`dataCorreo` y la guarda `if (!correo.success) …`; dejar solo la validación de lote
y el loop de `update`. Los campos `emailRemitente` de `EnviarACorteInput` (y el
resto del payload de correo) quedan sin uso; se pueden conservar por compatibilidad
de la firma o limpiar en la misma edición (decisión menor del plan).

En `src/app/(app)/revision/page.tsx`: actualizar textos ("Enviar a corte (correo a
Fernando)" → "Enviar a corte", y el texto de la sección "esperando respuesta" que
menciona que Fernando responde por correo).

## Interacción (UX de las acciones)

**Autorizar:**
1. Confirmación: *"¿Autorizar el lote {lote} ({n} reembolsos, total {$})?"*
2. `autorizarLote(ids, sesion.nombre)` → `estado: "aprobado"`.
3. Mensaje ✅ + el lote desaparece de pendientes (query invalidada).

**Rechazar:**
1. Confirmación con campo de motivo opcional: *"¿Rechazar el lote {lote}? Motivo (opcional):"*
2. `rechazarLote(ids, sesion.nombre, motivo)` → `estado: "rechazado"` (+ `motivo_rechazo`).
3. Mensaje + el lote desaparece de pendientes.

> Nota: el proyecto usa `confirm()`/mensajes de banda en el resto de módulos. Para
> el motivo (que `confirm()` no captura) se usará un pequeño estado local que
> muestre un input en la tarjeta al presionar Rechazar (mini-formulario inline,
> como el input de evidencia en Entregas), evitando introducir una librería de
> modales.

## Manejo de errores

- Update fila por fila: se cuenta `actualizados`; si alguna fila falla, se informa
  cuántas se actualizaron (mismo comportamiento tolerante que `entregas.ts`).
- Botones deshabilitados mientras `isPending` (evita doble clic).
- Si el correo se elimina del corte y algo dependía de él, no hay efecto: el corte
  solo cambia estado; el resto del flujo ya lee de la BD.

## Testing (Vitest)

- `autorizacion.test.ts` (capa lib): mock del cliente Supabase; verifica que
  `autorizarLote` escribe `estado: "aprobado"` + trazabilidad, y `rechazarLote`
  escribe `estado: "rechazado"` + `motivo_rechazo`, contando filas actualizadas.
- `roles.test.ts` (dominio): añadir casos para `normalizarRol("autorizador")` y
  `ROL_TABS.autorizador`.

## Fuera de alcance (YAGNI)

- Historial de autorizaciones para Fernando (solo ve pendientes).
- Autorización de reembolsos individuales dentro de un lote.
- Notificaciones push / correo de respaldo.
- RLS / hash de contraseñas (deuda de seguridad conocida del proyecto, fase aparte).
- Filtro por sucursal (ve todas).

## Archivos afectados (checklist de implementación)

**Nuevos:**
- `supabase/migrations/0006_autorizacion_columnas.sql`
- `src/lib/supabase/queries/autorizacion.ts`
- `src/lib/hooks/useAutorizacion.ts`
- `src/app/(app)/autorizaciones/page.tsx`
- `src/lib/supabase/queries/autorizacion.test.ts`

**Modificados:**
- `packages/domain/src/roles.ts` (+ `roles.test.ts`)
- `src/types/db.ts` (3 columnas nuevas)
- `src/components/nav/Sidebar.tsx`
- `src/lib/supabase/queries/corte.ts` (quitar correo)
- `src/app/(app)/revision/page.tsx` (textos)

**Operativo (fuera de código):**
- Crear/ajustar el usuario de Fernando en `rnd_usuarios` con `rol = "autorizador"` y `activo = true`.
