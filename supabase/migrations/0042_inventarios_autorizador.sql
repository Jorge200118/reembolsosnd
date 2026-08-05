-- Quién autorizó, disponible para segmentar en las dos pestañas de INVENTARIOS.
--
-- El dato ya existía (`autorizado_por` en la solicitud, desde la 0020) y la
-- ficha lo muestra al hacer clic en un folio, pero para FILTRAR por él tiene que
-- venir en la misma consulta que alimenta la lista: filtrar abriendo tarjeta por
-- tarjeta no es filtrar.
--
-- Las dos vistas se recrean completas porque `create or replace view` no admite
-- reordenar ni renombrar lo que ya existe; las columnas nuevas van AL FINAL.

-- ── Pendientes: el autorizador de la solicitud de cada partida ────────────────
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
  s.motivo,
  s.autorizado_por
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
  'Partidas ya entregadas al empleado que aún no se descargan de BMS. Alimenta la pantalla del rol INVENTARIOS, con el motivo (va a las notas del folio de BMS) y quién autorizó.';

-- ── Historial: los autorizadores detrás de cada folio de BMS ──────────────────
-- Un folio agrupa varias solicitudes y cada una la autorizó alguien, así que
-- esto es una LISTA, no un nombre. Se separa con '|' y no con ', ' —como los
-- folios— porque son nombres de personas y la coma se lee como parte del texto.
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
  (select count(*)
     from public.rnd_inventario_aplicaciones_lineas al
    where al.aplicacion_id = a.id
      and al.cantidad_aplicada <> al.cantidad_solicitada) as partidas_con_diferencia,
  (select string_agg(distinct s.folio, ', ' order by s.folio)
     from public.rnd_inventario_aplicaciones_lineas al
     join public.rnd_material_lineas ml on ml.id = al.linea_id
     join public.rnd_material_solicitudes s on s.id = ml.solicitud_id
    where al.aplicacion_id = a.id) as folios_solicitud,
  (select string_agg(distinct s.autorizado_por, '|' order by s.autorizado_por)
     from public.rnd_inventario_aplicaciones_lineas al
     join public.rnd_material_lineas ml on ml.id = al.linea_id
     join public.rnd_material_solicitudes s on s.id = ml.solicitud_id
    where al.aplicacion_id = a.id
      and s.autorizado_por is not null) as autorizadores
from public.rnd_inventario_aplicaciones a;

comment on view public.rnd_inventario_historial is
  'Folios de BMS generados desde el módulo INVENTARIOS, con su rastro hasta las solicitudes de uso interno que los originaron y quién las autorizó';
