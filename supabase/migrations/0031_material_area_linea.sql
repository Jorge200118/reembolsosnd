-- Área que entrega cada partida. Se congela al crear la solicitud, igual que
-- la descripción y el costo: si mañana inventarios mueve el producto de zona,
-- una solicitud ya autorizada no puede cambiar de encargado a media entrega.
--
-- Nullable a propósito:
--   * Las líneas creadas antes de este cambio se quedan en null y las entrega
--     cualquiera, que es el comportamiento que ya tenían.
--   * Las sucursales sin áreas (todas menos Los Mochis) siguen guardando null.
-- Sin default: un default obligaría a elegir un área para quien no tiene.

alter table public.rnd_material_lineas
  add column if not exists area text;

alter table public.rnd_material_lineas
  drop constraint if exists rnd_material_lineas_area_check;

alter table public.rnd_material_lineas
  add constraint rnd_material_lineas_area_check
  check (area is null or area in ('FERRETERIA', 'NAVE1', 'NAVE2', 'NAVE3'));

-- La pantalla de almacén filtra por área dentro de una solicitud.
create index if not exists idx_material_lineas_area
  on public.rnd_material_lineas (solicitud_id, area);

comment on column public.rnd_material_lineas.area is
  'Área que entrega esta partida (FERRETERIA|NAVE1|NAVE2|NAVE3), derivada de la '
  'zona de inventario físico del ERP al momento de pedir. Null = sucursal sin '
  'áreas o línea anterior al cambio; la entrega cualquier encargado.';
