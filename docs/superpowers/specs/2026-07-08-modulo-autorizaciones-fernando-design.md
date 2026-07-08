# Módulo de Autorizaciones (Lic Fernando) — Diseño

**Fecha:** 2026-07-08
**Alcance:** DOS sistemas que comparten la misma base de datos Supabase:
1. `V3 Reembolsos SQL.html` — HTML monolítico **en uso HOY** (`C:\Users\USUARIO\Desktop\Devoluciones AC\V3 Reembolsos SQL.html`).
2. `devoluciones-ac-web` — proyecto React/Next.js que reemplazará al HTML (migración en curso).
**Autor de la solicitud:** administración (reembolsos Aceros)

> **Nota sobre versiones de HTML:** en el escritorio hay V1–V4. El vigente es **V3**
> (modificado el 3-jul-2026, el más reciente). El proyecto React cita en comentarios
> un "V4 Sin papel.html", pero ese archivo es más antiguo (26-may-2026) y NO es el
> que se usa. Todo el trabajo en HTML va sobre **V3**.

> **Base de datos compartida:** ambos sistemas leen/escriben la misma tabla
> `rnd_reembolsos` en el mismo proyecto Supabase. Por eso la migración de columnas
> (§ BD) se hace UNA vez y sirve a los dos, y los estados/flujo son idénticos.

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

El trabajo se divide en tres bloques: **(0) BD común**, **(A) React** y **(B) HTML V3**.
La BD se toca una sola vez; A y B son implementaciones independientes del mismo
diseño sobre esa BD.

---

## Bloque 0 — Base de datos (común a ambos sistemas)

Nueva migración (p. ej. `supabase/migrations/0006_autorizacion_columnas.sql` dentro
de `devoluciones-ac-web`, aplicada al proyecto Supabase compartido):

```sql
alter table rnd_reembolsos
  add column if not exists motivo_rechazo     text,
  add column if not exists autorizado_por     text,
  add column if not exists fecha_autorizacion timestamptz;
```

Como la BD es compartida, con aplicarla una vez ambos sistemas pueden escribir esas
columnas. En React, además, actualizar `src/types/db.ts` con los 3 campos. En el
HTML no hay tipos que actualizar.

---

## Bloque A — Proyecto React (`devoluciones-ac-web`)

Sigue las 4 capas del proyecto (eslint-plugin-boundaries): `domain` → `lib` →
`components` → `app`. Se reutiliza al máximo lo existente.

### A1. Dominio — `packages/domain/src/roles.ts`

- Añadir `"autorizador"` a `ROLES`.
- Añadir `"autorizaciones"` a la unión `TabId`.
- En `normalizarRol()`: mapear `autorizador → autorizador` (antes de la caída a `caja_chica`).
- En `ROL_TABS`: `autorizador: ["autorizaciones"]`.

> El middleware (`src/middleware.ts`) protegerá la ruta automáticamente porque
> deriva los tabs conocidos de `ROL_TABS`. No requiere cambios extra.

### A2. Capa de datos — `src/lib/supabase/queries/autorizacion.ts`

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

### A3. Hook — `src/lib/hooks/useAutorizacion.ts`

```ts
export function useAutorizarLote()  // useMutation -> autorizarLote
export function useRechazarLote()   // useMutation -> rechazarLote
```

### A4. Página — `src/app/(app)/autorizaciones/page.tsx` (`"use client"`)

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

### A5. Tabla de detalle con comprobantes

Variante del `TablaDetalle` de Entregas. Columnas: Beneficiario, Concepto, Monto,
Fecha, **Comprobantes**. Los archivos se leen del campo `archivos` (JSONB) con
`normalizarArchivos()` del dominio; por cada archivo, un botón/enlace **"Ver"** que
abre `archivo.url` en pestaña nueva (`target="_blank" rel="noopener"`). Si un
reembolso no tiene archivos, se muestra "—".

### A6. Sidebar — `src/components/nav/Sidebar.tsx`

