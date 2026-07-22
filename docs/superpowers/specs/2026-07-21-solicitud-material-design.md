# SPEC — Módulo de Solicitud de Material (empleado → gerente → almacén)

**Estado:** Propuesta — pendiente de revisión del usuario · **Solo desarrollo local** (se trabaja en `master` sin pushear) · **Cero `alert`**
**Proyecto Supabase:** `uqncsqstpcynjxnjhrqu` · **ERP:** SQL Server `BMSCabos` en `SERVERADP\CABOS`, alcanzable solo desde la red interna
**Fecha:** 2026-07-21

---

## 1. Objetivo

Que un empleado pida material desde la PWA `/empleado`, su gerente lo autorice y el encargado de almacén lo entregue, con trazabilidad de quién pidió, quién autorizó y quién surtió. El material sale del catálogo real del ERP (tabla `productos`), con existencia y costo de la sucursal a la vista, para que el gerente autorice sabiendo qué hay y cuánto vale.

Es el **módulo #2** de la plataforma de empleados (vales de comida fue el #1); reutiliza su login, su sesión, su estilo y su motor de push.

---

## 2. Arquitectura

Tres actores, dos aplicaciones, un puente al ERP.

| Actor | Aplicación | Autenticación | Acción |
|---|---|---|---|
| Empleado | PWA `/empleado/materiales` | cookie `emp_sesion` (HMAC) sobre `rnd_empleado_auth` | Crea la solicitud; puede cancelarla mientras siga pendiente |
| Gerente de la sucursal | Escritorio, pestaña **Material** | rol `gerente` de `rnd_usuarios` | Autoriza completa o rechaza con motivo |
| Encargado de almacén | Escritorio, pestaña **Almacén** | rol nuevo `almacen` de `rnd_usuarios` | Captura cantidades entregadas y cierra |

**Máquina de estados** (una solicitud completa, no por línea):

```
                   ┌─ rechazada   (gerente, con motivo)
pendiente ─────────┤
     │             └─ autorizada ──── entregada   (almacén, con cantidades reales)
     └─ cancelada  (el propio empleado)
```

Sin transiciones hacia atrás. Toda transición se valida en Postgres, no en el navegador.

**Puente al ERP.** El catálogo no se copia ni se sincroniza: se consulta en vivo a censos-web (`C:\censos-web`), la app Node on-premise que ya está conectada a SQL Server. Se le agrega un endpoint de búsqueda protegido por llave, y Devoluciones lo consume **solo desde el servidor** (route handler de Next), nunca desde el navegador.

**Consecuencia deliberada:** el módulo funciona en desarrollo, donde Next corre en la red interna. En Netlify no funcionaría, porque la nube no alcanza `SERVERADP\CABOS`. Eso es aceptable hoy y está anotado en §9 como el trabajo que falta antes de producción.

**Congelado de datos.** Lo que se copia del ERP a la solicitud (código, descripción, unidad, costo unitario, existencia al pedir) se guarda tal cual en el momento de pedir. El histórico no se mueve aunque cambien los precios, y las pantallas de gerente y almacén no dependen de que SQL Server esté vivo.

---

## 3. Componentes

### 3.1 Tabla `rnd_material_solicitudes`
- **Responsabilidad:** el encabezado de una solicitud y su rastro de aprobación.
- **Columnas:** `id uuid pk`, `folio text unique` (`SM-000123`, por secuencia), `empleado_id int`, `empleado_nombre text` (copia), `sucursal text` (abreviatura: `LMM`, `FTE`…), `cod_estab int` (número del ERP), `nota text null`, `estado text` (`pendiente|autorizada|rechazada|entregada|cancelada`), `creado_en timestamptz`, `autorizado_por text null`, `fecha_autorizacion timestamptz null`, `motivo_rechazo text null`, `entregado_por text null`, `fecha_entrega timestamptz null`.
- **Dependencias:** `empleados.id` (padrón de comidas, el mismo del login PWA).
- **Notas:** RLS habilitada con una política de **solo lectura** para la anon key (así el escritorio lee directo, como el resto del proyecto); escribir es imposible salvo por las RPCs de 3.4. `sucursal` guarda **abreviatura** — el vocabulario de `rnd_usuarios.sucursal`, para que el filtro de gerente y almacén sea comparación directa.

### 3.2 Tabla `rnd_material_lineas`
- **Responsabilidad:** un renglón por material pedido, con lo pedido y lo entregado.
- **Columnas:** `id uuid pk`, `solicitud_id uuid` (FK `on delete cascade`), `orden int`, `cod_prod text`, `descripcion text`, `unidad text null`, `cantidad numeric > 0`, `costo_unitario numeric null`, `existencia_al_pedir numeric null`, `cantidad_entregada numeric null`.
- **Dependencias:** `rnd_material_solicitudes`.
- **Notas:** misma postura de RLS que 3.1. `cod_prod`, `descripcion`, `unidad`, `costo_unitario` y `existencia_al_pedir` son copias congeladas del ERP. El total estimado se calcula (`Σ cantidad × costo_unitario`), no se guarda, para que no exista un total que contradiga sus líneas.

