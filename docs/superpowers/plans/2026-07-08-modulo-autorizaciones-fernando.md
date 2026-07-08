# Módulo de Autorizaciones (Lic Fernando) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Lic Fernando autorice/rechace lotes de reembolsos dentro de la app (en el HTML V3 en uso hoy y en el proyecto React), en vez de por correo.

**Architecture:** Ambos sistemas comparten la BD Supabase. Se añaden 3 columnas a `rnd_reembolsos` (una vez). En cada sistema se agrega un rol `autorizador` con una sola pantalla que lista los lotes `en_corte` (todas las sucursales), permite ver comprobantes y presionar Autorizar/Rechazar, actualizando el estado directo en Supabase. Se elimina el correo/Apps Script del flujo de corte.

**Tech Stack:** Supabase (Postgres), HTML+JS vanilla (V3), Next.js 16 / React 19 / TypeScript / Tailwind 4 / React Query (devoluciones-ac-web), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-modulo-autorizaciones-fernando-design.md`

**Rutas absolutas:**
- HTML V3: `C:\Users\USUARIO\Desktop\Devoluciones AC\V3 Reembolsos SQL.html`
- React: `C:\Users\USUARIO\Desktop\Devoluciones AC\devoluciones-ac-web\`

---

## File Structure

**BD (una vez):**
- Crear: `devoluciones-ac-web/supabase/migrations/0006_autorizacion_columnas.sql` — 3 columnas nuevas.

**HTML V3 (un solo archivo, `V3 Reembolsos SQL.html`):**
- Modificar navegación: botón de pestaña `autorizaciones`.
- Modificar paneles: `<div id="autorizaciones" class="tab-content">`.
- Modificar `showTab()`: rama `autorizaciones`.
- Añadir funciones JS: `cargarAutorizaciones()`, `autorizarLoteHTML()`, `rechazarLoteHTML()`.
- Modificar `enviarSolicitudAutorizacion()`: quitar dependencia del correo.

**React (`devoluciones-ac-web`):**
- Modificar `packages/domain/src/roles.ts` (+ test).
- Modificar `src/types/db.ts`.
- Crear `src/lib/supabase/queries/autorizacion.ts` (+ test).
- Crear `src/lib/hooks/useAutorizacion.ts`.
- Crear `src/app/(app)/autorizaciones/page.tsx`.
- Modificar `src/components/nav/Sidebar.tsx`.
- Modificar `src/lib/supabase/queries/corte.ts`.
- Modificar `src/app/(app)/revision/page.tsx`.

---

## FASE 0 — Base de datos (común)

### Task 0.1: Migración de columnas de autorización

**Files:**
- Create: `devoluciones-ac-web/supabase/migrations/0006_autorizacion_columnas.sql`

- [ ] **Step 1: Escribir la migración**

Archivo `devoluciones-ac-web/supabase/migrations/0006_autorizacion_columnas.sql`:

```sql
-- Columnas para el módulo de autorización del Lic Fernando.
-- motivo_rechazo: texto opcional que Fernando escribe al rechazar un lote.
-- autorizado_por: nombre de quien autorizó/rechazó (trazabilidad).
-- fecha_autorizacion: timestamp de la decisión.
alter table rnd_reembolsos
  add column if not exists motivo_rechazo     text,
  add column if not exists autorizado_por     text,
  add column if not exists fecha_autorizacion timestamptz;
```

- [ ] **Step 2: Aplicar la migración al proyecto Supabase**

Aplicar vía la herramienta MCP de Supabase (`apply_migration` con name `autorizacion_columnas` y el SQL de arriba) o `supabase db push`. Confirmar sin error.

- [ ] **Step 3: Verificar que las columnas existen**

Ejecutar (MCP `execute_sql` o SQL editor):

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'rnd_reembolsos'
  and column_name in ('motivo_rechazo','autorizado_por','fecha_autorizacion');
```

Expected: 3 filas devueltas (motivo_rechazo=text, autorizado_por=text, fecha_autorizacion=timestamp with time zone).

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web"
git add supabase/migrations/0006_autorizacion_columnas.sql
git commit -m "feat(db): columnas de autorización en rnd_reembolsos"
```

---

## FASE 0b — Usuario de Fernando (operativo)

### Task 0b.1: Crear/ajustar usuario autorizador en rnd_usuarios

**Files:** ninguno (operación en BD).

- [ ] **Step 1: Ver si Fernando ya existe**

```sql
select email, nombre, rol, activo from rnd_usuarios
where email ilike '%fernando%' or nombre ilike '%fernando%';
```

- [ ] **Step 2: Crear o actualizar**

Si NO existe, insertar (ajustar email/password reales con el usuario):

```sql
insert into rnd_usuarios (email, password, nombre, rol, sucursal, activo)
values ('fernando@aceros.com', 'CAMBIAR_PASSWORD', 'Lic Fernando Balderrama', 'autorizador', '', true);
```

Si YA existe, solo cambiar el rol:

```sql
update rnd_usuarios set rol = 'autorizador', activo = true
where email = 'CORREO_DE_FERNANDO';
```

> Nota de seguridad: las contraseñas están en texto plano en este sistema (deuda conocida, fase aparte). No inventar el correo/clave: confirmarlos con el usuario antes de ejecutar.

- [ ] **Step 3: Verificar**

```sql
select email, nombre, rol, activo from rnd_usuarios where rol = 'autorizador';
```

Expected: la fila de Fernando con rol `autorizador` y activo `true`.

---

## FASE 1 — HTML V3 (sistema en uso hoy)

> Todo en el archivo `V3 Reembolsos SQL.html`. NO hay tests automatizados; se valida
> manualmente al final. Hacer un backup antes de empezar (Task 1.0).

### Task 1.0: Backup del HTML

**Files:**
- Create: `V3 Reembolsos SQL.backup-antes-autorizaciones.html`

- [ ] **Step 1: Copiar el archivo**

```bash
cd "C:/Users/USUARIO/Desktop/Devoluciones AC"
cp "V3 Reembolsos SQL.html" "V3 Reembolsos SQL.backup-antes-autorizaciones.html"
ls -la "V3 Reembolsos SQL.backup-antes-autorizaciones.html"
```

Expected: el backup existe con el mismo tamaño que el original.

### Task 1.1: Añadir la pestaña de navegación

**Files:**
- Modify: `V3 Reembolsos SQL.html` (bloque `.nav-tabs`, ~línea 1113)

- [ ] **Step 1: Insertar el botón de pestaña**

Localizar el último botón de nav (`pago-comidas`, ~1113-1115):

```html
            <button class="nav-tab" onclick="showTab('pago-comidas')" data-role="caja_chica,admin">
                <i class="fas fa-cash-register"></i> Pago Comidas
            </button>