Añadir la entrada del nuevo tab:
- `ETIQUETAS["autorizaciones"] = "Autorizaciones"`.
- `ICONOS["autorizaciones"]` = ícono SVG inline (p. ej. check-circle / sello).
- Incluir `"autorizaciones"` en `RUTAS_EXISTENTES`.

### A7. Eliminar el correo del flujo de corte

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

### A8. Interacción (UX de las acciones en React)

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

---

## Bloque B — HTML monolítico (`V3 Reembolsos SQL.html`)

Mismo diseño, adaptado al patrón del HTML (todo en un archivo: pestañas
`data-role`, paneles `<div class="tab-content">`, `showTab()`, `configurarPermisos()`,
llamadas directas a `supabase.from('rnd_reembolsos')`). Se reutiliza el mismo estilo
visual del propio HTML (las tarjetas de lote ya existentes en la vista de Revisión /
Entregas — badges de estado `status-*`, tabla de detalle con comprobantes).

### B1. Rol nuevo `autorizador`

- El login del HTML ya lee `rol` de `rnd_usuarios` y lo normaliza a minúsculas
  (`V3` líneas ~1725-1735). No hay lista blanca de roles: cualquier rol funciona
  mientras coincida con algún `data-role`. Basta con que el usuario de Fernando
  tenga `rol = "autorizador"`.
- `configurarPermisos()` (V3 ~1900) ya muestra/oculta pestañas comparando el rol
  contra el atributo `data-role` de cada `.nav-tab`. Al añadir una pestaña con
  `data-role="autorizador"`, Fernando verá solo esa.

### B2. Nueva pestaña y panel

- Añadir el botón de pestaña junto a los demás (V3 ~1094-1116):
  ```html
  <button class="nav-tab" onclick="showTab('autorizaciones')" data-role="autorizador">
      <i class="fas fa-stamp"></i> Autorizaciones
  </button>
  ```
- Añadir el panel de contenido (junto a los otros `tab-content`, V3 ~1258+):
  ```html
  <div id="autorizaciones" class="tab-content">
      <div id="listaAutorizaciones"><!-- render dinámico --></div>
  </div>
  ```
- En `showTab()` (V3 ~5061), añadir la rama:
  `else if (tabName === 'autorizaciones') { cargarAutorizaciones(); }`

### B3. Render — `cargarAutorizaciones()`

Nueva función JS que:
- Filtra `reembolsos.filter(r => r.estado === 'en_corte')` (todas las sucursales).
- Agrupa por `numero_lote` (reutilizar/espejar la lógica de agrupación de lotes ya
  presente en la vista de entregas, V3 ~3094-3099 / ~4583-4612).
- Por cada lote pinta una tarjeta con el estilo existente (badge sucursal, nº
  reembolsos, total, botón "Ver Detalle" que despliega la tabla con **columna de
  Comprobantes**: por cada archivo en `r.archivos`, un enlace "Ver" que abre la URL
  en pestaña nueva — el HTML ya tiene `verDetalles()`/manejo de archivos que se
  puede reaprovechar).
- Dos botones por lote: **Autorizar** (verde) y **Rechazar** (rojo).
- Si no hay lotes: "No hay lotes pendientes de autorizar".

### B4. Acciones — `autorizarLoteHTML()` / `rechazarLoteHTML()`

Espejo del patrón que ya usa `enviarSolicitudAutorizacion` (V3 ~5241) para
actualizar estados en Supabase:
- **Autorizar:** `confirm(...)` → por cada reembolso del lote,
  `supabase.from('rnd_reembolsos').update({ estado:'aprobado', autorizado_por: currentUser.nombre, fecha_autorizacion: new Date().toISOString() }).eq('id', r.id)`.
- **Rechazar:** `prompt('Motivo del rechazo (opcional):')` (o dejar vacío) →
  `update({ estado:'rechazado', motivo_rechazo, autorizado_por, fecha_autorizacion })`.
- Tras actualizar: `await cargarDatos()` + `cargarAutorizaciones()` + `mostrarNotificacion(...)`.

> El HTML usa `confirm()`/`prompt()`/`mostrarNotificacion()` en todo el flujo; se
> mantiene ese estilo (no se introducen modales nuevos).

