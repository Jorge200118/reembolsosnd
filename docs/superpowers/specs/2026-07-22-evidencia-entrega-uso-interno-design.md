# Evidencia de entrega — módulo Uso interno

**Fecha:** 2026-07-22
**Estado:** diseño aprobado, pendiente de plan de implementación

## 1. El problema

Hoy el almacenista marca una solicitud como entregada capturando cuánto surtió de
cada renglón, y con eso se cierra. No queda nada que respalde esa afirmación: si
el empleado después dice que nunca le dieron el material, o que le dieron menos
de lo anotado, no hay contra qué contrastarlo. El registro es la palabra de una
sola de las dos partes.

Se quiere evidencia de **las dos**: que almacén sí surtió, y que el empleado sí
recibió eso que dice el papel.

## 2. La solución en una frase

Al cerrar la entrega, el almacenista **sube una foto** y el empleado **dicta un
código de 6 dígitos** que solo él tiene. Sin las dos cosas, la entrega no cierra.

## 3. Por qué un código y no una firma

Se evaluó capturar la firma del empleado con el dedo. Se descartó por dos razones,
en este orden:

1. **El aparato varía por sucursal.** Si el almacenista trabaja en una PC con
   mouse, la firma sale un garabato inservible. Diseñar para las dos cosas
   significaba dos caminos de código y dos formas de fallar.
2. **La firma dejaba un estado colgante.** El material ya salió del almacén y la
   firma llega después; si el empleado se va sin firmar, queda una entrega a
   medias que alguien tiene que perseguir. El código, en cambio, se pide **antes**
   de soltar el material: nada queda pendiente porque sin código no hay entrega.

## 4. El orden importa más que el mecanismo

Un código pedido **antes** de capturar las cantidades solo prueba que el empleado
se paró en el mostrador. Pedido **después**, prueba que vio lo que le estaban
dando y lo aceptó.

Es el mismo código y el mismo trabajo; cambia únicamente el orden de la pantalla.
La pantalla de almacén **debe** pedir el código al final, mostrando el resumen de
lo que se lleva:

```
Entregar SUI-000028 · Carlos Ruiz
─────────────────────────────────
CAJA 100 TAQUETES     2 de 2
BOLSA 4 TAQUETES      1 de 3   ← incompleto
─────────────────────────────────
Foto de la entrega:   [ elegir archivo ]
Pídele su código a Carlos Ruiz:
      [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]
                        [ Marcar entregado ]
```

El botón permanece deshabilitado hasta que haya foto y seis dígitos.

## 5. El código

**Cuándo se genera:** dentro de `material_autorizar`, en la misma transacción que
autoriza. Una solicitud autorizada siempre tiene código; una pendiente nunca.

**Formato:** 6 dígitos.

**Cómo se guarda** (mismo patrón que el código de comidas, en producción desde
julio de 2026):

- `codigo_hash` — bcrypt (`crypt(codigo, gen_salt('bf'))`). Es contra lo que se
  verifica. No permite recuperar el código.
- `codigo_cifrado` — `armor(pgp_sym_encrypt(codigo, <llave del Vault>))`, con el
  secreto `otp_cripto_key` que ya existe. Sirve para **volver a mostrárselo** al
  empleado si cierra la app. Sin esto el código sería irrecuperable y una app
  cerrada dejaría al empleado sin poder recoger.

**Generación:** con `gen_random_bytes(3)` y módulo 10^6, no con `random()`.
`random()` no es criptográficamente seguro y un código predecible permitiría al
almacenista cerrar entregas sin que el empleado esté presente — que es
exactamente lo que este diseño quiere impedir. El sesgo del módulo sobre 3 bytes
(16.7M → 1M) es despreciable para este uso.

**Quién lo ve:** solo el dueño de la solicitud, a través de una RPC que exige su
`empleado_id`, y solo mientras la solicitud esté `autorizada`.

**Un solo uso:** al verificarse correctamente queda marcado `codigo_usado_en` y no
sirve otra vez.

