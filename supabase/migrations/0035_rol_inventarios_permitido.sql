-- El rol 'inventarios' (módulo de descarga a BMS, migración 0034) existe en el
-- código desde que se agregó a ROLES/ROL_TABS, pero el CHECK de rnd_usuarios
-- seguía con la lista vieja: dar de alta al usuario reventaba con
-- rnd_usuarios_rol_check.
--
-- Se agrega SOLO el valor nuevo. 'supervisor' y 'administracion' se conservan
-- aunque no estén en ROLES: son datos que ya viven en la tabla y normalizarRol
-- los sigue resolviendo (administracion -> admin, supervisor -> caja_chica por
-- mínimo privilegio). Quitarlos aquí rompería filas existentes.

alter table public.rnd_usuarios drop constraint if exists rnd_usuarios_rol_check;

alter table public.rnd_usuarios add constraint rnd_usuarios_rol_check
  check (rol::text = any (array[
    'admin',
    'caja_chica',
    'supervisor',
    'administracion',
    'gerente',
    'autorizador',
    'almacen',
    'inventarios'
  ]::text[]));
