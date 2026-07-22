-- El rol `almacen` existe en el código (packages/domain/src/roles.ts) desde el
-- módulo de material, pero `rnd_usuarios` tenía un CHECK que solo aceptaba los
-- seis roles viejos. Al dar de alta al primer encargado de almacén, la base lo
-- rechazó con rnd_usuarios_rol_check.
--
-- Se detectó hasta este momento porque las pantallas se probaron firmando
-- cookies de sesión a mano (la cookie del escritorio es JSON sin firmar), y por
-- ese camino nunca se toca esta validación.
--
-- El cambio es aditivo: ensanchar un CHECK no puede invalidar filas existentes.
-- Se conservan los seis roles previos tal cual, incluidos 'supervisor' y
-- 'administracion', que hoy no tienen usuarios pero siguen siendo válidos.

alter table public.rnd_usuarios
  drop constraint if exists rnd_usuarios_rol_check;

alter table public.rnd_usuarios
  add constraint rnd_usuarios_rol_check
  check (rol in (
    'admin',
    'caja_chica',
    'supervisor',
    'administracion',
    'gerente',
    'autorizador',
    'almacen'
  ));
