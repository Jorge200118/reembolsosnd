-- Área del encargado de almacén. Null = entrega todo (sucursales sin áreas).
--
-- Es una credencial, no un dato de formulario: viaja en la cookie firmada y es
-- lo que decide qué partidas puede marcar entregadas. Por eso vive aquí y no
-- en el body de la petición.

alter table public.rnd_usuarios
  add column if not exists area text;

alter table public.rnd_usuarios
  drop constraint if exists rnd_usuarios_area_check;

alter table public.rnd_usuarios
  add constraint rnd_usuarios_area_check
  check (area is null or area in ('FERRETERIA','NAVE1','NAVE2','NAVE3'));

comment on column public.rnd_usuarios.area is
  'Área del encargado de almacén en Los Mochis. Null = entrega todas las '
  'partidas, que es como funcionan las demás sucursales.';