```

Añadir INMEDIATAMENTE DESPUÉS (antes del `</div>` que cierra `.nav-tabs`):

```html
            <button class="nav-tab" onclick="showTab('autorizaciones')" data-role="autorizador">
                <i class="fas fa-stamp"></i> Autorizaciones
            </button>
```

- [ ] **Step 2: Verificación visual**

Abrir el HTML en navegador, hacer login como admin (que NO tiene `autorizador`) → la pestaña Autorizaciones NO debe verse. (Se probará que SÍ aparece para Fernando en Task 1.7.)

### Task 1.2: Añadir el panel de contenido

**Files:**
- Modify: `V3 Reembolsos SQL.html` (junto a los otros `tab-content`, después del panel `pago-comidas` ~1437)

- [ ] **Step 1: Insertar el panel**

Localizar el inicio del panel `pago-comidas` (~línea 1437: `<div id="pago-comidas" class="tab-content">`) y su `</div>` de cierre. Después de ese cierre, insertar:

```html
        <!-- ============ AUTORIZACIONES (Lic Fernando) ============ -->
        <div id="autorizaciones" class="tab-content">
            <div class="section-title" style="margin-bottom: 20px;">
                <h2 style="color: var(--adp-primary);"><i class="fas fa-stamp"></i> Autorizaciones</h2>
                <p style="color: var(--adp-gray);">Revisa y autoriza los lotes de reembolsos pendientes</p>
            </div>
            <div style="margin-bottom: 15px;">
                <input type="text" class="form-control" id="buscarAutorizaciones"
                       placeholder="Buscar por lote, sucursal o beneficiario…"
                       oninput="cargarAutorizaciones()" style="max-width: 400px;">
            </div>
            <div id="listaAutorizaciones"></div>
        </div>
```

- [ ] **Step 2: Verificación**

Guardar. No hay cambio visible aún (el panel está oculto hasta activarse en showTab).

### Task 1.3: Añadir la rama en showTab()

**Files:**
- Modify: `V3 Reembolsos SQL.html` (`showTab()`, ~línea 5091)

- [ ] **Step 1: Añadir la rama**

En `showTab()`, localizar la última rama (`pago-comidas`, ~5091-5092):

```javascript
                        } else if (tabName === 'pago-comidas') {
                            cargarComidasParaPago();
                        }
```

Reemplazar por (añadiendo la rama nueva antes del cierre):

```javascript
                        } else if (tabName === 'pago-comidas') {
                            cargarComidasParaPago();
                        } else if (tabName === 'autorizaciones') {
                            cargarAutorizaciones();
                        }
