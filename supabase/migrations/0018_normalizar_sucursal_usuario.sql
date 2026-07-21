-- Limpieza de `rnd_reembolsos.sucursal_usuario`: nombres largos -> abreviaturas.
--
-- Problema: la columna es del vocabulario de ABREVIATURAS (el de
-- `rnd_usuarios.sucursal`: FTE, LMM, SJC…), pero el alta de comidas desde la
-- pantalla del gerente guardaba `empleados.sucursal`, que es el OTRO vocabulario,
-- el de nombres largos (EL FUERTE, MATRIZ, SAN JOSE…).
--
--   * useCrearComidasLote.ts: `emp.sucursal ?? sucursalSesion` -> ganaba el largo.
--   * crear-comida/index.ts:  `sucursal_usuario ?? empleado.sucursal` -> respaldo largo.
--
-- El código lleva así desde el 2026-07-02, pero solo ensució datos a partir del
-- 2026-07-20, que fue cuando los gerentes empezaron a usar la pantalla. Alcance
-- medido antes de aplicar: 51 filas, todas concepto='COMIDAS', del 20 y 21 de
-- julio (SAN JOSE 22, EL FUERTE 8, MATRIZ 8, CULIACAN 7, TAMARAL 6). El resto de
-- la tabla ya estaba limpio.
--
-- Ambos puntos de escritura quedaron corregidos; `crear-comida` además normaliza
-- contra `sucursales_map` antes de insertar, así que esto es de una sola vez.

update rnd_reembolsos r
set sucursal_usuario = m.abrev
from sucursales_map m
where r.sucursal_usuario is not null
  -- solo lo que NO es ya una abreviatura válida...
  and upper(btrim(r.sucursal_usuario)) not in (select upper(btrim(abrev)) from sucursales_map)
  -- ...y que sí reconocemos como nombre largo del catálogo. Un valor que no mapee
  -- se queda como está: preferimos un dato raro visible a uno borrado en silencio.
  and upper(btrim(m.nombre_largo)) = upper(btrim(r.sucursal_usuario));
