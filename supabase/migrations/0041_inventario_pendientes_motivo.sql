-- El motivo de la solicitud viaja hasta BMS.
--
-- Hasta ahora el folio de transacción 40 se generaba con el campo `notas` de
-- `movimientos_internos` en blanco: quien abría el movimiento en BMS veía qué
-- productos salieron y cuántos, pero no PARA QUÉ. El dato existía desde el
-- principio (y es obligatorio desde la 0040), solo que se quedaba en esta base.
--
-- La vista es lo único que hay que tocar: `motivo` ya está en la solicitud, a un
-- join de distancia. Se agrega AL FINAL porque `create or replace view` no
-- permite reordenar ni renombrar las columnas que ya existen.

create or replace view public.rnd_inventario_pendientes
with (security_invoker = on) as
select
  l.id                as linea_id,
  s.id                as solicitud_id,
  s.folio             as folio_solicitud,
  s.sucursal,
  s.cod_estab,
  s.empleado_id,
  s.empleado_nombre,
  s.fecha_entrega,
  l.area,
  l.cod_prod,
  l.descripcion,
  l.unidad,
  l.cantidad_entregada as cantidad,
  l.costo_unitario,
  s.motivo
from public.rnd_material_lineas l
join public.rnd_material_solicitudes s on s.id = l.solicitud_id
where l.cantidad_entregada is not null
  and l.cantidad_entregada > 0
  and s.estado = 'entregada'
  and not exists (
    select 1
    from public.rnd_inventario_aplicaciones_lineas al
    join public.rnd_inventario_aplicaciones a on a.id = al.aplicacion_id
    where al.linea_id = l.id
      and a.estado = 'aplicada'
  );

comment on view public.rnd_inventario_pendientes is
  'Partidas ya entregadas al empleado que aún no se descargan de BMS. Alimenta la pantalla del rol INVENTARIOS. Trae el motivo para escribirlo en las notas del folio de BMS.';
