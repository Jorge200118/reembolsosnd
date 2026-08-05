# Ficha de solicitud — módulo Inventarios

**Fecha:** 2026-08-04
**Estado:** diseño aprobado, pendiente de plan de implementación

## 1. El problema

Quien tiene el rol `inventarios` decide afectar el inventario del ERP: marca
partidas y genera un folio de transacción 40 que baja mercancía de BMS. Es una
operación que no se deshace con un botón —hay que cancelar el folio— y hoy se
toma **a ciegas sobre el origen del movimiento**.

La pantalla muestra qué producto, cuánto y para quién. No muestra:

- **Quién autorizó** esa solicitud de uso interno.
- **La evidencia de que el material realmente se entregó**: las fotos que
  almacén subió al cerrar cada área.

Las dos cosas ya están guardadas en la base. **Quién autorizó** vive en
`autorizado_por` y `fecha_autorizacion` de `rnd_material_solicitudes`, desde la
[0020](../../../supabase/migrations/0020_material_tablas.sql). **La evidencia**
vive en dos lugares: el `evidencia_path` de la solicitud, que agrega la
[0028](../../../supabase/migrations/0028_codigo_entrega.sql) y que la
[0029](../../../supabase/migrations/0029_material_entregar_evidencia.sql) volvió
obligatorio al entregar, y la foto por área en `rnd_material_entregas_area`, que
crea la [0032](../../../supabase/migrations/0032_material_entregar_por_area.sql).

Ninguna de las dos llega a esta pantalla. Y la de por área **no llega a
ninguna**: `rnd_material_entregas_area` no se lee desde ningún punto de la
aplicación. Lo que hoy ven gerente y almacén en `SolicitudCard` es un enlace a
`evidencia_path`, que es **una sola foto —la última que se subió—**, porque cada
área que entrega la pisa. Si tres áreas surtieron una solicitud, dos de esas
tres fotos no las ha visto nunca nadie.

El resultado es doble: la última persona de la cadena —la única cuya acción
mueve dinero contable— es la que menos contexto tiene, y la evidencia por área
que el sistema lleva meses guardando está muerta en la base.

## 2. La solución en una frase

El folio de solicitud se vuelve clicable en las dos pestañas de Inventarios y
abre una **ficha** con quién pidió, quién autorizó y las fotos de entrega por
área.

## 3. Qué se ve

```
┌─ SUI-000050 ─────────────────────────── ✕ ─┐
│ Pidió      Juan Pérez · FTE                │
│ Motivo     "Reparar portón de la nave 2"   │
│ Autorizó   Gerente López · 12/07/26 10:20  │
│ ─────────────────────────────────────────  │
│ Entregas                                   │
│  FERRETERIA · Ana Ruiz · 12/07 11:05       │
│   ┌────────┐                               │
│   │  🖼️    │  ← clic: se agranda           │
│   └────────┘                               │
│  NAVE2 · Luis Mora · 12/07 13:40           │
│   ┌────────┐                               │
│   │  🖼️    │                               │
│   └────────┘                               │
└────────────────────────────────────────────┘
```

Miniatura y no solo un enlace: el punto es que Inventarios **confirme de un
vistazo que hay evidencia real** antes de aplicar. Un enlace obliga a abrir una
pestaña por área y a perder la lista de abajo; la miniatura resuelve el 90% de
los casos sin salir de la pantalla, y el clic amplía cuando hace falta leer algo
de la foto.

Se reusa el esqueleto de `ComprobantesModal` (fondo oscuro, `Esc` cierra, clic
afuera cierra) pero **no el componente**: ese está amarrado al tipo `Fila` de
reembolsos y a `normalizarArchivos`, vocabulario que aquí no aplica.

## 4. Cómo se arma la lista de entregas

La regla es **una sola**, y no un respaldo condicional:

> Se muestran todas las filas de `rnd_material_entregas_area` de esa solicitud.
> Además, si el `evidencia_path` de la solicitud **no coincide con el de ninguna
> de esas filas**, se muestra como una entrega más, sin etiqueta de área.

