-- La comida cobrada nunca llegaba a la Revisión de la caja que la pagó.
--
-- Síntoma: la cajera cobra una comida con el código, entrega el efectivo, y la
-- solicitud NO aparece en su pantalla de Revisión. Nunca se manda a corte:
-- dinero entregado que el sistema no le repone.
--
-- Causa: Revisión filtraba los pendientes por `usuario_registro`. Eso funcionaba
-- cuando la cajera capturaba sus propias solicitudes, pero una COMIDA la registra
-- el GERENTE (usuario_registro = su email) y solo la COBRA la cajera. Como el
-- canje (liberar_comidas_otp) no dejaba rastro de qué caja pagó, ninguna cajera
-- matcheaba y la fila quedaba huérfana.
--
-- Arreglo: la caja dueña se identifica por `quien_entrega`, que es justo lo que
-- esa columna significa —quién entregó el efectivo— y ya es lo que Revisión
-- necesita. Para los reembolsos normales ya se llena con el nombre de la cajera
-- (FormNuevoReembolso manda sesion.nombre), así que basta con que el canje haga
-- lo mismo para las comidas y con que Revisión filtre por ese campo.
--
-- Verificado contra los datos antes de migrar: los 18 pendientes normales tienen
-- quien_entrega == nombre del usuario en usuario_registro, así que mover el filtro
-- a quien_entrega no le esconde nada a nadie. Los únicos que divergían eran las
-- comidas rotas, que este mismo archivo corrige.
--
-- Segundo defecto, misma línea: el canje guardaba el EMAIL de la cajera en
-- `quien_entrega`, mientras el histórico y los reembolsos normales guardan el
-- NOMBRE ('JASIVE TRASVIÑA', 'Jorge Felix'). Dos vocabularios en una columna que
-- se exporta a Excel y lee gente. Se unifica a nombre; el email sigue en la
-- bitácora de actividades y en rnd_comida_otp.usado_por, que es su lugar.

-- 1) email -> nombre del usuario. Si el email no está en el catálogo devuelve el
--    email tal cual: preferimos un dato feo pero trazable a un null que borre
--    quién entregó el dinero.
create or replace function public.nombre_usuario_por_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(u.nombre), '')
       from public.rnd_usuarios u
      where lower(btrim(u.email)) = lower(btrim(p_email))
      limit 1),
    p_email
  )
$$;

revoke all on function public.nombre_usuario_por_email(text) from public, anon, authenticated;

-- 2) CANJE EN CAJA. Idéntica a 0014 salvo el UPDATE, que ahora sella en
--    quien_entrega el NOMBRE de la cajera (antes: su email). Ese sello es lo que
--    hace que la comida aparezca en la Revisión de quien puso el efectivo.
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
  v_nombre_cajera text;
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

  v_nombre_cajera := public.nombre_usuario_por_email(p_cajera_email);

  -- Código correcto: cobra TODAS las comidas pendientes del empleado AHORA, más
  -- (red de seguridad) las congeladas del OTP que sigan pendientes. Solo transiciona
  -- 'comida_pendiente' -> 'pendiente', así que nunca paga dos veces.
  with upd as (
    update public.rnd_reembolsos
       set estado = 'pendiente',
           -- Nombre, no email: es la llave con la que Revisión encuentra a su caja
           -- (y lo que se lee en pantalla y en el Excel).
           quien_entrega = v_nombre_cajera
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

-- 3) BACKFILL de las comidas ya cobradas que quedaron huérfanas: cambia el email
--    por el nombre de esa misma cajera, con lo que entran a su Revisión.
--    Un email en `quien_entrega` de una COMIDA solo pudo escribirlo el canje
--    (crear-comida la inserta con quien_entrega = ''), así que el predicado
--    identifica exactamente las filas afectadas. Idempotente: tras correr, ya no
--    hay emails que casen con el LIKE, así que una segunda pasada no toca nada.
update public.rnd_reembolsos
   set quien_entrega = public.nombre_usuario_por_email(quien_entrega)
 where concepto = 'COMIDAS'
   and estado <> 'comida_pendiente'
   and quien_entrega like '%@%';
