-- Historial de folios descargados del ERP.
--
-- Sirve para dos cosas distintas, y por eso trae lo que trae:
--
--  1. Consulta normal: qué se descargó, cuándo, quién y con qué folio de BMS.
--     El folio es el dato que permite ir a buscarlo al ERP.
--
--  2. Reconciliación: encontrar las aplicaciones que se quedaron 'en_proceso'.
--     Esas son las que se cayeron entre "BMS grabó" y "aquí se registró", y hay
--     que cotejarlas a mano contra BMS. Sin una pantalla que las muestre,
--     quedarían invisibles justo cuando más importa verlas.

create or replace view public.rnd_inventario_historial
with (security_invoker = on) as
select
  a.id,
  a.folio_bms,
  a.transaccion,
  a.cod_estab,
  a.sucursal,
  a.estado,
  a.partidas,
  a.unidades,
  a.costo_total,
  a.aplicado_por,
  a.aplicado_en,
  a.cancelado_por,
  a.cancelado_en,
  a.motivo_cancelacion,
  -- Cuántas partidas quedaron con una cantidad distinta a la pedida. Hoy
  -- siempre es 0 (el ERP revierte el folio completo si recorta), pero si algún
  -- día aparece un número aquí es la señal de que algo se registró a medias.
  (select count(*)
     from public.rnd_inventario_aplicaciones_lineas al
    where al.aplicacion_id = a.id
      and al.cantidad_aplicada <> al.cantidad_solicitada) as partidas_con_diferencia,
  -- Las solicitudes de uso interno que alimentaron este folio, para poder ir
  -- del movimiento del ERP de vuelta a quién recibió el material.
  (select string_agg(distinct s.folio, ', ' order by s.folio)
     from public.rnd_inventario_aplicaciones_lineas al
     join public.rnd_material_lineas ml on ml.id = al.linea_id
     join public.rnd_material_solicitudes s on s.id = ml.solicitud_id
    where al.aplicacion_id = a.id) as folios_solicitud
from public.rnd_inventario_aplicaciones a;

comment on view public.rnd_inventario_historial is
  'Folios de BMS generados desde el módulo INVENTARIOS, con su rastro hasta las solicitudes de uso interno que los originaron';

-- Detalle de un folio: qué producto, cuánto y para quién.
create or replace view public.rnd_inventario_historial_lineas
with (security_invoker = on) as
select
  al.aplicacion_id,
  al.linea_id,
  al.cod_prod,
  al.cantidad_solicitada,
  al.cantidad_aplicada,
  al.costo_unitario,
  ml.descripcion,
  ml.unidad,
  ml.area,
  s.folio           as folio_solicitud,
  s.empleado_nombre
from public.rnd_inventario_aplicaciones_lineas al
join public.rnd_material_lineas ml on ml.id = al.linea_id
join public.rnd_material_solicitudes s on s.id = ml.solicitud_id;

comment on view public.rnd_inventario_historial_lineas is
  'Partidas de cada folio de INVENTARIOS, ligadas al empleado que recibió el material';