### 3.3 Columna `cod_estab` en `sucursales_map`
- **Responsabilidad:** cerrar el cuarto vocabulario de sucursal. Ya conviven abreviatura (`FTE`), nombre largo (`EL FUERTE`) y nombre bonito (`El Fuerte`); el ERP usa un número.
- **Valores:** `LMM=1, FTE=3, CLN=5, LPZ=6, SJC=7, CSL=8, JJR=11, TML=17` (tomados de `config/sucursales.js` de censos-web).
- **Notas:** se agrega a la tabla que **ya es** la fuente única de verdad, en vez de hardcodear un quinto mapa. `CSL` (CSL Brisas, estab 8) es el único que en el ERP vive en otro servidor y se consulta por linked server.

### 3.4 RPCs de Postgres (`security definer`)
- **Responsabilidad:** ser el único camino de escritura, y validar cada transición de estado de forma atómica.
- **Interfaz:**
  - `material_crear(p_empleado_id int, p_nota text, p_lineas jsonb) → jsonb {folio, id}` — resuelve sucursal y `cod_estab` del empleado; falla claro si el empleado no tiene sucursal mapeada.
  - `material_autorizar(p_id uuid, p_usuario text) → jsonb` — solo si está `pendiente`.
  - `material_rechazar(p_id uuid, p_usuario text, p_motivo text) → jsonb` — solo si está `pendiente`.
  - `material_entregar(p_id uuid, p_usuario text, p_entregas jsonb) → jsonb` — solo si está `autorizada`; escribe `cantidad_entregada` por línea.
  - `material_cancelar(p_id uuid, p_empleado_id int) → jsonb` — solo si está `pendiente` y es del propio empleado.
- **Notas:** cada una toma `for update` sobre la solicitud y devuelve un resultado con el estado resultante, para que dos clics simultáneos no autoricen dos veces. Se revoca `execute` a `anon`/`authenticated`: solo entra `service_role`.

### 3.5 Endpoint de catálogo en censos-web
- **Responsabilidad:** buscar productos del ERP con existencia y costo de una sucursal.
- **Interfaz:** `GET /api/materiales?q=<texto>&codEstab=<n>` → `[{ cod_prod, descripcion, unidad, existencia, costo }]`, máximo 25 resultados. Y `GET /api/materiales/:codProd?codEstab=<n>` para revalidar una línea al enviar.
- **Autenticación:** header `x-api-key` contra `process.env.MATERIALES_API_KEY`. Middleware nuevo `requireApiKey`, hermano de `requireAuth` — la API actual es solo de sesión con cookie y no sirve para llamadas máquina-a-máquina.
- **Dependencias:** `productos` (código, descripción, unidad vía `unidades.abreviatura`), `prodestab` (`exist_unidades`, `costo_promedio`), y el helper `tablaBMS()` para que CSL Brisas salga por su linked server.
- **Ruta:** `C:\censos-web\routes\materiales.js`. **Es un segundo proyecto**: el cambio ahí es aditivo y no toca ninguna pantalla existente.

### 3.6 Route handler `GET /api/materiales` (Devoluciones)
- **Responsabilidad:** ser el único que conoce la dirección interna y la llave de censos.
- **Interfaz:** `?q=<texto>` → misma forma que 3.5. El `codEstab` **no** viene del cliente: se resuelve de la sucursal del empleado autenticado con `emp_sesion`. Lo consume únicamente la PWA; gerente y almacén trabajan sobre los datos ya congelados y nunca tocan el ERP.
- **Dependencias:** env server-only `CENSOS_API_URL`, `CENSOS_API_KEY`. Timeout de 5 s.
- **Notas:** si el ERP no responde, devuelve `503` con mensaje legible; el buscador lo muestra sin tumbar la pantalla.

### 3.7 Route handlers de escritura
- **Responsabilidad:** validar identidad, llamar la RPC con `service_role` y disparar el aviso push.
- **Interfaz:**
  - `POST /api/empleado/materiales` (crear) y `POST /api/empleado/materiales/cancelar` — el `empleado_id` sale **de la cookie firmada**, nunca del body.
  - `POST /api/materiales/autorizar`, `/rechazar`, `/entregar` — para el escritorio; el nombre del usuario viaja en el body y se guarda como rastro, con el mismo nivel de confianza que hoy tiene el resto del escritorio (ver §7).
