-- Notificaciones push (Web Push / VAPID) para la app de empleados.
-- Tabla de suscripciones (una fila por navegador/endpoint) + RPCs SECURITY DEFINER.
-- RLS CERRADA (sin políticas): solo service_role / RPCs entran, igual que
-- rnd_comida_otp y rnd_empleado_auth.

create table if not exists public.rnd_push_suscripciones (
  endpoint    text         not null,
  empleado_id integer      not null,
  p256dh      text         not null,
  auth        text         not null,
  user_agent  text,
  creado_en   timestamptz  not null default now(),
  constraint rnd_push_suscripciones_pkey primary key (endpoint)
);

create index if not exists rnd_push_suscripciones_empleado_idx
  on public.rnd_push_suscripciones (empleado_id);

alter table public.rnd_push_suscripciones enable row level security;

-- SUSCRIBIR: upsert por endpoint (el mismo navegador puede recambiar de dueño).
create or replace function public.push_suscribir(
  p_empleado_id integer, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.rnd_push_suscripciones (endpoint, empleado_id, p256dh, auth, user_agent)
  values (p_endpoint, p_empleado_id, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set empleado_id = excluded.empleado_id,
        p256dh      = excluded.p256dh,
        auth        = excluded.auth,
        user_agent  = excluded.user_agent,
        creado_en   = now();
end $$;

revoke all on function public.push_suscribir(integer, text, text, text, text)
  from public, anon, authenticated;

-- DESUSCRIBIR: borra por (empleado_id, endpoint) — un chofer no borra ajenas.
create or replace function public.push_desuscribir(
  p_empleado_id integer, p_endpoint text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.rnd_push_suscripciones
   where endpoint = p_endpoint and empleado_id = p_empleado_id;
end $$;

revoke all on function public.push_desuscribir(integer, text)
  from public, anon, authenticated;

-- LIMPIEZA de muertas (404/410), llamada por enviar-push con service_role.
create or replace function public.push_borrar_endpoint(
  p_endpoint text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.rnd_push_suscripciones where endpoint = p_endpoint;
end $$;

revoke all on function public.push_borrar_endpoint(text)
  from public, anon, authenticated;

-- DESTINATARIOS por tipo. Devuelve jsonb (array) para que la Edge lo consuma.
-- comida_nueva: suscripciones del empleado + monto total acumulado.
-- codigo_listo / recordatorio: choferes con OTP de HOY aún 'generado' y con
-- suscripción; recordatorio además exige vigencia (expira_en > now()).
create or replace function public.destinatarios_push(
  p_tipo text, p_empleado_id integer
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hoy date := (now() at time zone 'America/Mazatlan')::date;
  v_res jsonb;
begin
  if p_tipo = 'comida_nueva' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth, 'monto', t.total)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
      cross join lateral (
        select coalesce(sum(r.monto), 0) as total
          from public.rnd_reembolsos r
         where r.empleado_id = p_empleado_id
           and r.concepto = 'COMIDAS' and r.estado = 'comida_pendiente'
      ) t
     where s.empleado_id = p_empleado_id;

  elsif p_tipo = 'codigo_listo' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
      join public.rnd_comida_otp o
        on o.empleado_id = s.empleado_id and o.semana = v_hoy and o.estado = 'generado';

  elsif p_tipo = 'recordatorio' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
      join public.rnd_comida_otp o
        on o.empleado_id = s.empleado_id and o.semana = v_hoy
       and o.estado = 'generado' and o.expira_en > now();

  else
    v_res := '[]'::jsonb;
  end if;

  return v_res;
end $$;

revoke all on function public.destinatarios_push(text, integer)
  from public, anon, authenticated;

-- Lee el par VAPID (JWK) del Vault. Solo service_role.
create or replace function public.leer_vapid_keys()
returns text
language sql security definer set search_path = public, extensions as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_keys' limit 1;
$$;

revoke all on function public.leer_vapid_keys() from public, anon, authenticated;
grant execute on function public.leer_vapid_keys() to service_role;
