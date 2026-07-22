-- Cierre del residual que encontró la re-revisión de 0022.
--
-- material_entregar deduplicaba sobre TEXTO (count(distinct e->>'linea_id'))
-- pero unía sobre UUID, y la regex de formato es case-insensitive. El mismo
-- uuid en dos capitalizaciones pasaba las tres validaciones y ganaba un valor
-- arbitrario: el bug de "el almacenista teclea 8 y se guarda 0", en versión
-- estrecha.
--
-- Se deduplica sobre uuid (seguro: la regex ya validó el formato) y se deja
-- una aserción posterior al update. La aserción usa `raise`, NO `return`:
-- devolver ok:false después de escribir no revertiría nada, porque la función
-- corre en la transacción de quien llama y un return normal no aborta.
--
-- De paso: separar el mensaje de error de costo_unitario/existencia_al_pedir.
-- Esos dos campos los llena el ERP, no el empleado, así que decirle "materiales
-- sin código o con cantidad inválida" le señala un campo que él no tocó.

create or replace function public.material_crear(
  p_empleado_id int,
  p_nota        text,
  p_lineas      jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre    text;
  v_suc_larga text;
  v_abrev     text;
  v_cod_estab int;
  v_id        uuid;
  v_folio     text;
  v_n         int;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'La solicitud no tiene materiales');
  end if;

  -- El CASE es deliberado: en SQL el `or` no garantiza corto circuito, así que
  -- comprobar el tipo y castear en dos condiciones separadas podía castear igual
  -- y levantar 22P02 ("invalid input syntax for type numeric").
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where coalesce(trim(l->>'cod_prod'), '') = ''
        or coalesce(trim(l->>'descripcion'), '') = ''
        or case when jsonb_typeof(l->'cantidad') = 'number'
                then (l->>'cantidad')::numeric <= 0
                else true
           end
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales sin código o con cantidad inválida');
  end if;

  -- Estos dos vienen del ERP, no del empleado: mensaje aparte para que la PWA
  -- no le señale un campo que él nunca llenó.
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where coalesce(jsonb_typeof(l->'costo_unitario')      not in ('number','null'), false)
        or coalesce(jsonb_typeof(l->'existencia_al_pedir') not in ('number','null'), false)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Los datos del catálogo llegaron corruptos, vuelve a buscar el material');
  end if;

  select trim(concat_ws(' ', e.nombre, e.apellido)), e.sucursal
    into v_nombre, v_suc_larga
    from public.empleados e
   where e.id = p_empleado_id and e.activo;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Empleado no encontrado o inactivo');
  end if;

  select m.abrev, m.cod_estab
    into v_abrev, v_cod_estab
    from public.sucursales_map m
   where extensions.unaccent(upper(btrim(m.nombre_largo)))
       = extensions.unaccent(upper(btrim(coalesce(v_suc_larga, ''))));

  if v_abrev is null then
    return jsonb_build_object('ok', false, 'error', 'Tu sucursal no está configurada, avisa a sistemas');
  end if;

  insert into public.rnd_material_solicitudes
    (empleado_id, empleado_nombre, sucursal, cod_estab, nota)
  values
    (p_empleado_id, v_nombre, v_abrev, v_cod_estab, nullif(trim(coalesce(p_nota, '')), ''))
  returning id, folio into v_id, v_folio;

  insert into public.rnd_material_lineas
    (solicitud_id, orden, cod_prod, descripcion, unidad, cantidad, costo_unitario, existencia_al_pedir)
  select v_id,
         (t.ord - 1)::int,
         trim(t.l->>'cod_prod'),
         trim(t.l->>'descripcion'),
         nullif(trim(coalesce(t.l->>'unidad', '')), ''),
         (t.l->>'cantidad')::numeric,
         nullif(t.l->>'costo_unitario', '')::numeric,
         nullif(t.l->>'existencia_al_pedir', '')::numeric
    from jsonb_array_elements(p_lineas) with ordinality as t(l, ord);

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'lineas', v_n);
end;
$$;

create or replace function public.material_entregar(
  p_id       uuid,
  p_usuario  text,
  p_entregas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text; v_n int; v_recibidas int;
begin
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién entrega');
  end if;
  if p_entregas is not null and jsonb_typeof(p_entregas) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'Las entregas deben venir en una lista');
  end if;

  select estado, folio into v_estado, v_folio
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_estado <> 'autorizada' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Solo se entrega lo autorizado; esta solicitud está ' || v_estado);
  end if;

  v_recibidas := jsonb_array_length(coalesce(p_entregas, '[]'::jsonb));

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
