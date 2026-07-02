-- Tabla que guarda SOLO el hash del OTP de comidas (nunca el dígito en claro).
-- Un OTP por (empleado_id, semana). empleado_id es integer (FK lógica a empleados.id).
create table if not exists public.rnd_comida_otp (
  id            uuid primary key default gen_random_uuid(),
  empleado_id   integer not null,
  semana        date    not null,            -- el viernes de la semana
  otp_hash      text    not null,
  otp_salt      text    not null,
  estado        text    not null default 'generado',  -- 'generado' | 'usado' | 'expirado'
  intentos      integer not null default 0,
  generado_en   timestamptz not null default now(),
  expira_en     timestamptz not null,
  usado_en      timestamptz,
  usado_por     text,                        -- email de la cajera
  reembolso_ids uuid[]  not null default '{}',-- las comidas que este OTP libera
  telefono      text,                        -- a qué número se mandó
  constraint uq_comida_otp_empleado_semana unique (empleado_id, semana)
);

create index if not exists idx_comida_otp_empleado on public.rnd_comida_otp (empleado_id);
create index if not exists idx_comida_otp_semana on public.rnd_comida_otp (semana);

-- RLS restrictiva: tabla de secretos NO accesible por anon. Solo service_role (Edge Functions).
alter table public.rnd_comida_otp enable row level security;