Escrita así cubre los cuatro casos reales sin dejar ninguno indefinido:

1. **Entrega por área** (lo normal desde la 0032): una fila por área, cada una
   con su foto, su encargado y su hora. El `evidencia_path` de la solicitud es
   una copia del de la última área que entregó, así que coincide y no se
   duplica.
2. **Entrega sin área**: sucursales que no usan áreas, o solicitudes anteriores
   a la 0032. No hay filas de área; queda solo la entrega de la solicitud, sin
   etiqueta.
3. **Mixto**: hay filas de área **y** la solicitud la cerró alguien sin área.
   `material_entregar` con `p_area` nulo no inserta en `rnd_material_entregas_area`
   ([0032:246-249](../../../supabase/migrations/0032_material_entregar_por_area.sql#L246-L249))
   pero sí escribe `evidencia_path` ([0032:262-272](../../../supabase/migrations/0032_material_entregar_por_area.sql#L262-L272)).
   Con una regla de "si no hay filas de área, usa la de la solicitud", esa foto
   se perdería en silencio — que es justo lo que este módulo no puede permitirse.
   Con la regla de arriba, aparece como entrega extra sin área.
4. **Sin foto en ningún lado**: dice *"sin foto registrada"*. No debería pasar
   —la RPC exige foto desde la 0029— pero un hueco silencioso se lee como un
   error de carga, y aquí la diferencia importa.

Hay un quinto caso que **no es de datos sino de infraestructura**: la foto
existe pero no se pudo firmar (ver §8). Ese dice *"no se pudo abrir la foto"* y
**nunca** *"sin foto registrada"*. Confundir los dos mensajes sería el peor error
de esta pantalla: uno afirma que no hubo evidencia, el otro que la hay y no se
alcanzó a mostrar.

Sin autorizador (`autorizado_por` nulo) se muestra `—`. Tampoco debería pasar en
algo ya entregado, y por eso mismo conviene que se vea.

## 5. Dónde se hace clic

**Pestaña "Por descargar"** ([page.tsx](../../../src/app/(app)/inventarios/page.tsx)):
el folio de la columna *Solicitud* pasa de `<div>` a `<button>`. Nada más cambia
en la tabla.

**Pestaña "Historial"** ([HistorialFolios.tsx](../../../src/components/inventarios/HistorialFolios.tsx)):
dentro del detalle de un folio de BMS, la celda *Solicitud* de cada partida se
vuelve botón.

**No necesita `stopPropagation`.** `FilaFolio` devuelve un fragmento con dos
`<tr>` **hermanos**: el de resumen, que lleva el `onClick` que abre y cierra, y
el del detalle, que no lleva ninguno. El folio de una partida vive en la tabla
interna del segundo, así que el clic no tiene por dónde burbujear hasta el
handler del primero. (El botón *Cancelar* sí lo lleva, y con razón: ese sí está
dentro del renglón clicable.)

La columna *Solicitudes* del renglón de resumen se queda como está: es un
`string_agg` de varios folios separados por coma, no un objetivo de clic. Ahí sí
haría falta `stopPropagation` el día que se quiera hacer algo con ella.

Se descartó poner el autorizador y las fotos como columnas fijas de la tabla:
una solicitud aporta varias partidas, así que el dato se repetiría renglón por
renglón, y las fotos no caben en una celda.

## 6. Cómo llega el dato

**Un endpoint propio, bajo demanda, con llave = folio de solicitud.**

```
GET /api/inventarios/ficha?folio=SUI-000050
```

Devuelve la solicitud, el autorizador y las entregas, cada una con su foto ya
firmada — o con `url: null` si esa firma en concreto falló (§8).

**Por qué el folio y no el uuid.** Las dos pestañas ya muestran el folio: la
vista de pendientes lo trae como `folio_solicitud` y la de historial también. El
uuid solo lo tiene la de pendientes; usarlo obligaría a una migración para
agregar `solicitud_id` a `rnd_inventario_historial_lineas`. El folio es `unique`
en `rnd_material_solicitudes` desde la
[0020](../../../supabase/migrations/0020_material_tablas.sql), así que identifica
igual de bien. **Este diseño no lleva ninguna migración.**

**Por qué bajo demanda y no en la carga inicial.** Dos razones:

1. El `GET /api/inventarios` ya espera al ERP para cada sucursal. Colgarle una
   consulta más lo hace más lento en el camino que se recorre siempre, para un
   dato que se consulta de vez en cuando.
2. Las URLs firmadas caducan. Firmar las fotos de 50 solicitudes al cargar es
   trabajo tirado, y las que sí se abran media hora después ya no servirían.

Se descartó reusar `/api/materiales/evidencia`: esa ruta trabaja con el
`evidencia_path` de la solicitud —que es **una sola foto, la última que se
subió**— y no con las entregas por área. Ampliarla significaría reescribirla y
poner en riesgo las pantallas de gerente y almacén, que ya funcionan.

## 7. Archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/inventarios/ficha.ts` *(nuevo)* | Lee la solicitud por folio y sus entregas por área. Datos puros: sin React, sin storage, sin firmar nada. Con su test. |
| `src/app/api/inventarios/ficha/route.ts` *(nuevo)* | Sesión, permiso, sucursal, y firma de las fotos. |
| `src/components/inventarios/FichaSolicitud.tsx` *(nuevo)* | El modal. Trae su dato al montarse. |
| `src/app/(app)/inventarios/page.tsx` | Folio clicable y montar la ficha. |
| `src/components/inventarios/HistorialFolios.tsx` | Folio clicable en el detalle. |

La separación entre `ficha.ts` (datos) y la ruta (sesión + storage) es la misma
que ya usan `pendientes.ts` e `historial.ts` frente a sus rutas. Se mantiene para
que la regla del §4 —cómo se arma la lista de entregas, y cuándo la foto de la
solicitud cuenta como una entrega más— se pueda probar sin levantar Supabase ni
el bucket. Es la única parte de este trabajo con lógica que se puede equivocar
en silencio.

## 8. Seguridad

**La sucursal sale de la sesión firmada, nunca del request.** Es la misma regla
que ya aplica `/api/materiales/evidencia`: sin eso, cualquiera con sesión podría
ver la evidencia de otra sucursal cambiando la cadena del folio, que es
adivinable (`SUI-` + consecutivo).

Orden de validación en la ruta:

1. `actorDeMaterial("inventarios")` — deriva el permiso de `ROL_TABS`, así que
   la ruta y el middleware no pueden discrepar.
2. Se lee la solicitud por folio. Si no existe → 404.
3. Si la sucursal de la solicitud no es la del actor → 403.
4. Se firma **cada foto por separado** con `urlFirmada`, 15 minutos.

`urlFirmada` devuelve `string | null` — null si falta configuración del servidor
o si storage responde con error. **Un null no tumba la ficha:** la ruta responde
200 con todo lo demás (quién pidió, quién autorizó, las otras entregas) y esa
entrega viaja con `url: null`, que la pantalla dibuja como *"no se pudo abrir la
foto"* (§4). Solo cortan la respuesta el 404 y el 403.

Se descarta copiar el 503 completo de `/api/materiales/evidencia`: allí la foto
**es** la respuesta, así que fallar entera tiene sentido. Aquí una foto rota
escondería también al autorizador y al resto de la evidencia, y §9 dice que esta
ficha es contexto para decidir, no un requisito para operar.

**Sobre el comodín `*`:** `actorDeMaterial` lo devuelve solo para `admin`, y
`admin` **no** tiene la pestaña `inventarios` en `ROL_TABS`, así que hoy no hay
ningún usuario que llegue aquí con `*`. La comparación lo contempla de todos
modos, igual que `pendientesPorSucursal`, para que el día que se le dé acceso al
admin no haya que acordarse de este archivo.

**15 minutos y no 5** (el default de `urlFirmada`): la ficha se queda abierta
mientras se revisan varias fotos y se comparan contra la tabla. Con 5 minutos
una miniatura se rompería sola a media revisión.

> ### Lo que la firma NO protege hoy
>
> Al verificar este diseño se comprobó contra la **base de producción** que el
> bucket `rnd-uso-interno` es legible con la llave anónima, a pesar de estar
> marcado `public = false` y de que la
> [0030](../../../supabase/migrations/0030_bucket_uso_interno.sql) dice *"a
> propósito NO se crean políticas"*.
>
> El motivo: `storage.objects` tiene una política `storage_allow_select` con
> `using (true)` para los roles `anon` y `authenticated`, **sin filtro por
> bucket**. No vive en las migraciones de este repo, pero está activa. Y los
> paths son enumerables, porque la 0032 abrió `rnd_material_entregas_area` a
> `anon` con `select ... using (true)`, `evidencia_path` incluido.
>
> Comprobado con curl: listar los `evidencia_path` con la llave pública devuelve
> `HTTP 200`; bajar el objeto directo del bucket con esa misma llave devuelve
> `HTTP 200` y la foto completa. Sin llave, `HTTP 400`. La llave anónima llega
> al navegador.
>
> **Esto es anterior a este trabajo y no empeora con él:** la ficha no publica
> ningún path nuevo, no afloja ningún permiso y sigue firmando. Pero invalida el
> argumento de que la URL firmada es la única puerta, así que se documenta en
> vez de callarlo. Cerrarlo queda **fuera de alcance** (§10): esas políticas
> cubren *todos* los buckets de un proyecto de Supabase compartido con otras
> aplicaciones, y tocarlas necesita su propia revisión de qué se rompe.

## 9. Errores

Si la ficha no carga, el modal muestra el error y se puede cerrar. La tabla de
abajo sigue usable y **el botón *Aplicar a BMS* no depende de esto en ningún
momento**: la ficha es contexto para decidir, no un requisito para operar. Que
una consulta de apoyo pueda trabar la operación principal sería peor que no
tenerla.

El fallo se trata como el detalle del historial, que ya sigue este criterio: si
no llega, la fila sigue siendo útil.

## 10. Fuera de alcance

- **Ver la ficha desde gerente o almacén.** Hoy tienen el enlace a la última
  foto en `SolicitudCard` y les alcanza para su trabajo. Darles también la
  evidencia por área sería una mejora real —hoy nadie la ve— pero es otro
  trabajo, toca dos pantallas que ya funcionan, y no es lo que se pidió.
- **Cerrar el hueco de lectura del bucket** descrito en §8. Es un problema real
  y anterior a esto, pero vive en políticas que no están en las migraciones de
  este repo y que cubren todos los buckets del proyecto de Supabase, compartido
  con otras aplicaciones. Meterlo aquí convertiría una pantalla de consulta en
  una migración de infraestructura con riesgo para sistemas que no son este.
- **Bloquear el "Aplicar a BMS" cuando falte evidencia.** Es una regla de
  negocio que nadie pidió y que hoy no se puede sostener: la RPC ya exige foto
  desde la 0029, así que solo afectaría a solicitudes viejas.
- **Descargar las fotos o exportarlas.** Se ven; no se bajan desde aquí.
- **Guardar en la aplicación de BMS quién autorizó.** El rastro ya existe del
  folio de BMS hacia la solicitud, y de ahí a su autorizador.

## 11. Riesgos aceptados

**Un round trip al abrir la ficha.** Se paga una espera corta al hacer clic a
cambio de no encarecer la carga de la pantalla ni firmar fotos que nadie va a
ver. El modal se abre de inmediato con un estado de carga, así que la espera se
ve, no se sufre.

**La ficha se pide por folio, que es adivinable.** Mitigado por la verificación
de sucursal del punto 8: adivinar el folio de otra sucursal devuelve 403. Dentro
de la propia sucursal, ver la ficha de una solicitud es exactamente lo que este
rol debe poder hacer.
