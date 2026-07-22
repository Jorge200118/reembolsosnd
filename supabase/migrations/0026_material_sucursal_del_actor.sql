-- Alcance por sucursal, exigido en la base.
--
-- Hasta ahora las tres acciones de escritorio (autorizar / rechazar / entregar)
-- confiaban en que la pantalla solo mostrara solicitudes de la sucursal propia.
-- Eso es filtrar, no impedir: quien llamara la RPC con otro id actuaba sobre
-- cualquier sucursal. No se pudo cerrar antes porque la cookie del escritorio
-- era JSON sin firmar y la sucursal que mandara el cliente era autocertificada.
-- Ahora `rnd_sesion` va firmada con HMAC (src/lib/auth/sesionEscritorio.ts), así
-- que p_sucursal viene de una fuente verificada y sí se puede exigir aquí.
--
-- p_sucursal es OBLIGATORIO y falla cerrado: null o vacío = error, nunca
-- "sin restricción". El comodín para admin es el literal '*', explícito.
--
-- Se hace DROP + CREATE, no CREATE OR REPLACE: agregar un parámetro genera una
-- función nueva y la vieja de 2/3 args seguiría existiendo como sobrecarga, y
-- PostgREST llamaría con gusto la versión sin control de sucursal. Como DROP
-- borra también los permisos, al final de cada bloque se vuelven a poner.

-- ---------------------------------------------------------------- autorizar --
drop function if exists public.material_autorizar(uuid, text);

create function public.material_autorizar(p_id uuid, p_usuario text, p_sucursal text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text; v_suc text;
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

  update public.rnd_material_solicitudes
     set estado = 'autorizada',
         autorizado_por = trim(p_usuario),
         fecha_autorizacion = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', v_folio);
end;
$$;

revoke execute on function public.material_autorizar(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.material_autorizar(uuid, text, text) to service_role;

-- ----------------------------------------------------------------- rechazar --
drop function if exists public.material_rechazar(uuid, text, text);

create function public.material_rechazar(p_id uuid, p_usuario text, p_motivo text, p_sucursal text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text; v_suc text;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién rechaza');
  end if;
  if coalesce(trim(p_sucursal), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la sucursal de quien rechaza');
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

  update public.rnd_material_solicitudes
     set estado = 'rechazada',
         autorizado_por = trim(p_usuario),
         fecha_autorizacion = now(),
         motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'rechazada', 'folio', v_folio);
end;
$$;

revoke execute on function public.material_rechazar(uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.material_rechazar(uuid, text, text, text) to service_role;

-- ----------------------------------------------------------------- entregar --
-- Además de la sucursal, esta cierra un hueco chico: una lista de entregas
-- vacía cerraba la solicitud como entregada con todos los renglones en 0. El
-- dato no quedaba corrupto (el `update ... set cantidad_entregada = 0` de abajo
-- ya cubría los renglones sin capturar), pero por la pantalla es inalcanzable
-- —siempre manda un renglón por línea—, así que una lista vacía solo puede ser
-- un error del cliente. Si de verdad no se surtió nada, se mandan los ceros.
drop function if exists public.material_entregar(uuid, text, jsonb);

create function public.material_entregar(p_id uuid, p_usuario text, p_entregas jsonb, p_sucursal text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text; v_suc text; v_n int; v_recibidas int;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién entrega');
  end if;
  if coalesce(trim(p_sucursal), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta la sucursal de quien entrega');
  end if;
  if p_entregas is not null and jsonb_typeof(p_entregas) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Las entregas deben venir en una lista');
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
  if v_estado <> 'autorizada' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Solo se entrega lo autorizado; esta solicitud está ' || v_estado);
  end if;

  v_recibidas := jsonb_array_length(coalesce(p_entregas, '[]'::jsonb));

  if v_recibidas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'No se capturó ninguna cantidad; si no se surtió nada, captura ceros');
  end if;

  -- Forma: uuid válido y cantidad numérica no negativa. Se valida el formato
  -- del uuid con regex porque castear texto arbitrario levanta 22P02.
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

  -- Sin repetidos. Se compara sobre UUID, no sobre texto: el mismo id en
  -- distinta capitalización es el mismo renglón, y comparando texto se colaba.
  -- Castear aquí es seguro porque la regex de arriba ya validó el formato.
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

  -- Aserción: con las validaciones de arriba esto no puede fallar. Si falla es
  -- un bug nuestro, y entonces queremos abortar, no dejar media entrega escrita.
  -- Va con `raise` y no con `return` justo por eso: un return normal no revierte.
  if v_n <> v_recibidas then
    raise exception 'material_entregar: se recibieron % entregas y se escribieron % líneas', v_recibidas, v_n;
  end if;

  -- Las líneas que no se capturaron se cierran en 0: si no se capturó, no se
  -- entregó. Así ninguna queda en NULL después de cerrar.
  update public.rnd_material_lineas
     set cantidad_entregada = 0
   where solicitud_id = p_id
     and cantidad_entregada is null;

  update public.rnd_material_solicitudes
     set estado = 'entregada',
         entregado_por = trim(p_usuario),
         fecha_entrega = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'entregada', 'folio', v_folio,
                            'lineas', v_n, 'recibidas', v_recibidas);
end;
$$;

revoke execute on function public.material_entregar(uuid, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.material_entregar(uuid, text, jsonb, text) to service_role;
