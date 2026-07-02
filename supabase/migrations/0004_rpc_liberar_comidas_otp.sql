-- Consume un OTP y libera el pago de las comidas del chofer, ATÓMICAMENTE.
-- Devuelve: 'ok' | 'no_encontrado' | 'expirado' | 'ya_usado' | 'sin_intentos' | 'codigo_incorrecto'.
create or replace function public.liberar_comidas_otp(
  p_empleado_id integer,
  p_semana date,
  p_hash_intento text,
  p_cajera_email text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_otp public.rnd_comida_otp%rowtype;
begin
  select * into v_otp
  from public.rnd_comida_otp
  where empleado_id = p_empleado_id and semana = p_semana
  for update;

  if not found then
    return 'no_encontrado';
  end if;

  if v_otp.estado = 'usado' then
    return 'ya_usado';
  end if;

  if now() > v_otp.expira_en then
    update public.rnd_comida_otp set estado = 'expirado' where id = v_otp.id;
    return 'expirado';
  end if;

  if v_otp.intentos >= 5 then
    return 'sin_intentos';
  end if;

  if v_otp.otp_hash <> p_hash_intento then
    update public.rnd_comida_otp set intentos = intentos + 1 where id = v_otp.id;
    return 'codigo_incorrecto';
  end if;

  update public.rnd_comida_otp
    set estado = 'usado', usado_en = now(), usado_por = p_cajera_email
    where id = v_otp.id;

  update public.rnd_reembolsos
    set estado = 'pendiente', quien_entrega = p_cajera_email
    where id = any(v_otp.reembolso_ids) and estado = 'comida_pendiente';

  insert into public.rnd_actividades (tipo, descripcion, usuario, datos_adicionales)
  values (
    'LIBERACION_OTP_COMIDA',
    'Comidas liberadas vía OTP para empleado ' || p_empleado_id,
    p_cajera_email,
    jsonb_build_object(
      'empleado_id', p_empleado_id,
      'semana', p_semana,
      'reembolso_ids', to_jsonb(v_otp.reembolso_ids),
      'otp_id', v_otp.id
    )
  );

  return 'ok';
end;
$$;