```

- [ ] **Step 2: Verificación**

Guardar. (Se prueba junto con la función en Task 1.4.)

### Task 1.4: Función cargarAutorizaciones()

**Files:**
- Modify: `V3 Reembolsos SQL.html` (añadir función JS cerca de las otras de carga, p. ej. después de `cargarReembolsosEnTabs()` ~línea 5127)

- [ ] **Step 1: Escribir la función**

Insertar esta función (usa la global `reembolsos`, `getEstadoColor` ya existe, y el helper `verArchivosReembolso` para comprobantes):

```javascript
        // ============ MÓDULO AUTORIZACIONES (Lic Fernando) ============
        // Nombres de sucursal (mismo mapa que generarVistaAgrupadaPorLotes).
        const NOMBRES_SUCURSALES_AUTZ = {
            'LMM': 'Los Mochis', 'JJR': 'Juan José Ríos', 'CLN': 'Culiacán',
            'FTE': 'El Fuerte', 'SJC': 'San José del Cabo', 'CSL': 'Cabo San Lucas',
            'TML': 'Tamaral', 'LPZ': 'La Paz'
        };

        function cargarAutorizaciones() {
            const container = document.getElementById('listaAutorizaciones');
            if (!container) return;

            // Solo lotes en corte, de TODAS las sucursales.
            const enCorte = (reembolsos || []).filter(r => r.estado === 'en_corte');

            // Filtro de búsqueda (lote, sucursal o beneficiario).
            const q = (document.getElementById('buscarAutorizaciones')?.value || '').trim().toLowerCase();

            // Agrupar por numero_lote.
            const lotes = {};
            enCorte.forEach(r => {
                const clave = r.numero_lote || 'SIN_LOTE';
                if (!lotes[clave]) lotes[clave] = [];
                lotes[clave].push(r);
            });

            let clavesLote = Object.keys(lotes).sort().reverse();

            // Aplicar búsqueda a nivel de lote.
            if (q) {
                clavesLote = clavesLote.filter(clave => {
                    const grupo = lotes[clave];
                    const sucursal = (grupo[0].sucursal_usuario || '').toLowerCase();
                    const beneficiarios = grupo.map(r => (r.nombre_beneficiario || '').toLowerCase()).join(' ');
                    return clave.toLowerCase().includes(q) || sucursal.includes(q) || beneficiarios.includes(q);
                });
            }

            if (clavesLote.length === 0) {
                container.innerHTML = `
                    <div style="background: white; border-radius: 12px; padding: 40px; text-align: center; color: #718096; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                        <i class="fas fa-check-circle" style="font-size: 40px; color: #38a169; margin-bottom: 15px;"></i>
                        <p style="font-size: 16px;">No hay lotes pendientes de autorizar</p>
                    </div>`;
                return;
            }

            let html = `<p style="color:#4a5568; font-size:13px; text-transform:uppercase; font-weight:600; margin-bottom:12px;">Pendientes de autorizar (${clavesLote.length})</p>`;

            clavesLote.forEach(clave => {
                const grupo = lotes[clave];
                const total = grupo.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
                const sucursal = grupo[0].sucursal_usuario || 'N/A';
                const idSeguro = clave.replace(/[^a-zA-Z0-9]/g, '_');

                const filas = grupo.map(r => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px;">${r.nombre_beneficiario || ''}</td>
                        <td style="padding: 10px; color:#666;">${r.concepto || ''}</td>
                        <td style="padding: 10px; text-align: right; font-weight: 600;">$${parseFloat(r.monto || 0).toLocaleString()}</td>
                        <td style="padding: 10px;">${r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-MX') : '—'}</td>
                        <td style="padding: 10px; text-align: center;">
                            ${(r.archivos && r.archivos.length > 0)
                                ? `<button class="btn btn-primary" style="padding: 6px 12px; font-size: 13px;" onclick="verArchivosReembolso('${r.id}')"><i class="fas fa-paperclip"></i> Ver (${r.archivos.length})</button>`
                                : `<span style="color:#a0aec0;">—</span>`}
                        </td>
                    </tr>`).join('');

                html += `
                    <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-left: 5px solid #3182ce;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                            <div>
                                <h3 style="margin: 0; color: #1a365d;"><i class="fas fa-layer-group"></i> Lote ${clave}</h3>
                                <div style="display: flex; gap: 15px; margin-top: 8px; align-items: center; flex-wrap: wrap;">
                                    <span style="background: #667eea; color: white; padding: 4px 12px; border-radius: 12px; font-size: 13px; font-weight: bold;">${sucursal} - ${NOMBRES_SUCURSALES_AUTZ[sucursal] || 'Sin sucursal'}</span>
                                    <span style="color: #4a5568; font-size: 14px;"><strong>${grupo.length}</strong> reembolsos</span>
                                    <span style="color: #1a365d; font-size: 16px; font-weight: bold;">Total: $${total.toLocaleString()}</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                                <button class="btn btn-success" style="padding: 8px 16px; font-size: 14px;" onclick="autorizarLoteHTML('${clave}')"><i class="fas fa-check"></i> Autorizar</button>
                                <button class="btn btn-danger" style="padding: 8px 16px; font-size: 14px;" onclick="rechazarLoteHTML('${clave}')"><i class="fas fa-times"></i> Rechazar</button>
                                <button class="btn btn-primary" style="padding: 8px 16px; font-size: 14px;" onclick="toggleLoteAutz('${idSeguro}')">
                                    <i class="fas fa-chevron-down" id="iconAutz-${idSeguro}"></i>
                                    <span id="txtAutz-${idSeguro}">Ver detalle</span>
                                </button>
                            </div>
                        </div>
                        <div id="detalleAutz-${idSeguro}" style="display: none; margin-top: 15px; border-top: 2px solid #e2e8f0; padding-top: 15px; overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
                                <thead>
                                    <tr style="background: #f7fafc;">
                                        <th style="padding: 10px; text-align: left;">Beneficiario</th>
                                        <th style="padding: 10px; text-align: left;">Concepto</th>
                                        <th style="padding: 10px; text-align: right;">Monto</th>
                                        <th style="padding: 10px; text-align: left;">Fecha</th>
                                        <th style="padding: 10px; text-align: center;">Comprobantes</th>
                                    </tr>
                                </thead>
                                <tbody>${filas}</tbody>
                            </table>
                        </div>
                    </div>`;
            });

            container.innerHTML = html;
        }

        function toggleLoteAutz(idSeguro) {
            const detalle = document.getElementById(`detalleAutz-${idSeguro}`);
            const icono = document.getElementById(`iconAutz-${idSeguro}`);
            const texto = document.getElementById(`txtAutz-${idSeguro}`);
            if (!detalle) return;
            const abierto = detalle.style.display !== 'none';
            detalle.style.display = abierto ? 'none' : 'block';
            if (icono) icono.className = abierto ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            if (texto) texto.textContent = abierto ? 'Ver detalle' : 'Ocultar';
        }
```

- [ ] **Step 2: Verificación (requiere Task 1.5/1.6 y datos)**

Guardar. La pantalla completa se prueba en Task 1.7. Aquí solo verificar que no hay error de sintaxis: abrir el HTML, consola del navegador sin errores rojos al cargar.

### Task 1.5: Función autorizarLoteHTML()

**Files:**
- Modify: `V3 Reembolsos SQL.html` (junto a `cargarAutorizaciones`)

- [ ] **Step 1: Escribir la función**

```javascript
        async function autorizarLoteHTML(numeroLote) {
            const grupo = (reembolsos || []).filter(r => r.estado === 'en_corte' && (r.numero_lote || 'SIN_LOTE') === numeroLote);
            if (grupo.length === 0) { mostrarNotificacion('No hay reembolsos en corte para este lote', 'warning'); return; }

            const total = grupo.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
            if (!confirm(`¿Autorizar el lote ${numeroLote}?\n\n• ${grupo.length} reembolsos\n• Total: $${total.toLocaleString()}`)) return;

            mostrarNotificacion('Autorizando lote…', 'info');
            const ahora = new Date().toISOString();
            const autorizadoPor = currentUser ? currentUser.nombre : 'Autorizador';
            let ok = 0;
            for (const r of grupo) {
                const { error } = await supabase
                    .from('rnd_reembolsos')
                    .update({ estado: 'aprobado', autorizado_por: autorizadoPor, fecha_autorizacion: ahora })
                    .eq('id', r.id);
                if (!error) ok++;
                else console.error('Error autorizando', r.id, error);
            }

            await cargarDatos();
            cargarAutorizaciones();
            mostrarNotificacion(`Lote ${numeroLote} autorizado (${ok}/${grupo.length} reembolsos)`, 'success');
        }
```

- [ ] **Step 2: Verificación**

Guardar. Se prueba end-to-end en Task 1.7.

### Task 1.6: Función rechazarLoteHTML()

**Files:**
- Modify: `V3 Reembolsos SQL.html` (junto a las anteriores)

- [ ] **Step 1: Escribir la función**

```javascript
        async function rechazarLoteHTML(numeroLote) {
            const grupo = (reembolsos || []).filter(r => r.estado === 'en_corte' && (r.numero_lote || 'SIN_LOTE') === numeroLote);
            if (grupo.length === 0) { mostrarNotificacion('No hay reembolsos en corte para este lote', 'warning'); return; }

            // Motivo OPCIONAL: prompt cancelado => aborta; vacío => se acepta sin motivo.
            const motivo = prompt(`Rechazar el lote ${numeroLote}.\n\nMotivo (opcional, puede dejarlo vacío):`);
            if (motivo === null) return; // canceló

            mostrarNotificacion('Rechazando lote…', 'info');
            const ahora = new Date().toISOString();
            const autorizadoPor = currentUser ? currentUser.nombre : 'Autorizador';
            let ok = 0;
            for (const r of grupo) {
                const { error } = await supabase
                    .from('rnd_reembolsos')
                    .update({ estado: 'rechazado', motivo_rechazo: motivo || null, autorizado_por: autorizadoPor, fecha_autorizacion: ahora })
                    .eq('id', r.id);
                if (!error) ok++;
                else console.error('Error rechazando', r.id, error);
            }

            await cargarDatos();
            cargarAutorizaciones();
            mostrarNotificacion(`Lote ${numeroLote} rechazado (${ok}/${grupo.length} reembolsos)`, 'success');
        }
```

- [ ] **Step 2: Verificación**

Guardar. Se prueba end-to-end en Task 1.7.

### Task 1.7: Quitar el correo del flujo de corte

**Files:**
- Modify: `V3 Reembolsos SQL.html` (`enviarSolicitudAutorizacion`, ~línea 5300-5359; botón texto ~3770)

- [ ] **Step 1: Cambiar el flujo para no depender del correo**

En `enviarSolicitudAutorizacion` (~5300), hoy hace: `mostrarNotificacion('Generando PDF y enviando correo...')` → `const response = await enviarCorreoAutorizacion(datosCorreo)` → `if (response.success) { ... actualiza a en_corte ... }`.

Reemplazar el bloque desde `mostrarNotificacion('Generando PDF y enviando correo...', 'info');` (~5300) hasta el `const response = await enviarCorreoAutorizacion(datosCorreo);` (~5314) por:

```javascript
                            mostrarNotificacion('Enviando lote a corte…', 'info');

                            // Ya NO se manda correo a Fernando: el lote aparecerá en su módulo de Autorizaciones.
                            const response = { success: true };
```

Esto deja intacto todo el bloque `if (response.success) { ... }` que actualiza los estados a `en_corte` con su `numero_lote` (~5318-5340) y elimina la dependencia del correo. Nota: `enviarCorreoAutorizacion` queda sin usar; se puede dejar (código muerto inofensivo) o borrar después.

- [ ] **Step 2: Actualizar el texto del botón**

Localizar (~3769-3771):

```html
                            <button id="btnEnviarAutorizacion" class="btn btn-success" onclick="enviarSolicitudAutorizacion()" style="font-size: 16px; padding: 15px 30px;">
                                <i class="fas fa-paper-plane"></i> Enviar Correo a Fernando
                            </button>
```

Reemplazar el texto del botón:

```html
                            <button id="btnEnviarAutorizacion" class="btn btn-success" onclick="enviarSolicitudAutorizacion()" style="font-size: 16px; padding: 15px 30px;">
                                <i class="fas fa-paper-plane"></i> Enviar a Corte
                            </button>
```

También actualizar el texto de ayuda debajo (~3772-3774) si menciona el correo: cambiar "se enviará automáticamente" por "quedará pendiente de autorización".

- [ ] **Step 3: Verificación end-to-end del HTML (prueba manual completa)**

1. Abrir el HTML en el navegador.
2. Login como **caja_chica/admin**. Registrar 2 reembolsos de prueba.
3. En Revisión, "Enviar a Corte" con un número de lote (ej. `999`). Confirmar que NO pide correo y que los reembolsos pasan a `en_corte` (verificar en Revisión / consola).
4. Logout. Login como **Fernando** (`rol=autorizador`). Debe verse SOLO la pestaña **Autorizaciones**.
5. En Autorizaciones: aparece el lote `999-<NOMBRE>` con sucursal, total, nº reembolsos. "Ver detalle" muestra la tabla; "Ver (N)" abre los comprobantes en pestaña nueva.
6. Presionar **Autorizar** → confirmar → el lote desaparece; verificar en Supabase que esos reembolsos quedaron `estado=aprobado`, con `autorizado_por` y `fecha_autorizacion`.
7. Repetir con otro lote y **Rechazar** con un motivo → verificar `estado=rechazado` y `motivo_rechazo` guardado.

Expected: los 7 pasos pasan sin errores en consola.

- [ ] **Step 4: Commit**

> El HTML V3 está fuera del repo git de devoluciones-ac-web. Si el usuario tiene el
> Escritorio bajo control de versiones aparte, commitear ahí. Si no, este paso es
> guardar el archivo + conservar el backup de Task 1.0. Confirmar con el usuario
> cómo versiona el HTML antes de asumir un `git commit`.

---

## FASE 2 — React (`devoluciones-ac-web`)

> Todos los comandos desde `C:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web`.
> Gestor de paquetes: **pnpm**. Tests: **vitest**.

### Task 2.1: Rol `autorizador` en el dominio (TDD)

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Test: `packages/domain/src/roles.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añadir a `packages/domain/src/roles.test.ts` (o crear si no existe; usar el estilo de los tests de dominio existentes). Si el archivo no existe, crearlo con:

```ts
import { describe, it, expect } from "vitest";
import { normalizarRol, ROL_TABS, tabsDeRol } from "./roles";

describe("rol autorizador", () => {
  it("normaliza 'autorizador' a 'autorizador'", () => {
    expect(normalizarRol("autorizador")).toBe("autorizador");
    expect(normalizarRol("  Autorizador ")).toBe("autorizador");
  });
  it("el autorizador solo ve el tab autorizaciones", () => {
    expect(ROL_TABS.autorizador).toEqual(["autorizaciones"]);
    expect(tabsDeRol("autorizador")).toEqual(["autorizaciones"]);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

```bash
cd packages/domain && pnpm vitest run src/roles.test.ts
```

Expected: FAIL (`normalizarRol("autorizador")` devuelve `"caja_chica"`, y `ROL_TABS.autorizador` es undefined / error de tipo).

- [ ] **Step 3: Implementar en `roles.ts`**

Reemplazar el contenido de `packages/domain/src/roles.ts` por:

```ts
export const ROLES = ["admin", "caja_chica", "gerente", "autorizador"] as const;
export type Rol = (typeof ROLES)[number];

export type TabId =
  | "nuevo-reembolso"
  | "revision"
  | "entregas"
  | "reportes"
  | "dashboard"
  | "comidas-gerente"
  | "pago-comidas"
  | "autorizaciones";

/**
 * Normaliza el rol crudo de rnd_usuarios. 'administracion' era un rol roto
 * en el HTML viejo (no aparecía en ningún data-role → no veía nada); se trata
 * como alias de admin. Cualquier valor desconocido cae a caja_chica (mínimo privilegio).
 */
export function normalizarRol(raw: string): Rol {
  const r = raw.trim().toLowerCase();
  if (r === "administracion" || r === "admin") return "admin";
  if (r === "gerente") return "gerente";
  if (r === "autorizador") return "autorizador";
  return "caja_chica";
}

export const ROL_TABS: Record<Rol, readonly TabId[]> = {
  admin: [
    "nuevo-reembolso",
    "revision",
    "entregas",
    "reportes",
    "dashboard",
  ],
  caja_chica: ["nuevo-reembolso", "revision", "reportes", "pago-comidas"],
  gerente: ["comidas-gerente"],
  autorizador: ["autorizaciones"],
};

export function tabsDeRol(rol: Rol): readonly TabId[] {
  return ROL_TABS[rol];
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

```bash
cd packages/domain && pnpm vitest run src/roles.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/USUARIO/Desktop/Devoluciones AC/devoluciones-ac-web"
git add packages/domain/src/roles.ts packages/domain/src/roles.test.ts
git commit -m "feat(domain): rol autorizador con tab autorizaciones"
```

### Task 2.2: Tipos de BD

**Files:**
- Modify: `src/types/db.ts` (definición de `rnd_reembolsos`, ~línea 1437-1504)

- [ ] **Step 1: Añadir las 3 columnas a los tipos**

En `src/types/db.ts`, localizar el bloque `rnd_reembolsos` con `Row`, `Insert`, `Update`. Añadir en cada uno los 3 campos (opcionales/nullables). En `Row`:

```ts
          motivo_rechazo: string | null
          autorizado_por: string | null
          fecha_autorizacion: string | null
```

En `Insert` y `Update`:

```ts
          motivo_rechazo?: string | null
          autorizado_por?: string | null
          fecha_autorizacion?: string | null
```

(Insertar en orden alfabético o junto a los otros campos string|null del mismo bloque, respetando la sintaxis existente.)

- [ ] **Step 2: Verificar typecheck**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/types/db.ts
git commit -m "feat(types): columnas de autorización en rnd_reembolsos"
```

### Task 2.3: Query de autorización (TDD)

**Files:**
- Create: `src/lib/supabase/queries/autorizacion.ts`
- Test: `src/lib/supabase/queries/autorizacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/supabase/queries/autorizacion.test.ts`. Imita el mock de Supabase usado en `entregas.test.ts` (leerlo primero para copiar el patrón exacto de mock del cliente). Estructura esperada:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del cliente Supabase: cada update().eq() resuelve { error: null }.
const updates: Array<Record<string, unknown>> = [];
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (vals: Record<string, unknown>) => {
        updates.push(vals);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

import { autorizarLote, rechazarLote } from "./autorizacion";

beforeEach(() => { updates.length = 0; });

describe("autorizarLote", () => {
  it("marca cada id como aprobado con trazabilidad", async () => {
    const res = await autorizarLote(["a", "b"], "Lic Fernando");
    expect(res.ok).toBe(true);
    expect(res.actualizados).toBe(2);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ estado: "aprobado", autorizado_por: "Lic Fernando" });
    expect(updates[0]).toHaveProperty("fecha_autorizacion");
  });
  it("devuelve error si no hay ids", async () => {
    const res = await autorizarLote([], "Lic Fernando");
    expect(res.ok).toBe(false);
  });
});

describe("rechazarLote", () => {
  it("marca cada id como rechazado guardando el motivo", async () => {
    const res = await rechazarLote(["a"], "Lic Fernando", "Falta comprobante");
    expect(res.ok).toBe(true);
    expect(updates[0]).toMatchObject({ estado: "rechazado", motivo_rechazo: "Falta comprobante", autorizado_por: "Lic Fernando" });
  });
  it("acepta motivo vacío (guarda null)", async () => {
    await rechazarLote(["a"], "Lic Fernando");
    expect(updates[0]).toMatchObject({ estado: "rechazado", motivo_rechazo: null });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

```bash
pnpm vitest run src/lib/supabase/queries/autorizacion.test.ts
```

Expected: FAIL (módulo `./autorizacion` no existe).

- [ ] **Step 3: Implementar `autorizacion.ts`**

Crear `src/lib/supabase/queries/autorizacion.ts` (patrón idéntico a `entregas.ts`):

```ts
import { supabase } from "@/lib/supabase/client";

export interface AutorizarResult {
  ok: boolean;
  actualizados?: number;
  error?: string;
}

// Marca todos los reembolsos de un lote (por id) como 'aprobado', con trazabilidad.
export async function autorizarLote(
  ids: string[],
  autorizadoPor: string,
): Promise<AutorizarResult> {
  if (ids.length === 0) return { ok: false, error: "No hay reembolsos en el lote" };
  const fecha = new Date().toISOString();
  let actualizados = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "aprobado", autorizado_por: autorizadoPor, fecha_autorizacion: fecha, updated_at: fecha })
      .eq("id", id);
    if (!error) actualizados++;
  }
  return { ok: true, actualizados };
}

// Marca todos los reembolsos de un lote como 'rechazado'. El motivo es opcional.
export async function rechazarLote(
  ids: string[],
  autorizadoPor: string,
  motivo?: string,
): Promise<AutorizarResult> {
  if (ids.length === 0) return { ok: false, error: "No hay reembolsos en el lote" };
  const fecha = new Date().toISOString();
  let actualizados = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "rechazado", motivo_rechazo: motivo || null, autorizado_por: autorizadoPor, fecha_autorizacion: fecha, updated_at: fecha })
      .eq("id", id);
    if (!error) actualizados++;
  }
  return { ok: true, actualizados };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

```bash
pnpm vitest run src/lib/supabase/queries/autorizacion.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/queries/autorizacion.ts src/lib/supabase/queries/autorizacion.test.ts
git commit -m "feat(lib): query autorizarLote/rechazarLote"
```

### Task 2.4: Hook de React Query

**Files:**
- Create: `src/lib/hooks/useAutorizacion.ts`

- [ ] **Step 1: Escribir el hook**

Crear `src/lib/hooks/useAutorizacion.ts` (patrón de `useEntregas.ts`):

```ts
"use client";
import { useMutation } from "@tanstack/react-query";
import { autorizarLote, rechazarLote } from "@/lib/supabase/queries/autorizacion";

export function useAutorizarLote() {
  return useMutation({
    mutationFn: (args: { ids: string[]; autorizadoPor: string }) =>
      autorizarLote(args.ids, args.autorizadoPor),
  });
}

export function useRechazarLote() {
  return useMutation({
    mutationFn: (args: { ids: string[]; autorizadoPor: string; motivo?: string }) =>
      rechazarLote(args.ids, args.autorizadoPor, args.motivo),
  });
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useAutorizacion.ts
git commit -m "feat(hooks): useAutorizarLote/useRechazarLote"
```

### Task 2.5: Sidebar — nuevo tab

**Files:**
- Modify: `src/components/nav/Sidebar.tsx` (`ETIQUETAS` ~7-15, `ICONOS` ~18-59, `RUTAS_EXISTENTES` ~62)

- [ ] **Step 1: Añadir etiqueta**

En `ETIQUETAS`, añadir la entrada (el objeto es `Record<TabId,string>`, así que TS obliga a añadirla):

```ts
  "autorizaciones": "Autorizaciones",
```

- [ ] **Step 2: Añadir ícono**

En `ICONOS`, añadir (ícono de sello/check circle, mismo estilo stroke que los demás):

```ts
  "autorizaciones": (
    <>
      <path d="M9 12l2 2 4-4" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
```

- [ ] **Step 3: Registrar la ruta como existente**

En `RUTAS_EXISTENTES`, añadir `"autorizaciones"` al Set:

```ts
const RUTAS_EXISTENTES: Set<TabId> = new Set(["dashboard", "revision", "reportes", "comidas-gerente", "pago-comidas", "nuevo-reembolso", "entregas", "autorizaciones"]);
```

- [ ] **Step 4: Verificar typecheck**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: sin errores (si falta la etiqueta o el ícono, TS falla por el Record).

- [ ] **Step 5: Commit**

```bash
git add src/components/nav/Sidebar.tsx
git commit -m "feat(nav): tab Autorizaciones en el sidebar"
```

### Task 2.6: Página de autorizaciones

**Files:**
- Create: `src/app/(app)/autorizaciones/page.tsx`

- [ ] **Step 1: Escribir la página**

Crear `src/app/(app)/autorizaciones/page.tsx`. Clon de `entregas/page.tsx` adaptado: lista `en_corte`, dos botones por lote, tabla de detalle con comprobantes, rechazo con input de motivo inline.

```tsx
"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { useAutorizarLote, useRechazarLote } from "@/lib/hooks/useAutorizacion";
import { agruparPorLote, type Fila, type GrupoLote } from "@/lib/reportes/agruparPorLote";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoteCard } from "@/components/ui/LoteCard";
import { Money } from "@/components/ui/Money";
import { parseMonto, normalizarArchivos } from "@devoluciones/domain";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";
const BTN_NO = "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40";

function TablaDetalle({ reembolsos }: { reembolsos: Fila[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1.5 pr-4">Beneficiario</th>
            <th className="pb-1.5 pr-4">Concepto</th>
            <th className="pb-1.5 pr-4 text-right">Monto</th>
            <th className="pb-1.5 pr-4">Fecha</th>
            <th className="pb-1.5">Comprobantes</th>
          </tr>
        </thead>
        <tbody>
          {reembolsos.map((r) => {
            const archivos = normalizarArchivos(r.archivos);
            return (
              <tr key={String(r.id)} className="border-t border-slate-200">
                <td className="py-1.5 pr-4 text-slate-900">{String(r.nombre_beneficiario ?? "")}</td>
                <td className="py-1.5 pr-4 text-slate-600">{String(r.concepto ?? "")}</td>
                <td className="py-1.5 pr-4 text-right"><Money monto={parseMonto(r.monto as number)} /></td>
                <td className="py-1.5 pr-4 text-slate-600">{r.fecha ? new Date(String(r.fecha) + "T12:00:00").toLocaleDateString("es-MX") : "—"}</td>
                <td className="py-1.5">
                  {archivos.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {archivos.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                           className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                          Ver {archivos.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AutorizacionesPage() {
  const { sesion } = useAuth();
  const enCorteQ = useReembolsos({ estado: "en_corte", page: 0, pageSize: 500 });
  const autorizar = useAutorizarLote();
  const rechazar = useRechazarLote();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [motivoAbierto, setMotivoAbierto] = useState<Record<string, boolean>>({});
  const [motivoPorLote, setMotivoPorLote] = useState<Record<string, string>>({});

  const enCorte = useMemo(() => (enCorteQ.data?.rows ?? []) as Fila[], [enCorteQ.data]);
  const lotes = useMemo(() => agruparPorLote(enCorte, "numero_lote"), [enCorte]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lotes;
    return lotes.filter((g) => {
      const benef = g.reembolsos.map((r) => String(r.nombre_beneficiario ?? "").toLowerCase()).join(" ");
      return g.lote.toLowerCase().includes(q) || g.sucursal.toLowerCase().includes(q) || benef.includes(q);
    });
  }, [busqueda, lotes]);

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
  }

  function onAutorizar(g: GrupoLote) {
    if (!confirm(`¿Autorizar el lote ${g.lote}?\n\n${g.reembolsos.length} reembolsos · Total $${g.total.toLocaleString()}`)) return;
    const ids = g.reembolsos.map((r) => String(r.id));
    setMsg("");
    autorizar.mutate({ ids, autorizadoPor: sesion?.nombre ?? "Autorizador" }, {
      onSuccess: (res) => {
        setMsg(res.ok ? `✅ Lote ${g.lote} autorizado (${res.actualizados} reembolsos)` : `⚠ ${res.error}`);
        if (res.ok) refrescar();
      },
    });
  }

  function onRechazar(g: GrupoLote) {
    const ids = g.reembolsos.map((r) => String(r.id));
    setMsg("");
    rechazar.mutate({ ids, autorizadoPor: sesion?.nombre ?? "Autorizador", motivo: motivoPorLote[g.lote] }, {
      onSuccess: (res) => {
        setMsg(res.ok ? `Lote ${g.lote} rechazado (${res.actualizados} reembolsos)` : `⚠ ${res.error}`);
        if (res.ok) { setMotivoAbierto((p) => ({ ...p, [g.lote]: false })); refrescar(); }
      },
    });
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Autorizaciones" subtitulo="Revisa y autoriza los lotes de reembolsos pendientes" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 sm:max-w-sm">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por lote, sucursal o beneficiario…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
        Pendientes de autorizar ({lotes.length})
      </h2>

      {visibles.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
          {busqueda ? "Ningún lote coincide con la búsqueda." : "No hay lotes pendientes de autorizar."}
        </Card>
      ) : (
        <div className="space-y-3">
          {visibles.map((g) => (
            <LoteCard
              key={g.lote}
              lote={g.lote}
              sucursal={g.sucursal}
              numReembolsos={g.reembolsos.length}
              total={g.total}
              acentoColor="border-l-blue-500"
              chipTono="cyan"
              accion={
                <div className="flex flex-wrap gap-2">
                  <button className={BTN_OK} disabled={autorizar.isPending} onClick={() => onAutorizar(g)}>
                    Autorizar
                  </button>
                  <button className={BTN_NO} disabled={rechazar.isPending}
                          onClick={() => setMotivoAbierto((p) => ({ ...p, [g.lote]: !p[g.lote] }))}>
                    Rechazar
                  </button>
                </div>
              }
              detalle={
                <div className="space-y-3">
                  <TablaDetalle reembolsos={g.reembolsos} />
                  {motivoAbierto[g.lote] && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2.5">
                      <input
                        type="text"
                        value={motivoPorLote[g.lote] ?? ""}
                        onChange={(e) => setMotivoPorLote((p) => ({ ...p, [g.lote]: e.target.value }))}
                        placeholder="Motivo del rechazo (opcional)"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      <button className={BTN_NO} disabled={rechazar.isPending} onClick={() => onRechazar(g)}>
                        Confirmar rechazo
                      </button>
                    </div>
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}
    </main>
  );
}
```

> Nota: el input de motivo se muestra dentro del detalle. Al presionar "Rechazar"
> se abre ese input (y conviene que el detalle esté visible). Si en pruebas resulta
> confuso, mover el mini-form de motivo fuera del detalle (a la cabecera de la
> tarjeta) — ajuste menor de UX, no de lógica.

- [ ] **Step 2: (Confirmado) `normalizarArchivos` ya se exporta del dominio**

El barrel `packages/domain/src/index.ts` hace `export * from "./jsonb"`, y
`normalizarArchivos` vive en `jsonb.ts`, así que ya está disponible como
`import { normalizarArchivos } from "@devoluciones/domain"`. No hay que tocar el barrel.
(Verificación opcional: `grep -n "normalizarArchivos" packages/domain/src/jsonb.ts`.)

- [ ] **Step 3: Verificar typecheck**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/autorizaciones/page.tsx"
git commit -m "feat(app): página de autorizaciones para el autorizador"
```

### Task 2.7: Quitar el correo del corte en React

**Files:**
- Modify: `src/lib/supabase/queries/corte.ts` (~1-98)
- Modify: `src/app/(app)/revision/page.tsx` (~113, ~150-151)

- [ ] **Step 1: Simplificar `enviarACorte`**

En `src/lib/supabase/queries/corte.ts`, eliminar la llamada al Apps Script. Reemplazar el cuerpo de `enviarACorte` (desde `const loteCompleto = ...` hasta el `return`) por:

```ts
  const loteCompleto = numeroLoteCompleto(input.numeroLote, input.nombreRemitente);

  // Ya NO se manda correo a Fernando: el lote aparece en su módulo de Autorizaciones.
  let actualizados = 0;
  for (const r of input.reembolsosPendientes) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "en_corte", numero_lote: loteCompleto })
      .eq("id", r.id);
    if (!error) actualizados++;
  }
  return { ok: true, numeroLoteCompleto: loteCompleto, actualizados };
```

Además, eliminar `APPS_SCRIPT_URL` (~5-6), la función `enviarCorreoAppsScript` (~44-58) y la construcción de `dataCorreo`/`totalMonto`/la guarda `if (!correo.success)`. Los campos `emailRemitente` y `sucursalUsuario` de `EnviarACorteInput` quedan sin uso pero pueden conservarse para no romper el llamador; si el linter marca no-usados, mantenerlos en la interfaz (los pasa la UI) y no leerlos.

- [ ] **Step 2: Actualizar textos en `revision/page.tsx`**

Localizar el botón "Enviar a corte (correo a Fernando)" (~113) → cambiar a `Enviar a corte`. Localizar el texto de la sección "esperando respuesta" (~150-151) que dice que Fernando responde por correo → cambiar por algo como: "Estos lotes están en corte, pendientes de autorización por el Lic Fernando en su módulo."

- [ ] **Step 3: Ajustar/quitar tests de corte que asuman correo**

```bash
grep -rn "AppsScript\|enviarCorreo\|correo" src/lib/supabase/queries/corte.test.ts 2>/dev/null || echo "sin test de corte"
```

Si existe `corte.test.ts` y mockea el fetch al Apps Script, actualizarlo para que `enviarACorte` ya no llame a fetch y solo verifique los updates de estado. Si no existe, omitir.

- [ ] **Step 4: Ejecutar tests + typecheck**

```bash
pnpm vitest run
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: todos los tests PASS, typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/queries/corte.ts "src/app/(app)/revision/page.tsx"
git commit -m "refactor(corte): quitar correo a Fernando; el corte solo cambia estado"
```

### Task 2.8: Verificación end-to-end en React

**Files:** ninguno (validación manual + build).

- [ ] **Step 1: Build de producción**

```bash
pnpm build
```

Expected: build exitoso, sin errores de tipos ni de lint que rompan.

- [ ] **Step 2: Levantar dev y probar el flujo**

```bash
pnpm dev
```

1. Login como caja_chica → registrar reembolsos → Revisión → "Enviar a corte" con un lote (sin correo).
2. Logout → login como Fernando (`rol=autorizador`) → debe ver SOLO la ruta `/autorizaciones` en el sidebar; el middleware debe rebotar cualquier otra ruta.
3. En Autorizaciones: aparece el lote, "Ver detalle" muestra la tabla con comprobantes ("Ver" abre en pestaña nueva).
4. Autorizar → confirma → el lote desaparece; verificar en Supabase `estado=aprobado`, `autorizado_por`, `fecha_autorizacion`.
5. Rechazar → abre input de motivo → "Confirmar rechazo" → `estado=rechazado`, `motivo_rechazo`.
6. Como admin, ir a Entregas → el lote autorizado aparece como aprobado (flujo posterior intacto).

Expected: los 6 pasos pasan sin errores en consola.

- [ ] **Step 3: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "chore: ajustes tras verificación end-to-end de autorizaciones"
```

---

## Notas de cierre

- **Orden recomendado:** Fase 0 (BD) → Fase 0b (usuario Fernando) → Fase 1 (HTML V3, resuelve el problema hoy) → Fase 2 (React).
- **Seguridad (fuera de alcance):** la BD sigue sin RLS y con passwords en texto plano; el módulo hereda esa deuda. Endurecer con RLS/roles de Postgres es una fase aparte.
- **Rollback HTML:** si algo sale mal en V3, restaurar `V3 Reembolsos SQL.backup-antes-autorizaciones.html`.
