# App de Empleados — Vales de Comida (v1)

**Fecha:** 2026-07-16
**Estado:** Diseño aprobado, listo para plan de implementación
**Proyecto:** devoluciones-ac-web

---

## 1. Problema y objetivo

Hoy el código OTP con el que un chofer cobra sus comidas viaja **solo por WhatsApp**, y a veces no llega: teléfono apagado, sin señal, número mal capturado en `empleados`, o el webhook (`recruiterhub-adp.ngrok.app`) falla en silencio. La edge function `generar-otp-comidas` reporta éxito aunque el envío falle, así que nadie se entera.

**Objetivo:** que el empleado **no dependa de que llegue un mensaje**. Una app propia (PWA) donde entra cuando quiere y ahí está su código y sus comidas por cobrar.

**Decisión de fondo (modelo "jalar", no "empujar"):** las notificaciones push tienen la misma debilidad que WhatsApp (no garantizan entrega), así que la pieza central es que el empleado **abre la app y jala su código**. Push queda fuera de la v1 como extra futuro.

**Visión de plataforma:** esta app es el **módulo #1** de una plataforma para empleados con potencial de crecer (recibos, checador, avisos). La identidad/sesión del empleado se diseña como infraestructura compartida reutilizable, sin construir módulos especulativos hoy (YAGNI).

---

## 2. Decisiones clave (resumen)

| Tema | Decisión |
|---|---|
| Mecanismo | "Jalar": el empleado abre la app y ve su código. Push diferido. |
| Dónde vive | Misma app Next.js, route group `(empleado)` bajo `/empleado`, con sesión propia. |
| Login | Teléfono + NIP (sin depender de mensajes). |
| Registro | Teléfono + `codigo_empleado` (ambos deben coincidir con `empleados`) → fija NIP. |
| Reset NIP | Autoservicio (mismo trámite) + un gerente puede forzarlo desde el panel interno. |
| Plataforma | PWA instalable ("agregar a pantalla de inicio"), acotada a `/empleado`. |
| Código | Guardado **cifrado** (llave en Vault) para que la app lo muestre re-visualizable. |
| Validación cajera | **Sin cambios**: sigue por hash con la RPC `liberar_comidas_otp`. |
| Liga empleado↔vale | Por `empleado_id` (confiable), no por nombre. Arreglar generador + rellenar pendientes. |
| Contenido v1 | Mínimo: comidas pendientes (fecha, monto, total) + código vigente. |
| Código del día | "Actualizar código" para incluir comidas validadas después de generarlo. |
| Look | "Carnet cálido": papel crema, Fraunces + Work Sans, acentos terracota/olivo. |

---

## 3. Arquitectura

Una sección amurallada dentro de la app existente:

- **Rutas** — nuevo route group `src/app/(empleado)/...` con su propio layout, `login`, `home`. Independiente de las pantallas de personal.
- **Sesión separada** — el personal usa la cookie `rnd_sesion`; el empleado usa `emp_sesion` (contenido: `empleado_id`, nombre; **firmada con HMAC**). Nunca se cruzan: un chofer no entra a `/pago-comidas` ni un cajero entra a `/empleado`.
- **Middleware** — a [src/middleware.ts](../../../src/middleware.ts) se le agrega una rama: si la ruta empieza con `/empleado`, valida `emp_sesion` (redirige a `/empleado/login` si falta o es inválida); el resto sigue igual que hoy (autorización por rol de personal).
- **Datos vía servidor** — los datos del empleado (sus vales, su código) se leen a través de **edge functions con `service_role`** que solo devuelven lo del empleado autenticado. La cookie manipulada no expone datos ajenos.
- **PWA acotada a `/empleado`** — manifiesto (ícono, nombre "Vales AC", pantalla completa) y service worker con scope `/empleado`. "Agregar a pantalla de inicio" instala la app del chofer, no el panel interno.

---

## 4. Modelo de datos

