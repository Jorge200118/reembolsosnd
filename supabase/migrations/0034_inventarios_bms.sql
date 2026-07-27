-- Módulo INVENTARIOS: descargar de BMS lo que ya se entregó al empleado.
--
-- Hoy una entrega de uso interno queda registrada aquí, pero BMS no se entera:
-- el ERP sigue creyendo que el material está en la sucursal. Alguien lo captura
-- a mano después, o el inventario se descuadra. Esta tabla es el registro de
-- qué partidas ya se bajaron del ERP y con qué folio, para que:
--   1. no se descarguen dos veces (la pantalla solo ofrece lo no aplicado), y
--   2. se pueda rastrear/cancelar un folio de BMS desde aquí.
--
-- El movimiento en BMS es transacción 40 (Disminuciones de inventario) con
-- razón 17 = 'Uso Interno'. Un folio agrupa TODAS las partidas seleccionadas de
-- una sucursal en una corrida, que es como lo pidió el área.
--
-- FASE 1: esta tabla se crea pero nadie la escribe todavía; la pantalla es de
-- solo lectura y el "aplicar" genera un preview. Existe desde ahora para que la
-- consulta de pendientes ya sea la definitiva y no haya que reescribirla.

-- ── Cabecera: un folio de BMS por corrida ────────────────────────────────────
create table if not exists public.rnd_inventario_aplicaciones (
  id             uuid primary key default gen_random_uuid(),
  -- Folio y transacción TAL COMO quedaron en BMS. Juntos identifican el
  -- movimiento allá; se guardan por separado porque así los pide el ERP para
  -- cancelar (cancelar_entysal recibe folio + transaccion).
  folio_bms      text not null,
  transaccion    text not null default '40',
  cod_estab      int  not null,
  sucursal       text not null,            -- abreviatura (LMM, FTE...), para filtrar igual que el resto del módulo
  razon_aod      text not null default '17',  -- 'Uso Interno' en razones_aod_inventario
  estado         text not null default 'aplicada'
                   check (estado in ('aplicada','cancelada')),
  -- Totales congelados: lo que BMS reportó haber aplicado, no lo que pedimos.
  -- modifica_inventario recorta en silencio si no alcanza la existencia, así
  -- que estos números salen del parámetro de salida del SP, no de la app.
  partidas       int  not null default 0,
  unidades       numeric not null default 0,
  costo_total    numeric not null default 0,
  aplicado_por   text not null,
  aplicado_en    timestamptz not null default now(),
  cancelado_por  text,
  cancelado_en   timestamptz,
  motivo_cancelacion text,
  -- Un folio de BMS es único por transacción y establecimiento. Si esto choca
  -- es que algo se registró dos veces: mejor que reviente aquí y no que queden
  -- dos filas apuntando al mismo movimiento del ERP.
  unique (folio_bms, transaccion, cod_estab)
);

create index if not exists idx_inv_aplic_sucursal
  on public.rnd_inventario_aplicaciones (sucursal, estado, aplicado_en desc);

-- ── Detalle: qué línea de uso interno se fue en qué folio ────────────────────
create table if not exists public.rnd_inventario_aplicaciones_lineas (
  id             uuid primary key default gen_random_uuid(),
  aplicacion_id  uuid not null references public.rnd_inventario_aplicaciones(id) on delete cascade,
  linea_id       uuid not null references public.rnd_material_lineas(id),
  cod_prod       text not null,
  -- Lo que se PIDIÓ bajar vs lo que BMS REALMENTE bajó. Se guardan las dos
  -- porque pueden diferir: si la existencia no alcanza, el ERP recorta y no
  -- avisa. Si difieren, hay que revisarlo a mano.
  cantidad_solicitada numeric not null check (cantidad_solicitada > 0),
  cantidad_aplicada   numeric not null check (cantidad_aplicada >= 0),
  costo_unitario numeric,
  -- Una línea de uso interno solo se puede descargar UNA vez. Este índice es la
  -- garantía real de que no se duplique el movimiento en BMS; la pantalla ya
  -- filtra, pero la pantalla se puede abrir dos veces en dos navegadores.
  unique (linea_id)
);

create index if not exists idx_inv_aplic_lineas_aplicacion
  on public.rnd_inventario_aplicaciones_lineas (aplicacion_id);

comment on table public.rnd_inventario_aplicaciones is
  'Folios de BMS (trans 40, razón 17 Uso Interno) generados desde el módulo INVENTARIOS';

-- ── RLS: lectura abierta a anon (como el resto del proyecto), cero escritura ──
-- Escribir solo por RPC con service_role, igual que el módulo de material.
alter table public.rnd_inventario_aplicaciones        enable row level security;
alter table public.rnd_inventario_aplicaciones_lineas enable row level security;

drop policy if exists inv_aplic_lectura on public.rnd_inventario_aplicaciones;
create policy inv_aplic_lectura
  on public.rnd_inventario_aplicaciones
  for select to anon, authenticated
  using (true);

drop policy if exists inv_aplic_lineas_lectura on public.rnd_inventario_aplicaciones_lineas;
create policy inv_aplic_lineas_lectura
  on public.rnd_inventario_aplicaciones_lineas
  for select to anon, authenticated
  using (true);

-- ── Vista: lo entregado que todavía no se baja de BMS ────────────────────────
-- Es la fuente de la pantalla de INVENTARIOS. Criterio de "entregado
-- correctamente": la línea tiene cantidad_entregada capturada y mayor a cero.
--   - null  = el área todavía no entrega (ver migración 0032)
--   - 0     = se surtió nada; no hay qué descargar del ERP
-- Se excluye lo que ya vive en aplicaciones_lineas de un folio no cancelado:
-- si el folio se canceló, el material volvió al inventario y vuelve a estar
-- pendiente de descargar, que es justo lo que quiere ver INVENTARIOS.
-- security_invoker: sin esto la vista correría con los permisos de su dueño y
-- se saltaría el RLS de las tablas base. Hoy daría igual (la lectura está
-- abierta a anon), pero si mañana se cierra el RLS de material, esta vista no
-- debe seguir siendo una puerta trasera.
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
  l.costo_unitario
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
  'Partidas ya entregadas al empleado que aún no se descargan de BMS. Alimenta la pantalla del rol INVENTARIOS.';
