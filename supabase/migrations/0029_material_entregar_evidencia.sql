drop function if exists public.material_entregar(uuid, text, jsonb, text);

create function public.material_entregar(
  p_id uuid, p_usuario text, p_entregas jsonb, p_sucursal text,
  p_codigo text, p_evidencia_path text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_estado text; v_folio text; v_suc text; v_n int; v_recibidas int;
  v_hash text; v_intentos int; v_bloq timestamptz;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién entrega');
  end if;
  if coalesce(trim(p_sucursal), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la sucursal de quien entrega');
  end if;
  if coalesce(trim(p_evidencia_path), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la foto de la entrega');
  end if;
  if p_entregas is not null and jsonb_typeof(p_entregas) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Las entregas deben venir en una lista');
  end if;

  select estado, folio, sucursal, codigo_hash, codigo_intentos, codigo_bloqueado_hasta
    into v_estado, v_folio, v_suc, v_hash, v_intentos, v_bloq
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
  if v_estado <> 'autorizada' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Solo se entrega lo autorizado; esta solicitud está ' || v_estado);
  end if;

  -- Bloqueo vigente: ni siquiera se gasta intento.
  if v_bloq is not null and v_bloq > now() then
    return jsonb_build_object('ok', false, 'error',
      'Demasiados intentos con el código. Espera unos minutos y vuelve a intentar.');
  end if;
  -- Bloqueo vencido: los intentos vuelven a cero. Sin esto el sexto intento
  -- volvería a bloquear de inmediato y la solicitud quedaría tostada.
  if v_bloq is not null and v_bloq <= now() then
    update public.rnd_material_solicitudes
       set codigo_intentos = 0, codigo_bloqueado_hasta = null
     where id = p_id;
    v_intentos := 0;
  end if;

  if v_hash is null then
    return jsonb_build_object('ok', false, 'error',
      'Esta solicitud no tiene código; pide al gerente que la vuelva a autorizar');
  end if;

  if crypt(coalesce(p_codigo, ''), v_hash) <> v_hash then
    -- El incremento se escribe y DESPUÉS se devuelve el error. Persiste, porque
    -- la función corre en la transacción de quien llama y un `return` normal no
    -- revierte (la misma propiedad que en 0022 era una trampa; aquí se
    -- aprovecha). Si esto se cambiara a `raise`, el contador dejaría de contar.
    update public.rnd_material_solicitudes
       set codigo_intentos = v_intentos + 1,
           codigo_bloqueado_hasta = case when v_intentos + 1 >= 5
                                         then now() + interval '15 minutes' end
     where id = p_id;
    return jsonb_build_object('ok', false,
      'error', case when v_intentos + 1 >= 5
                    then 'Código incorrecto. Se bloqueó 15 minutos.'
                    else 'Código incorrecto. Quedan ' || (5 - (v_intentos + 1))::text || ' intentos.' end);
  end if;

  v_recibidas := jsonb_array_length(coalesce(p_entregas, '[]'::jsonb));
  if v_recibidas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'No se capturó ninguna cantidad; si no se surtió nada, captura ceros');
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
     where coalesce(e->>'linea_id', '') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or case when jsonb_typeof(e->'cantidad_entregada') = 'number'
                then (e->>'cantidad_entregada')::numeric < 0
                else true
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay cantidades entregadas inválidas');
  end if;

  if v_recibidas <> (
    select count(distinct (e->>'linea_id')::uuid)
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales repetidos en la entrega');
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
     where not exists (
       select 1 from public.rnd_material_lineas l
        where l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     )
  ) then
    return jsonb_build_object('ok', false, 'error', 'Alguna línea no pertenece a esta solicitud');
  end if;

  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where (e->>'cantidad_entregada')::numeric > l.cantidad
  ) then
    return jsonb_build_object('ok', false, 'error', 'No puedes entregar más de lo que se pidió');
  end if;

  update public.rnd_material_lineas l
     set cantidad_entregada = (e->>'cantidad_entregada')::numeric
    from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
   where l.solicitud_id = p_id
     and l.id = (e->>'linea_id')::uuid;
  get diagnostics v_n = row_count;

  if v_n <> v_recibidas then
    raise exception 'material_entregar: se recibieron % entregas y se escribieron % líneas', v_recibidas, v_n;
  end if;

  update public.rnd_material_lineas
     set cantidad_entregada = 0
   where solicitud_id = p_id
     and cantidad_entregada is null;

  update public.rnd_material_solicitudes
     set estado          = 'entregada',
         entregado_por   = trim(p_usuario),
         fecha_entrega   = now(),
         codigo_usado_en = now(),
         evidencia_path  = trim(p_evidencia_path)
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'entregada', 'folio', v_folio,
                            'lineas', v_n, 'recibidas', v_recibidas);
end;
$$;

revoke execute on function public.material_entregar(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
grant  execute on function public.material_entregar(uuid, text, jsonb, text, text, text) to service_role;
