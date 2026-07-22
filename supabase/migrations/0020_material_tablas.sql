-- Módulo de solicitud de material: empleado pide, gerente autoriza, almacén entrega.
-- Encabezado + líneas. Todo lo que viene del ERP se guarda CONGELADO (copia del
-- momento en que se pidió), para que el histórico no se mueva si cambian precios
-- y para que gerente y almacén no dependan de que SQL Server esté vivo.

-- Folio legible para que almacén pueda cantarlo: SM-000001, SM-000002...
create sequence if not exists public.rnd_material_folio_seq;

create table if not exists public.rnd_material_solicitudes (
  id                 uuid primary key default gen_random_uuid(),
  folio              text not null unique
                       default ('SM-' || lpad(nextval('public.rnd_material_folio_seq')::text, 6, '0')),
  empleado_id        int  not null,
  empleado_nombre    text not null,          -- copia: el padrón puede cambiar
  sucursal           text not null,          -- ABREVIATURA (LMM, FTE...), igual que rnd_usuarios.sucursal
  cod_estab          int,                    -- número del ERP; nulo si la sucursal no lo tenía mapeado
  nota               text,
  estado             text not null default 'pendiente'
                       check (estado in ('pendiente','autorizada','rechazada','entregada','cancelada')),
  creado_en          timestamptz not null default now(),
  autorizado_por     text,
  fecha_autorizacion timestamptz,
  motivo_rechazo     text,
  entregado_por      text,
  fecha_entrega      timestamptz
);

comment on column public.rnd_material_solicitudes.sucursal is
  'Abreviatura (vocabulario de rnd_usuarios.sucursal), para que gerente y almacén filtren por comparación directa';

-- Lo que consultan las pantallas: pendientes/autorizadas de una sucursal, y el historial de un empleado.
create index if not exists idx_material_sol_sucursal_estado
  on public.rnd_material_solicitudes (sucursal, estado, creado_en desc);
create index if not exists idx_material_sol_empleado
  on public.rnd_material_solicitudes (empleado_id, creado_en desc);

create table if not exists public.rnd_material_lineas (
  id                  uuid primary key default gen_random_uuid(),
  solicitud_id        uuid not null references public.rnd_material_solicitudes(id) on delete cascade,
  orden               int  not null default 0,
  cod_prod            text not null,         -- copia congelada del ERP
  descripcion         text not null,         -- copia congelada del ERP
  unidad              text,                  -- copia congelada del ERP
  cantidad            numeric not null check (cantidad > 0),
  costo_unitario      numeric,               -- costo_promedio del ERP al pedir
  existencia_al_pedir numeric,               -- exist_unidades del ERP al pedir (informativo)
  cantidad_entregada  numeric check (cantidad_entregada is null or cantidad_entregada >= 0)
);

create index if not exists idx_material_lineas_solicitud
  on public.rnd_material_lineas (solicitud_id, orden);

-- RLS: lectura abierta a la anon key (el escritorio lee así todo el proyecto),
-- y CERO políticas de escritura. Escribir solo se puede por las RPCs del
-- archivo 0021, que corren como service_role.
alter table public.rnd_material_solicitudes enable row level security;
alter table public.rnd_material_lineas      enable row level security;

drop policy if exists material_sol_lectura on public.rnd_material_solicitudes;
create policy material_sol_lectura
  on public.rnd_material_solicitudes
  for select to anon, authenticated
  using (true);

drop policy if exists material_lineas_lectura on public.rnd_material_lineas;
create policy material_lineas_lectura
  on public.rnd_material_lineas
  for select to anon, authenticated
  using (true);
