create extension if not exists pgcrypto with schema extensions;

-- Credenciales de empleados (base de la plataforma). NIP con bcrypt (el salt va
-- embebido en el hash). RLS cerrada: solo service_role via RPCs SECURITY DEFINER.
create table if not exists public.rnd_empleado_auth (
  id                uuid primary key default gen_random_uuid(),
  empleado_id       integer not null unique,
  telefono          text not null unique,           -- normalizado (solo digitos)
  nip_hash          text not null,                  -- crypt(nip, gen_salt('bf'))
  estado            text not null default 'activo',
  intentos_fallidos integer not null default 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz not null default now(),
  ultimo_acceso     timestamptz
);
alter table public.rnd_empleado_auth enable row level security;

-- Normaliza telefono a solo digitos.
create or replace function public.norm_tel(p text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p,''), '\D', '', 'g')
$$;

-- REGISTRO: verifica telefono + codigo de empleado contra `empleados`, y fija NIP.
create or replace function public.empleado_registrar(
  p_telefono text, p_codigo_empleado text, p_nip text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_emp record; v_ya boolean;
begin
  if p_nip !~ '^\d{4,6}$' then return jsonb_build_object('resultado','nip_invalido'); end if;
  select id, nombre, apellido into v_emp
  from empleados
  where norm_tel(telefono_whatsapp) = norm_tel(p_telefono)
    and codigo_empleado = p_codigo_empleado and activo = true
  limit 1;
  if not found then return jsonb_build_object('resultado','datos_incorrectos'); end if;
  select exists(select 1 from rnd_empleado_auth where empleado_id = v_emp.id and estado='activo') into v_ya;
  if v_ya then return jsonb_build_object('resultado','ya_registrado'); end if;
  insert into rnd_empleado_auth (empleado_id, telefono, nip_hash, estado)
  values (v_emp.id, norm_tel(p_telefono), crypt(p_nip, gen_salt('bf')), 'activo')
  on conflict (empleado_id) do update
    set telefono = excluded.telefono, nip_hash = excluded.nip_hash,
        estado='activo', intentos_fallidos=0, bloqueado_hasta=null;
  return jsonb_build_object('resultado','ok','empleado_id',v_emp.id,
    'nombre', trim(v_emp.nombre || ' ' || v_emp.apellido));
end $$;

-- LOGIN: verifica NIP con bloqueo por 5 intentos (15 min).
create or replace function public.empleado_login(
  p_telefono text, p_nip text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_a record; v_nombre text;
begin
  select * into v_a from rnd_empleado_auth where telefono = norm_tel(p_telefono) for update;
  if not found then return jsonb_build_object('resultado','no_encontrado'); end if;
  if v_a.bloqueado_hasta is not null and v_a.bloqueado_hasta > now() then
    return jsonb_build_object('resultado','bloqueado','hasta',v_a.bloqueado_hasta);
  end if;
  if crypt(p_nip, v_a.nip_hash) = v_a.nip_hash then
    update rnd_empleado_auth set intentos_fallidos=0, bloqueado_hasta=null, ultimo_acceso=now()
      where id = v_a.id;
    select trim(nombre || ' ' || apellido) into v_nombre from empleados where id = v_a.empleado_id;
    return jsonb_build_object('resultado','ok','empleado_id',v_a.empleado_id,'nombre',coalesce(v_nombre,''));
  else
    update rnd_empleado_auth
      set intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
          bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' else bloqueado_hasta end
      where id = v_a.id;
    return jsonb_build_object('resultado','nip_incorrecto');
  end if;
end $$;

-- RESET NIP: mismo chequeo que registro (telefono + codigo de empleado), fija NIP nuevo.
create or replace function public.empleado_reset_nip(
  p_telefono text, p_codigo_empleado text, p_nip text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_emp record;
begin
  if p_nip !~ '^\d{4,6}$' then return jsonb_build_object('resultado','nip_invalido'); end if;
  select id into v_emp from empleados
  where norm_tel(telefono_whatsapp) = norm_tel(p_telefono)
    and codigo_empleado = p_codigo_empleado and activo = true limit 1;
  if not found then return jsonb_build_object('resultado','datos_incorrectos'); end if;
  update rnd_empleado_auth
    set nip_hash = crypt(p_nip, gen_salt('bf')), intentos_fallidos=0, bloqueado_hasta=null, estado='activo'
    where empleado_id = v_emp.id;
  if not found then return jsonb_build_object('resultado','no_registrado'); end if;
  return jsonb_build_object('resultado','ok');
end $$;

revoke all on function public.empleado_registrar(text,text,text) from public, anon, authenticated;
revoke all on function public.empleado_login(text,text) from public, anon, authenticated;
revoke all on function public.empleado_reset_nip(text,text,text) from public, anon, authenticated;
