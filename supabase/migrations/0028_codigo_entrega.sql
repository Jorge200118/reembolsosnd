-- El empleado prueba que recibió dictando un código de 6 dígitos que solo él
-- tiene. Se genera al autorizar: una solicitud autorizada siempre trae código,
-- una pendiente nunca.
--
-- Mismo patrón que el código de comidas (en producción desde julio de 2026):
-- se guarda el HASH para verificar y una copia CIFRADA con la llave del Vault
-- para poder volver a mostrárselo al empleado si cierra la app. Sin la copia
-- cifrada el código sería irrecuperable y una app cerrada dejaría al empleado
-- sin poder recoger su material.

alter table public.rnd_material_solicitudes
  add column if not exists codigo_hash             text,
  add column if not exists codigo_cifrado          text,
  add column if not exists codigo_intentos         int not null default 0,
  add column if not exists codigo_bloqueado_hasta  timestamptz,
  add column if not exists codigo_usado_en         timestamptz,
  add column if not exists evidencia_path          text;

-- OJO con el search_path: crypt, gen_salt, pgp_sym_encrypt, armor y
-- gen_random_bytes viven en el esquema `extensions`, no en `public`. Con
-- `set search_path = public` a secas, esta función revienta.
drop function if exists public.material_autorizar(uuid, text, text);

create function public.material_autorizar(p_id uuid, p_usuario text, p_sucursal text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_estado text; v_folio text; v_suc text;
  v_bytes bytea; v_codigo text; v_key text;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién autoriza');
  end if;
  if coalesce(trim(p_sucursal), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la sucursal de quien autoriza');
  end if;

  select estado, folio, sucursal into v_estado, v_folio, v_suc
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if trim(p_sucursal) <> '*'
     and upper(btrim(coalesce(v_suc, ''))) <> upper(btrim(p_sucursal)) then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud es de otra sucursal');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'La solicitud ya está ' || v_estado);
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'Falta la llave de cifrado, avisa a sistemas');
  end if;

  -- gen_random_bytes y no random(): random() es predecible, y un código
  -- adivinable dejaría al almacenista cerrar entregas sin el empleado enfrente,
  -- que es justo lo que este código existe para impedir. El sesgo del módulo
  -- sobre 3 bytes (16.7M -> 1M) es despreciable aquí.
  v_bytes := gen_random_bytes(3);
  v_codigo := lpad(
    ((( get_byte(v_bytes,0)::int << 16)
      | (get_byte(v_bytes,1)::int << 8)
      |  get_byte(v_bytes,2)::int) % 1000000)::text, 6, '0');

  update public.rnd_material_solicitudes
     set estado                 = 'autorizada',
         autorizado_por         = trim(p_usuario),
         fecha_autorizacion     = now(),
         codigo_hash            = crypt(v_codigo, gen_salt('bf')),
         codigo_cifrado         = armor(pgp_sym_encrypt(v_codigo, v_key)),
         codigo_intentos        = 0,
         codigo_bloqueado_hasta = null,
         codigo_usado_en        = null
   where id = p_id;

  -- El código NO se devuelve: quien autoriza es el gerente, y el código es del
  -- empleado. Se revela solo por material_codigo, contra su propia sesión.
  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', v_folio);
end;
$$;

revoke execute on function public.material_autorizar(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.material_autorizar(uuid, text, text) to service_role;

-- Revelar el código a su dueño. Todos los rechazos contestan lo mismo: si el
-- mensaje cambiara según el motivo, serviría para averiguar qué solicitudes
-- existen y de quién son.
create or replace function public.material_codigo(p_id uuid, p_empleado_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_estado text; v_dueno int; v_cif text; v_key text;
begin
  select estado, empleado_id, codigo_cifrado
    into v_estado, v_dueno, v_cif
    from public.rnd_material_solicitudes
   where id = p_id;

  if v_estado is null
     or v_dueno is distinct from p_empleado_id
     or v_estado <> 'autorizada'
     or v_cif is null then
    return jsonb_build_object('ok', false, 'error', 'No disponible');
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'otp_cripto_key';
  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'No disponible');
  end if;

  return jsonb_build_object('ok', true, 'codigo', pgp_sym_decrypt(dearmor(v_cif), v_key));
end;
$$;

revoke execute on function public.material_codigo(uuid, int) from public, anon, authenticated;
grant  execute on function public.material_codigo(uuid, int) to service_role;