### 4.1 Tabla nueva: `rnd_empleado_auth` (identidad — base de la plataforma)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `empleado_id` | integer, único | liga lógica a `empleados.id` |
| `telefono` | text, único | normalizado; con esto inicia sesión |
| `nip_hash` | text | nunca el NIP en claro |
| `nip_salt` | text | |
| `estado` | text | `pendiente` / `activo` |
| `intentos_fallidos` | integer default 0 | |
| `bloqueado_hasta` | timestamptz null | anti fuerza bruta |
| `creado_en` | timestamptz default now() | |
| `ultimo_acceso` | timestamptz null | |

RLS cerrada: solo `service_role` (edge functions). Índices por `empleado_id` y `telefono`.

### 4.2 Extender `rnd_comida_otp`

- Agregar `otp_cifrado` (text) — el código de 6 dígitos **cifrado con la llave del Vault**, para mostrarlo al dueño.
- `otp_hash` / `otp_salt` **se quedan igual** — la cajera valida como hoy.

### 4.3 Liga empleado↔vale en `rnd_reembolsos`

Estado actual: de 3,888 comidas, solo 1 tiene `empleado_id` (la liga es nueva, apenas empezó a usarse).

- La edge function `crear-comida` debe **persistir `empleado_id`** (el cliente [crearComida.ts](../../../src/lib/edge/crearComida.ts) ya lo manda).
- El generador `generar-otp-comidas` debe **preferir `empleado_id`** y caer al match por nombre solo para lo viejo. Esto arregla de paso el bug del match silencioso.
- **Rellenado chico**: poblar `empleado_id` solo en las comidas actualmente en `comida_pendiente` que no lo tengan (vía el mismo `normalizarNombre`). No hay migración masiva del histórico.

### 4.4 Futuro (no v1)

Tabla de suscripciones push y demás módulos se agregan después sin tocar lo anterior. No se construyen ahora.

---

## 5. Autenticación y registro

- **Iniciar sesión:** teléfono + NIP → edge function compara contra `nip_hash`; si coincide emite `emp_sesion`. Bloqueo tras varios intentos (`intentos_fallidos` / `bloqueado_hasta`). Sesión de larga duración (semanas): entra una vez.
- **Registro (primera vez):** teléfono + `codigo_empleado`. El servidor verifica que el teléfono **ya exista en `empleados.telefono_whatsapp`** y que el código de empleado coincida; si todo cuadra, el chofer **fija su NIP** y queda `activo`. Son dos datos que solo él tiene, sin depender de mensajes.
- **Olvidé mi NIP:** mismo trámite que el registro (teléfono + `codigo_empleado` → NIP nuevo), con el mismo bloqueo. Un gerente puede forzar el reinicio desde el panel interno.
- **Precondición de datos:** para auto-registrarse, el teléfono del chofer debe estar en `empleados.telefono_whatsapp`. Los vacíos, un gerente los llena primero.

---

## 6. Flujo del código (modelo "jalar")

1. El chofer abre la app → su home muestra las **comidas pendientes** (fecha + monto de cada una, total) y un botón **"Ver mi código para cobrar"**.
2. Al tocarlo:
   - Si **ya existe** el OTP del día (lo generó el cron en la mañana o él mismo antes), el servidor **descifra `otp_cifrado`** y lo muestra.
   - Si **no existe aún** (comida validada después de que corrió el cron), la app lo **genera al momento**: junta todas sus comidas pendientes, crea el OTP (hash + salt + `otp_cifrado`) y muestra el código.
3. El código es **el mismo de 6 dígitos**. La cajera lo captura en su modal actual y valida con `liberar_comidas_otp` **sin cambios**. La acumulación sigue igual (el OTP trae todos los `reembolso_ids` pendientes).
4. **"Actualizar código":** si le validan una comida nueva después de generado el código del día, la app ofrece reemplazar el código del día (si no se ha usado) por uno nuevo que cobra **todas** las comidas pendientes. Así siempre cobra todo junto. Reemplazar invalida el código anterior.
5. **WhatsApp se queda como respaldo.** El cron de la mañana y la app escriben el **mismo** registro (uno por empleado/día), así que WhatsApp y app muestran el **mismo** código. Si la app lo generó primero, no hubo WhatsApp ese día.

> Nota: hoy el cron corre `30 16 * * 1-5` (L–V 9:30 Mazatlán). La migración `0005_pgcron_otp_viernes.sql` en el repo está desactualizada (dice viernes) — corregirla como parte del trabajo para que el repo refleje la realidad.

