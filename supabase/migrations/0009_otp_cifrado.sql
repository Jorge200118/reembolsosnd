create extension if not exists pgcrypto with schema extensions;

alter table public.rnd_comida_otp
  add column if not exists otp_cifrado text;  -- armor(pgp_sym_encrypt(codigo, key))

-- Registra/actualiza el OTP de un empleado para una semana, guardando el hash
-- (para validar, como hoy) y el codigo CIFRADO (para mostrarlo en la app). El
-- codigo en claro NUNCA se persiste. SECURITY DEFINER: la llave del Vault no se
-- expone al llamador.
create or replace function public.registrar_otp_comida(
  p_empleado_id integer,
  p_semana date,
  p_codigo text,
  p_otp_hash text,
  p_otp_salt text,
  p_expira_en timestamptz,
  p_reembolso_ids uuid[],
  p_telefono text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  insert into public.rnd_comida_otp
    (empleado_id, semana, otp_hash, otp_salt, otp_cifrado, estado, intentos, expira_en, reembolso_ids, telefono)
  values
    (p_empleado_id, p_semana, p_otp_hash, p_otp_salt,
     armor(pgp_sym_encrypt(p_codigo, v_key)), 'generado', 0, p_expira_en, p_reembolso_ids, p_telefono)
  on conflict (empleado_id, semana) do update
    set otp_hash = excluded.otp_hash,
        otp_salt = excluded.otp_salt,
        otp_cifrado = excluded.otp_cifrado,
        estado = 'generado',
        intentos = 0,
        expira_en = excluded.expira_en,
        reembolso_ids = excluded.reembolso_ids,
        telefono = excluded.telefono;
end $$;

-- Devuelve el codigo en claro de un OTP vigente. Se llama desde la edge function
-- de la app (service_role) DESPUES de autenticar al empleado dueno.
create or replace function public.revelar_codigo_comida(
  p_empleado_id integer,
  p_semana date
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_cifrado text;
  v_estado text;
begin
  select otp_cifrado, estado into v_cifrado, v_estado
  from public.rnd_comida_otp
  where empleado_id = p_empleado_id and semana = p_semana;
  if v_cifrado is null then return null; end if;
  if v_estado <> 'generado' then return null; end if;  -- usado/expirado no se muestra
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  return pgp_sym_decrypt(dearmor(v_cifrado), v_key);
end $$;

revoke all on function public.registrar_otp_comida(integer,date,text,text,text,timestamptz,uuid[],text) from public, anon, authenticated;
revoke all on function public.revelar_codigo_comida(integer,date) from public, anon, authenticated;
