-- Opción A: el código del día cobra TODO lo pendiente al momento de canjear,
-- no la foto congelada (reembolso_ids) que tenía cuando se generó. Con esto:
--   * El código nunca se queda corto: si al chofer le autorizan otra comida
--     después de generado, el MISMO código ya la cobra. Se elimina la necesidad
--     de "Actualizar para incluir todo".
--   * El código de WhatsApp y el de la app son el mismo y siempre válido: la app
--     ya no regenera/pisa el hash (revela el existente, solo genera si no hay).
--
-- Endurecido tras revisión adversarial:
--   * liberar_comidas_otp DEVUELVE cuánto pagó (comidas + total) para que la caja
--     entregue exactamente lo liquidado (evita descuadre efectivo<->sistema).
--   * Canje de 0 comidas NO quema el código (return 'sin_comidas').
--   * Red de seguridad: paga también las comidas congeladas del OTP que sigan
--     pendientes (cubre filas legadas sin empleado_id).
--   * REVOKE explícito (era la única RPC sensible sin cerrojo).
--   * Recuperación same-day: el panel regenera un OTP bloqueado por 5 intentos.

-- 1) CANJE EN CAJA. Devuelve jsonb: {resultado, comidas, total}.
--    resultado ∈ no_encontrado|ya_usado|expirado|sin_intentos|codigo_incorrecto|
--               sin_comidas|ok. Sigue siendo de un solo uso, atómico, con el mismo
--    esquema de hash/intentos/expiración.
-- El tipo de retorno cambia (text -> jsonb), así que hay que DROP antes del create.
drop function if exists public.liberar_comidas_otp(integer,date,text,text);
create or replace function public.liberar_comidas_otp(
  p_empleado_id integer,
  p_semana date,
  p_hash_intento text,
  p_cajera_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otp public.rnd_comida_otp%rowtype;
  v_pagadas uuid[];
  v_total numeric;
  v_n integer;
begin
  select * into v_otp
  from public.rnd_comida_otp
  where empleado_id = p_empleado_id and semana = p_semana
  for update;

  if not found then return jsonb_build_object('resultado','no_encontrado'); end if;
  if v_otp.estado = 'usado' then return jsonb_build_object('resultado','ya_usado'); end if;
  if now() > v_otp.expira_en then
    update public.rnd_comida_otp set estado = 'expirado' where id = v_otp.id;
    return jsonb_build_object('resultado','expirado');
  end if;
  if v_otp.intentos >= 5 then return jsonb_build_object('resultado','sin_intentos'); end if;
  if v_otp.otp_hash <> p_hash_intento then
    update public.rnd_comida_otp set intentos = intentos + 1 where id = v_otp.id;
    return jsonb_build_object('resultado','codigo_incorrecto');
  end if;

  -- Código correcto: cobra TODAS las comidas pendientes del empleado AHORA, más
  -- (red de seguridad) las congeladas del OTP que sigan pendientes. Solo transiciona
  -- 'comida_pendiente' -> 'pendiente', así que nunca paga dos veces.
  with upd as (
    update public.rnd_reembolsos
       set estado = 'pendiente', quien_entrega = p_cajera_email
     where concepto = 'COMIDAS'
       and estado = 'comida_pendiente'
       and (empleado_id = p_empleado_id or id = any(v_otp.reembolso_ids))
    returning id, monto
  )
  select coalesce(array_agg(id), '{}'::uuid[]), coalesce(sum(monto), 0), count(*)
    into v_pagadas, v_total, v_n
  from upd;

  -- Sin nada por pagar: NO quemar el código (queda 'generado' para un cobro
  -- legítimo posterior) y avisar distinto para que la caja no entregue efectivo.
  if v_n = 0 then
    return jsonb_build_object('resultado','sin_comidas','comidas',0,'total',0);
  end if;

  update public.rnd_comida_otp
    set estado = 'usado', usado_en = now(), usado_por = p_cajera_email
    where id = v_otp.id;

  insert into public.rnd_actividades (tipo, descripcion, usuario, datos_adicionales)
  values (
    'LIBERACION_OTP_COMIDA',
    'Comidas liberadas vía OTP para empleado ' || p_empleado_id,
    p_cajera_email,
    jsonb_build_object(
      'empleado_id', p_empleado_id,
      'semana', p_semana,
      'reembolso_ids', to_jsonb(v_pagadas),   -- las realmente pagadas ahora
      'total', v_total,
      'otp_id', v_otp.id
    )
  );

  return jsonb_build_object('resultado','ok','comidas',v_n,'total',v_total);
end;
$$;

revoke all on function public.liberar_comidas_otp(integer,date,text,text) from public, anon, authenticated;
grant execute on function public.liberar_comidas_otp(integer,date,text,text) to service_role;

-- 2) PANEL DEL EMPLEADO: revela el código vigente del día; genera uno nuevo si no
--    hay, si el anterior ya se usó/expiró, O si quedó bloqueado por 5 intentos
--    fallidos (recuperación el mismo día). Ya NO regenera por comidas nuevas (el
--    canje cobra todo) ni pisa el código de WhatsApp. hay_nuevas queda en false.
create or replace function public.empleado_panel(
  p_empleado_id integer,
  p_regenerar boolean default false   -- se ignora: la app ya no regenera a voluntad
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_semana date := (now() at time zone 'America/Mazatlan')::date;
  v_expira timestamptz := ((v_semana::text || ' 23:59:59')::timestamp) at time zone 'America/Mazatlan';
  v_comidas jsonb; v_total numeric; v_ids uuid[];
  v_codigo text; v_ex record; v_salt text; v_hash text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'fecha',fecha,'monto',monto) order by fecha),'[]'::jsonb),
         coalesce(sum(monto),0), coalesce(array_agg(id), array[]::uuid[])
    into v_comidas, v_total, v_ids
  from rnd_reembolsos
  where empleado_id=p_empleado_id and concepto='COMIDAS' and estado='comida_pendiente';

  if array_length(v_ids,1) is null then
    return jsonb_build_object('comidas','[]'::jsonb,'total',0,'codigo',null,'expira_en',null,'hay_nuevas',false);
  end if;

  select * into v_ex from rnd_comida_otp where empleado_id=p_empleado_id and semana=v_semana;

  if v_ex.id is null or v_ex.estado <> 'generado' or v_ex.intentos >= 5 then
    v_codigo := lpad((abs(('x'||encode(gen_random_bytes(4),'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    v_salt := gen_random_uuid()::text;
    v_hash := encode(digest(v_salt || v_codigo, 'sha256'), 'hex');
    perform public.registrar_otp_comida(p_empleado_id, v_semana, v_codigo, v_hash, v_salt, v_expira, v_ids, null);
  else
    v_codigo := public.revelar_codigo_comida(p_empleado_id, v_semana);
  end if;

  return jsonb_build_object('comidas',v_comidas,'total',v_total,'codigo',v_codigo,
    'expira_en',v_expira,'hay_nuevas',false);
end $$;

revoke all on function public.empleado_panel(integer,boolean) from public, anon, authenticated;