**Intentos fallidos:** contador en la solicitud. A los 5 fallos se bloquea 15
minutos (`codigo_bloqueado_hasta`) y se destraba solo. Es el mismo criterio del
login del empleado.

**Al vencer el bloqueo, los intentos vuelven a 0.** Sin esto el sexto intento
volvería a bloquear de inmediato y la solicitud quedaría inservible en la
práctica, que es justo lo que el bloqueo temporal quiere evitar. El reinicio se
hace al detectar que `codigo_bloqueado_hasta` ya pasó, dentro de la misma
verificación.

> **Por qué no un "el gerente lo libera":** sería la puerta de escape que el
> negocio decidió cerrar. Si existe, en un mes la costumbre es hablarle al
> gerente y la evidencia deja de ser pareja. Quince minutos molestan lo
> suficiente para que nadie lo use como atajo, y ninguna solicitud queda
> inservible para siempre.

## 6. Modelo de datos

Columnas nuevas en `rnd_material_solicitudes` (no una tabla aparte: la relación
es 1 a 1 con la solicitud y no hay historial que guardar):

| Columna | Tipo | Para qué |
|---|---|---|
| `codigo_hash` | text | contra qué se verifica |
| `codigo_cifrado` | text | para volver a mostrárselo al dueño |
| `codigo_intentos` | int, default 0 | fallos acumulados |
| `codigo_bloqueado_hasta` | timestamptz | null salvo cuando está bloqueado |
| `codigo_usado_en` | timestamptz | cuándo se verificó; también marca "ya se usó" |
| `evidencia_path` | text | ruta de la foto en el bucket privado |

No se agrega ningún estado nuevo. La máquina de estados
(`pendiente → autorizada → entregada`) se queda como está.

## 7. La foto

**Bucket nuevo y privado: `rnd-uso-interno`.** No se reusa `rnd-documentos`, que
es el que usa la evidencia de reembolsos, porque **está marcado como público**:
cualquiera con la URL ve el archivo sin sesión. Repetir ese patrón sería
arrastrar un problema conocido a un módulo nuevo.

**La sube el servidor, no el navegador.** El cliente comprime la imagen con
`prepararArchivo()` (ya existe, `src/lib/files/comprimir.ts`: solo comprime
imágenes >200KB, a JPEG 30%, ancho máximo 1200) y la manda a un route handler
propio que verifica la sesión con `actorDeMaterial("materiales-almacen")` y sube
con `service_role`. Así el bucket queda cerrado del todo y no hacen falta
políticas de storage para `anon`.

**Ruta:** `entregas/<solicitud_id>/<timestamp>_<nombre>`.

**Para verla:** URL firmada que caduca, generada en el servidor y solo para
gerente, almacén o admin de esa sucursal.

**Contenido:** libre, a criterio del almacenista. La pantalla lleva una leyenda
sugiriendo qué conviene fotografiar (el material sobre el mostrador), sin
obligar. Se decidió no imponerlo para no trabar el mostrador.

## 8. Cambios en las RPCs

### `material_autorizar` (existente)
Genera el código y guarda hash + cifrado, en la misma transacción.

### `material_codigo` (nueva)
`material_codigo(p_id uuid, p_empleado_id int) → jsonb`

Devuelve `{ok:true, codigo:"472915"}` solo si la solicitud es de ese empleado y
está `autorizada`. En cualquier otro caso —no existe, es de alguien más, está
pendiente, ya se entregó— devuelve el mismo `{ok:false, error:"No disponible"}`,
sin distinguir el motivo: si el mensaje cambiara según el caso, serviría para
averiguar qué solicitudes existen y de quién son.

### `material_entregar` (existente, se endurece)
Gana `p_codigo text` y `p_evidencia_path text`, ambos **obligatorios**. Orden de
validación dentro del candado de fila que ya existe:

1. estado = `autorizada` (ya existe)
2. sucursal del actor (ya existe)
3. `p_evidencia_path` no vacío
4. bloqueo vigente → error sin gastar intento
5. `crypt(p_codigo, codigo_hash) = codigo_hash`
   - **no coincide:** `codigo_intentos + 1`; si llega a 5,
     `codigo_bloqueado_hasta = now() + 15 min`; devuelve error
   - **coincide:** sigue