- **Dependencias:** `SUPABASE_SERVICE_ROLE_KEY` (server-only), las RPCs de 3.4.

### 3.8 Pantalla PWA `/empleado/materiales`
- **Responsabilidad:** armar la solicitud y ver el estado de las propias.
- **Interfaz:** buscador con autocompletado desde 3 caracteres (con *debounce*) que muestra descripción, código, unidad y existencia; se agrega cada material con cantidad a una lista editable; nota opcional; enviar. Abajo, "Mis solicitudes" con estado y detalle.
- **Dependencias:** `carnet.css`, `Toast`, sesión de empleado. La home `/empleado` gana una segunda tarjeta que lleva aquí.
- **Notas:** sin `alert`/`confirm` nativos.

### 3.9 Pantalla escritorio `materiales-gerente` (etiqueta "Material")
- **Responsabilidad:** que el gerente vea y resuelva lo pendiente de su sucursal.
- **Interfaz:** una tarjeta por solicitud con folio, empleado, fecha y desglose de líneas (código, descripción, cantidad, unidad, existencia al pedir, costo unitario, importe) y total estimado. Botones Autorizar / Rechazar. Un filtro para ver el histórico reciente (autorizadas, entregadas, rechazadas).
- **Dependencias:** `LoteCard`, `ConfirmDialog` (con motivo), `Money`, `PageHeader` — los mismos de `autorizaciones`.

### 3.10 Pantalla escritorio `materiales-almacen` (etiqueta "Almacén")
- **Responsabilidad:** surtir lo autorizado de su sucursal.
- **Interfaz:** lista de solicitudes `autorizada`; cada línea con un campo "entregado" precargado con lo solicitado y editable hacia abajo; botón "Marcar entregado" con confirmación.
- **Notas:** entregar de menos (o cero en una línea) es un caso normal y queda registrado; no genera una solicitud pendiente nueva.

### 3.11 Roles y navegación
- **Responsabilidad:** que cada quien vea su pestaña.
- **Cambios:** en `packages/domain/src/roles.ts` se agrega el rol `almacen` a `ROLES`, se reconoce en `normalizarRol()`, y se agregan los `TabId` `materiales-gerente` y `materiales-almacen`. Reparto: `gerente` suma `materiales-gerente`; `almacen` recibe `materiales-almacen`; `admin` recibe ambas.
- **Dependencias:** `Sidebar.tsx` necesita etiqueta, ícono y alta en `RUTAS_EXISTENTES` para cada pestaña nueva.
- **Notas:** hoy `normalizarRol()` manda cualquier rol desconocido a `caja_chica`. Sin el alta explícita, un usuario `almacen` entraría como caja chica — silenciosamente y sin error.

### 3.12 Avisos push (último paso, separable)
- **Responsabilidad:** avisarle al empleado cuando le autorizan, le rechazan o le entregan.
- **Interfaz:** tres tipos nuevos en `supabase/functions/enviar-push/mensajes.ts`: `material_autorizada`, `material_rechazada`, `material_entregada`, con su `topicCorto` y su texto; los disparan los route handlers de 3.7.
- **Notas:** redeployar `enviar-push` toca la función compartida con vales de comida. El cambio es aditivo (casos nuevos en un `switch`), pero por eso va **al final**, cuando lo demás ya esté probado.

---

## 4. Flujo de datos

**Pedir.** Empleado busca → `/api/materiales` (Next, servidor) → censos-web → SQL Server → resultados con existencia y costo → el empleado arma su lista → `POST /api/empleado/materiales` → RPC `material_crear` con `service_role` → encabezado + líneas con los datos del ERP ya congelados.

**Autorizar.** El gerente entra a Material; la pantalla lee las solicitudes `pendiente` **de su sucursal** (comparación directa contra la abreviatura de su sesión) → Autorizar → `POST /api/materiales/autorizar` → RPC → push `material_autorizada`.

**Entregar.** El almacenista entra a Almacén; lee las `autorizada` de su sucursal → ajusta cantidades → `POST /api/materiales/entregar` → RPC (escribe `cantidad_entregada` y cierra) → push `material_entregada`.

**Cómo se resuelve quién es el gerente:** no se guarda en ningún lado. El empleado vive en `empleados` con sucursal en nombre largo (`EL FUERTE`); al crear la solicitud se traduce a abreviatura (`FTE`) con `sucursales_map` y eso se guarda. Gerente y almacenista de esa sucursal la ven porque su propia sesión trae la misma abreviatura. Hoy hay exactamente un gerente por sucursal en las ocho.

Las lecturas del escritorio van directas a Supabase con la anon key, igual que el resto del proyecto. "Mis solicitudes" en la PWA, en cambio, se lee por route handler filtrando por el `empleado_id` de la sesión, para que la app del empleado solo muestre lo suyo. Todas las escrituras, de ambos lados, pasan por route handler.

