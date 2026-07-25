-- Una entrega por área. La solicitud ya no se cierra de un golpe: cada
-- encargado marca lo suyo y la última en entregar es la que cierra.
--
-- El problema que arregla: antes bastaba con que UN encargado pusiera código y
-- foto para que la solicitud entera quedara 'entregada', aunque solo hubiera
-- surtido lo de su área. Si alguien pedía pijas (Ferretería) y cemento (Nave 2),
-- Ferretería cerraba las dos.
--
-- ⚠ OJO con lo que se ELIMINA de la versión anterior (0029, líneas 137-140):
--
--     update public.rnd_material_lineas
--        set cantidad_entregada = 0
--      where solicitud_id = p_id and cantidad_entregada is null;
--
-- Tenía sentido cuando una sola persona cerraba todo de un golpe. Con entrega
-- por área es exactamente el bug que venimos a arreglar: cuando Ferretería
-- entrega, ese update pondría en 0 todas las líneas de las naves, y como el
-- cierre se decide contando líneas en null, la solicitud cerraría de inmediato
-- con las naves marcadas como "entregado 0" sin que nadie de naves participara.
--
-- Ahora `cantidad_entregada is null` significa "esa área todavía no entrega" y
-- es la única señal de que falta algo. NO lo reintroduzcas.
-- El caso legítimo que cubría ("no había nada de ese material") lo sigue
-- cubriendo el encargado capturando 0 a mano, que la RPC acepta.

create table if not exists public.rnd_material_entregas_area (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.rnd_material_solicitudes(id) on delete cascade,
  area           text not null check (area in ('FERRETERIA','NAVE1','NAVE2','NAVE3')),
  entregado_por  text not null,
  fecha_entrega  timestamptz not null default now(),
  evidencia_path text not null,
  -- Una sola entrega por área y solicitud: si el encargado de Ferretería ya
  -- entregó, no puede volver a "entregar" lo mismo.
  unique (solicitud_id, area)
);

create index if not exists idx_material_entregas_area_solicitud
  on public.rnd_material_entregas_area (solicitud_id);

alter table public.rnd_material_entregas_area enable row level security;

-- Igual que las otras dos tablas del módulo: lectura abierta al escritorio,
-- escritura solo por RPC security definer.
drop policy if exists "lectura entregas area" on public.rnd_material_entregas_area;
create policy "lectura entregas area"
  on public.rnd_material_entregas_area for select
  to anon, authenticated using (true);

drop function if exists public.material_entregar(uuid, text, jsonb, text, text, text);

create function public.material_entregar(
  p_id uuid, p_usuario text, p_entregas jsonb, p_sucursal text,
  p_codigo text, p_evidencia_path text, p_area text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_estado text; v_folio text; v_suc text; v_n int; v_recibidas int;
  v_hash text; v_intentos int; v_bloq timestamptz;
  v_area text; v_pendientes int; v_lineas_area int; v_cerrada boolean;
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

  -- null = encargado sin área (sucursales que no las usan): entrega todo, que
  -- es el comportamiento anterior a este cambio.
  v_area := nullif(trim(coalesce(p_area, '')), '');
  if v_area is not null and v_area not in ('FERRETERIA','NAVE1','NAVE2','NAVE3') then
    return jsonb_build_object('ok', false, 'error', 'Área desconocida: ' || v_area);
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
    -- revierte. Si esto se cambiara a `raise`, el contador dejaría de contar.
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

  -- Doble entrega de la misma área. El UNIQUE lo impediría de todos modos, pero
  -- un mensaje claro vale más que un error de constraint.
  if v_area is not null and exists (
    select 1 from public.rnd_material_entregas_area
     where solicitud_id = p_id and area = v_area
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Esa área ya entregó lo suyo en esta solicitud');
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

  -- ★ El corazón del cambio: no puedes marcar entregado lo que no es tuyo.
  -- Una línea sin área la entrega cualquiera (líneas viejas, sucursales sin
  -- áreas); una línea con área solo la entrega su encargado.
  if v_area is not null and exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where l.area is not null and l.area <> v_area
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Hay materiales que no son de tu área; solo puedes entregar los tuyos');
  end if;

  -- No se puede re-entregar lo que otra área ya marcó.
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
      join public.rnd_material_lineas l
        on l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     where l.cantidad_entregada is not null
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Alguno de esos materiales ya se había entregado');
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

  -- Debe venir TODA su área, no una parte. Si el encargado de Ferretería manda
  -- 2 de sus 5 partidas, las otras 3 quedarían pendientes para siempre sin que
  -- nadie sepa que faltan.
  if v_area is not null then
    select count(*) into v_lineas_area
      from public.rnd_material_lineas
     where solicitud_id = p_id and area = v_area and cantidad_entregada is null;
    if v_recibidas <> v_lineas_area then
      return jsonb_build_object('ok', false,
        'error', 'Faltan materiales de tu área por capturar: son ' || v_lineas_area::text ||
                 ' y llegaron ' || v_recibidas::text);
    end if;
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

  if v_area is not null then
    insert into public.rnd_material_entregas_area
      (solicitud_id, area, entregado_por, fecha_entrega, evidencia_path)
    values (p_id, v_area, trim(p_usuario), now(), trim(p_evidencia_path));
  end if;

  -- ¿Queda algo por entregar? Esto es lo que decide si la solicitud se cierra.
  select count(*) into v_pendientes
    from public.rnd_material_lineas
   where solicitud_id = p_id and cantidad_entregada is null;

  v_cerrada := (v_pendientes = 0);

  if v_cerrada then
    update public.rnd_material_solicitudes
       set estado          = 'entregada',
           entregado_por   = trim(p_usuario),
           fecha_entrega   = now(),
           codigo_usado_en = now(),
           evidencia_path  = trim(p_evidencia_path)
     where id = p_id;
  else
    -- Sigue 'autorizada'. Se guarda la última foto para que la solicitud
    -- siempre tenga una evidencia visible aunque todavía no cierre.
    update public.rnd_material_solicitudes
       set evidencia_path = trim(p_evidencia_path)
     where id = p_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'estado', case when v_cerrada then 'entregada' else 'autorizada' end,
    'folio', v_folio,
    'lineas', v_n,
    'recibidas', v_recibidas,
    'cerrada', v_cerrada,
    'pendientes', v_pendientes,
    'area', v_area);
end;
$$;

revoke execute on function public.material_entregar(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.material_entregar(uuid, text, jsonb, text, text, text, text) to service_role;