6. Escribe cantidades, `codigo_usado_en`, `evidencia_path`, cierra la entrega

> **Detalle que hay que respetar:** el incremento de intentos se escribe y
> **después** se hace `return` con el error. Eso persiste, porque la función
> corre en la transacción de quien llama y un `return` normal no revierte. Es la
> misma propiedad que en la migración 0022 fue una trampa (devolver `ok:false`
> tras escribir no deshacía nada); aquí juega a favor y hay que conservarla.
> Si algún día se cambia a `raise`, el contador dejaría de funcionar.

**Search path:** las funciones que toquen `crypt`, `gen_salt`, `pgp_sym_encrypt`,
`armor` o `gen_random_bytes` necesitan `set search_path = public, extensions`.
Con solo `public` revientan, porque pgcrypto vive en `extensions`.

## 9. Pantallas

**PWA del empleado** (`/empleado/materiales`): cada solicitud `autorizada` muestra
un botón **"Ver mi código"** que revela los 6 dígitos en grande. Mismo gesto que
el código de comidas, que los choferes ya conocen.

**Escritorio, almacén** (`/materiales-almacen`): el diálogo de confirmación gana
el selector de foto y los seis casilleros del código, en ese orden, después del
resumen de cantidades.

**Escritorio, gerente y almacén:** la solicitud entregada muestra la foto (URL
firmada) y la hora en que se verificó el código.

## 10. Avisos

El push de `material_autorizada` ya existe; cambia su texto para mencionar que ya
tiene código: *"Tu gerente autorizó tu uso interno. Ya tienes tu código para
recoger en almacén."* No se agregan tipos nuevos.

## 11. Seguridad

- El código nunca viaja al escritorio: el almacenista lo teclea, no lo consulta.
- Las RPCs nuevas siguen con `execute` revocado a `anon` y `authenticated`.
- La foto se sube y se lee siempre con la sesión firmada verificada del lado del
  servidor, nunca directo desde el navegador con la llave pública.
- El código se verifica **dentro de la misma transacción** que cierra la entrega,
  bajo el `for update` que ya existe: no hay ventana entre "verifiqué" y "cerré".

## 12. Fuera de alcance

- **Comprobante en PDF.** La pantalla muestra la evidencia; generar y almacenar
  un PDF por entrega no lo pidió nadie todavía.
- **Que el empleado vea la foto.** Es evidencia interna; él ya tiene las
  cantidades en su app.
- **Recoger a nombre de otro.** El negocio decidió que solo recoge el titular, así
  que no se agrega ninguna columna para el nombre de quien recoge: hoy es siempre
  el `empleado_nombre` que la solicitud ya guarda desde que se creó, y el código
  verificado es de esa misma persona. Si algún día se permite mandar a un
  compañero, ahí sí habrá que agregar la columna.
- **Renombrar rutas o tablas.** Siguen diciendo `material` a propósito.

## 13. Riesgos aceptados

**El empleado llega sin celular y sin código.** No hay entrega. Es la decisión
explícita del negocio: sin código no se entrega, punto. Se espera fricción real
en el mostrador las primeras semanas, y presión sobre el almacenista para que
haga excepciones. No existe ninguna forma de hacerlas dentro del sistema, que es
justamente lo que se buscó.

**La foto es de contenido libre.** Sin una regla estricta, la calidad de la
evidencia va a variar entre personas y sucursales. Se aceptó a cambio de no
trabar el mostrador. La leyenda sugerida mitiga, no resuelve.

**El código prueba conformidad, no entendimiento.** Un empleado apurado puede
dictar su código sin leer las cantidades en la pantalla. Es el mismo límite que
tiene cualquier firma de conformidad en papel.

## 14. Momento oportuno

`rnd_material_solicitudes` está **vacía**: cero solicitudes emitidas. No hay
historial sin evidencia con el que convivir ni migración de datos que hacer. La
regla aplica pareja desde la primera entrega del módulo.