---

## 5. Manejo de errores

| Situación | Comportamiento |
|---|---|
| ERP caído o lento (>5 s) | El buscador muestra "No se pudo consultar el catálogo, intenta de nuevo". "Mis solicitudes" y las pantallas de gerente/almacén siguen funcionando: no dependen del ERP. |
| Empleado sin sucursal, o sucursal que no está en `sucursales_map` | `material_crear` falla con mensaje explícito y no crea nada. No se inventa una sucursal por defecto. |
| Solicitud vacía, cantidad ≤ 0 o no numérica | Se valida en el formulario y **otra vez** en la RPC. |
| Doble clic en Autorizar / Entregar | El botón se deshabilita mientras corre, y la RPC rechaza la segunda porque el estado ya cambió. Gana el primero, sin duplicar. |
| Alguien intenta entregar algo no autorizado, o cancelar una solicitud ajena | La RPC lo rechaza; el mensaje dice qué estado tiene realmente. |
| Falla el push | Se ignora en silencio: el aviso es secundario, la solicitud ya quedó registrada. |

---

## 6. Pruebas

Con el vitest que ya está configurado.

- **Puras:** traducción de sucursal en los cuatro vocabularios (incluido `cod_estab`); normalizador de la respuesta del ERP (campos ausentes, `RTRIM` de códigos, existencia nula); transiciones de estado permitidas y prohibidas; cálculo del total estimado con costos nulos.
- **Componentes** (testing-library, al estilo de `AvisosCard.test.tsx`): el carrito del empleado (agregar, editar cantidad, quitar, no permitir enviar vacío) y la captura de entrega de almacén.
- **Contra datos reales:** un empleado sintético recorre el ciclo completo pendiente → autorizada → entregada, verificando en Supabase después de cada paso.
- **Manual:** que el buscador traiga productos reales de al menos dos sucursales, una de ellas CSL (para probar el linked server).

---

## 7. Seguridad

Las tablas nuevas nacen con RLS habilitada y una sola política: **`select` para la anon key**. No hay política de `insert`, `update` ni `delete`, así que por PostgREST directo nadie escribe. Las RPCs son `security definer` con `execute` revocado a `anon` y `authenticated`: la única llave que escribe es `service_role`, que vive solo en el servidor de Next.

La contrapartida de esa política de lectura es explícita: quien tenga la anon key puede leer las solicitudes de material, igual que hoy puede leer los reembolsos. Se acepta porque el escritorio lee así todo el proyecto, y porque el dato es de bajo riesgo (qué material pidió quién). Si algún día se cierra, se cierra parejo con el resto.

La identidad del empleado sale siempre de la cookie `emp_sesion` firmada con HMAC, nunca del cuerpo de la petición: nadie puede pedir material a nombre de otro.

**Límite conocido y heredado:** la sesión del escritorio (`rnd_sesion`) es JSON sin firmar, el mismo nivel de confianza que el HTML viejo, y la anon key sigue pudiendo leer las tablas `rnd_*` existentes. Este módulo no empeora eso —de hecho sus escrituras están mejor protegidas que las de reembolsos— pero tampoco lo arregla. Endurecer el escritorio sigue siendo la fase futura que ya documenta `src/lib/supabase/client.ts`.

---

## 8. Aislamiento mientras se desarrolla

El código se trabaja en `master` **local, sin pushear**, por decisión del usuario. Netlify solo despliega lo que llega al remoto, así que producción no se entera.

Las migraciones sí se aplican al Supabase real, porque no hay base de desarrollo aparte. Son puramente aditivas —dos tablas nuevas, una secuencia, cinco RPCs y una columna agregada a `sucursales_map`— y ninguna cambia el comportamiento de algo que exista hoy. El módulo es invisible hasta que el código suba.

---

## 9. Fuera de alcance (y qué falta para producción)

- **Alcanzar el ERP desde la nube.** Es el bloqueo real de producción: Netlify no ve `SERVERADP\CABOS`. Se resolverá publicando censos-web por túnel o sincronizando el catálogo a Supabase; se decide cuando el módulo ya funcione en local.
- **Autorización línea por línea** (recortar cantidades antes de mandar a almacén). Se descartó a propósito: la captura de `cantidad_entregada` cubre el caso real de "no había todo".
- **Descontar inventario en el ERP.** El módulo registra la entrega; no escribe en SQL Server.
- **Código de confirmación del empleado al recibir** (estilo OTP de vales) y **foto de evidencia**. Se consideraron y se dejaron fuera de esta versión.
- **Reportes y exportación a Excel** de solicitudes de material.
- **Alta de usuarios con rol `almacen`.** El código reconoce el rol; dar de alta a las personas es trabajo del usuario en `rnd_usuarios`.
