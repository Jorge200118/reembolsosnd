-- Índices para filtrado/paginación server-side de rnd_reembolsos.
-- Elimina el anti-patrón "cargar 9,409 filas y filtrar en JS".
create index if not exists idx_rnd_reembolsos_estado on public.rnd_reembolsos (estado);
create index if not exists idx_rnd_reembolsos_sucursal on public.rnd_reembolsos (sucursal_usuario);
create index if not exists idx_rnd_reembolsos_lote on public.rnd_reembolsos (numero_lote);
create index if not exists idx_rnd_reembolsos_fecha on public.rnd_reembolsos (fecha);
create index if not exists idx_rnd_reembolsos_usuario on public.rnd_reembolsos (usuario_registro);
create index if not exists idx_rnd_reembolsos_estado_created on public.rnd_reembolsos (estado, created_at desc);