### B5. Quitar el correo del corte en V3

En `enviarSolicitudAutorizacion` (V3 ~5241) y `enviarCorreoAutorizacion` (V3 ~5399):
que el botón "Enviar Correo a Fernando" (V3 ~3770) ya no dependa del correo. La
transición `pendiente → en_corte` con su `numero_lote` ya se hace en el bloque
`if (response.success)` (V3 ~5318-5340); el cambio es **saltarse el envío de correo
y pasar directo a actualizar estados** (o hacerlo condicional). Actualizar el texto
del botón a algo como "Enviar a corte". El resto del flujo del HTML no cambia.

> Alternativa conservadora (a decidir en el plan): dejar el correo como estaba pero
> añadir el módulo de Fernando; así ambos caminos funcionan durante la transición.
> La decisión del usuario fue **eliminar el correo**, así que por defecto se quita.

---

## Manejo de errores

- Update fila por fila: se cuenta `actualizados`; si alguna fila falla, se informa
  cuántas se actualizaron (mismo comportamiento tolerante que `entregas.ts`).
- Botones deshabilitados mientras `isPending` (evita doble clic).
- Si el correo se elimina del corte y algo dependía de él, no hay efecto: el corte
  solo cambia estado; el resto del flujo ya lee de la BD.

## Testing

**React (Vitest):**
- `autorizacion.test.ts` (capa lib): mock del cliente Supabase; verifica que
  `autorizarLote` escribe `estado: "aprobado"` + trazabilidad, y `rechazarLote`
  escribe `estado: "rechazado"` + `motivo_rechazo`, contando filas actualizadas.
- `roles.test.ts` (dominio): añadir casos para `normalizarRol("autorizador")` y
  `ROL_TABS.autorizador`.

**HTML V3:** no tiene tests automatizados (nunca los ha tenido). Validación manual
end-to-end: crear un lote de prueba, mandarlo a corte, entrar como Fernando, ver el
comprobante, Autorizar → verificar que pasa a `aprobado` con `autorizado_por` y
`fecha_autorizacion`; repetir con Rechazar + motivo.

## Fuera de alcance (YAGNI)

- Historial de autorizaciones para Fernando (solo ve pendientes).
- Autorización de reembolsos individuales dentro de un lote.
- Notificaciones push / correo de respaldo.
- RLS / hash de contraseñas (deuda de seguridad conocida del proyecto, fase aparte).
- Filtro por sucursal (ve todas).

## Archivos afectados (checklist de implementación)

### Bloque 0 — BD (una vez, sirve a ambos)
- **Nuevo:** `devoluciones-ac-web/supabase/migrations/0006_autorizacion_columnas.sql`
- Aplicar la migración al proyecto Supabase compartido.

### Bloque A — React (`devoluciones-ac-web`)
**Nuevos:**
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

### Bloque B — HTML (`V3 Reembolsos SQL.html`, un solo archivo)
- Nueva pestaña `autorizaciones` con `data-role="autorizador"` (botón + panel `tab-content`).
- Rama en `showTab()` para `autorizaciones`.
- Funciones nuevas: `cargarAutorizaciones()`, `autorizarLoteHTML()`, `rechazarLoteHTML()`.
- Quitar/condicionar el correo en `enviarSolicitudAutorizacion` / `enviarCorreoAutorizacion`; actualizar texto del botón.

### Operativo (fuera de código)
- Crear/ajustar el usuario de Fernando en `rnd_usuarios` con `rol = "autorizador"` y `activo = true`.
  Sirve para ambos sistemas (login compartido contra la misma tabla).

## Orden sugerido de implementación
1. **Bloque 0** (migración BD) — desbloquea a los otros dos.
2. **Bloque B** (HTML V3) — es el sistema en uso HOY; resuelve el problema de inmediato.
3. **Bloque A** (React) — deja el módulo listo en el sistema que reemplazará al HTML.
4. **Operativo** — crear el usuario de Fernando (se puede hacer antes de B para probar).
