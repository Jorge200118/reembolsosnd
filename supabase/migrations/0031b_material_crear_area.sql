-- material_crear ahora guarda el área de cada partida. El área la calcula el
-- servidor en confirmar.ts leyendo la zona del ERP; aquí solo se valida que sea
-- una de las cuatro y se escribe. El CHECK de la tabla es la última red: un
-- valor inventado aborta la transacción en vez de guardarse.
--
-- Es la función de 0023 con DOS cambios: la validación del área y la columna
-- `area` en el insert de líneas. Todo lo demás va idéntico.

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

  -- El área, cuando viene, tiene que ser una de las cuatro. Viene ausente en las
  -- sucursales que no usan áreas, y eso es válido.
  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where nullif(trim(coalesce(l->>'area', '')), '') is not null
       and trim(l->>'area') not in ('FERRETERIA','NAVE1','NAVE2','NAVE3')
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales con un área desconocida');
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
    (solicitud_id, orden, cod_prod, descripcion, unidad, cantidad, costo_unitario, existencia_al_pedir, area)
  select v_id,
         (t.ord - 1)::int,
         trim(t.l->>'cod_prod'),
         trim(t.l->>'descripcion'),
         nullif(trim(coalesce(t.l->>'unidad', '')), ''),
         (t.l->>'cantidad')::numeric,
         nullif(t.l->>'costo_unitario', '')::numeric,
         nullif(t.l->>'existencia_al_pedir', '')::numeric,
         nullif(trim(coalesce(t.l->>'area', '')), '')
    from jsonb_array_elements(p_lineas) with ordinality as t(l, ord);

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'id', v_id, 'folio', v_folio, 'lineas', v_n);
end;
$$;