---

## 7. Sistema visual — "Carnet cálido"

Estética de credencial física, cálida y legible (elegida sobre 4 alternativas: plano técnico, neo-brutalista, tablero LED, mercado moderno).

- **Paleta:** papel crema (`#f3ecde` / `#faf6ec`), tinta café oscuro (`#33291d`), acento terracota (`#c26b4d`), olivo apagado (`#6f7a4b`), líneas finas.
- **Tipografía:** **Fraunces** (serif con carácter) para títulos y el código; **Work Sans** (humanista) para cuerpo. Jerarquía por espaciado y contraste, no por adornos.
- **Tono:** mucho aire, bordes redondeados suaves, sensación de credencial impresa de buena calidad. Iconos SVG de trazo (nunca emojis). Montos con cifras tabulares.
- **Pantallas v1:** (1) Entrar — teléfono + NIP + enlace a registro; (2) Mis vales — saludo, tarjeta de comidas pendientes con total, botón al código, nav inferior con "Comidas" activo y slots futuros; (3) Mi código — código grande, vigencia, qué cobra, "Actualizar código".
- Las fuentes deben integrarse conforme al patrón del proyecto (Next.js) para producción; los mockups del brainstorming usaron Google Fonts vía `@import`.

---

## 8. Seguridad

- **Sesión firmada:** `emp_sesion` va firmada con HMAC (secreto del servidor) y se valida en el servidor. A diferencia de `rnd_sesion` (JSON plano manipulable), no se puede falsificar.
- **NIP:** hash + salt, nunca en claro; bloqueo tras varios intentos.
- **Código:** cifrado con llave en Vault; solo la edge function lo descifra para el dueño autenticado. Una filtración de la base no revela códigos sin la llave.
- **RLS cerrada** en tablas nuevas; el empleado solo accede a lo suyo, vía edge functions con `service_role`.
- **Doble control:** la app solo *muestra*; el dinero lo libera la cajera capturando el código. Nadie cobra solo con abrir la app.

---

## 9. Alcance

**En la v1:**
- Route group `(empleado)` + PWA + sesión `emp_sesion` firmada.
- `rnd_empleado_auth` + registro/login/reset con teléfono + NIP.
- `otp_cifrado` en `rnd_comida_otp` + mostrar/generar código desde la app.
- "Actualizar código" para cubrir comidas nuevas.
- Liga por `empleado_id` (persistir al crear, preferir en el generador, rellenar pendientes) + arreglo del match silencioso.
- Reset de NIP desde el panel interno (gerente).
- Corregir la migración del cron desactualizada.

**Fuera de la v1 (puerta abierta):**
- Push / notificaciones (tabla de suscripciones futura).
- Historial de comidas cobradas.
- Reembolsos que no sean comidas.
- Módulos futuros (recibos, checador).

---

## 10. Riesgos y consideraciones

- **Match por nombre frágil:** confirmado que `"orden invertido"` o `"sin segundo nombre"` no hacen match y fallan en silencio. Mitiga la migración a `empleado_id`. Documentar cualquier tope o fallo (no fallar callado).
- **Teléfonos faltantes/duplicados:** el registro exige `telefono_whatsapp` en `empleados`; hay que decidir qué pasa con números repetidos entre empleados (unicidad de `telefono` en `rnd_empleado_auth`).
- **iOS PWA:** "agregar a pantalla de inicio" tiene limitaciones; push (futuro) requiere iOS 16.4+. No afecta la v1 (jalar).
- **Consistencia cron/app:** ambos deben escribir el mismo registro por (empleado, día) para no generar dos códigos distintos.

---

## 11. Criterios de éxito

- Un chofer se registra con teléfono + código de empleado y fija su NIP sin ayuda.
- Abre la app y ve sus comidas pendientes con montos correctos (ligadas por `empleado_id`).
- Obtiene su código (existente o generado al momento) y la cajera lo cobra con el flujo actual sin cambios.
- Si le validan una comida nueva, "Actualizar código" la incluye.
- Ningún código queda expuesto en claro en la base de datos.
