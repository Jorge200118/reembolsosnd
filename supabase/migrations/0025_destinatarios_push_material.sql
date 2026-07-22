-- El módulo de material manda tres avisos nuevos (autorizada / rechazada /
-- entregada), pero `destinatarios_push` solo conocía los tres de comidas y
-- cualquier otro tipo caía al `else` devolviendo lista vacía. Resultado: la
-- edge `enviar-push` respondía ok con total=0 y el empleado nunca se enteraba.
--
-- No se detectó antes porque `avisarEmpleado` (src/lib/materiales/avisar.ts) es
-- best-effort a propósito —un push que no sale no debe tumbar la autorización—,
-- así que el silencio era indistinguible del éxito.
--
-- Destinatario de los tres: el dueño de la solicitud, y nadie más. Va por
-- p_empleado_id, igual que 'comida_nueva'. Si llega null no hay filas (la
-- comparación con null no casa), que es justo lo que queremos.

create or replace function public.destinatarios_push(p_tipo text, p_empleado_id int)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
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

  elsif p_tipo in ('material_autorizada', 'material_rechazada', 'material_entregada') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'empleado_id', s.empleado_id, 'endpoint', s.endpoint,
             'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_res
      from public.rnd_push_suscripciones s
     where s.empleado_id = p_empleado_id;

  else
    v_res := '[]'::jsonb;
  end if;

  return v_res;
end
$$;
