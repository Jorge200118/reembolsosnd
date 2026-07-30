-- El motivo de la solicitud de uso interno pasa a ser obligatorio.
--
-- Dos cambios sobre `rnd_material_solicitudes`:
--   1. `nota` se llama ahora `motivo`. "Nota" se leía como algo opcional y por
--      eso la pantalla lo pedía como "(opcional)"; el campo es en realidad la
--      justificación que el gerente lee para autorizar.
--   2. Deja de aceptar nulos y se le pone un CHECK contra el texto en blanco,
--      porque `not null` por sí solo dejaría pasar '' y '   '.
--
-- El rename es seguro: la tabla está vacía (verificado antes de escribir esta
-- migración). Si algún día se corre sobre datos, el `not null` abortaría, que es
-- lo correcto: obliga a decidir qué motivo llevan las filas viejas.

alter table public.rnd_material_solicitudes rename column nota to motivo;

alter table public.rnd_material_solicitudes
  alter column motivo set not null;

alter table public.rnd_material_solicitudes
  add constraint rnd_material_solicitudes_motivo_no_vacio
  check (btrim(motivo) <> '');

-- material_crear: es la función de 0031b con el motivo obligatorio. Se valida
-- arriba junto con las demás entradas del empleado para que el error salga como
-- jsonb (mensaje que la PWA muestra tal cual) y no como excepción del CHECK.
--
-- Va con DROP y no con `create or replace` porque cambia el nombre de un
-- parámetro (p_nota -> p_motivo), y Postgres no permite renombrar parámetros
-- con replace: falla con "cannot change name of input parameter". La firma
-- (int, text, jsonb) no cambia, así que el drop apunta a la vieja.
drop function if exists public.material_crear(int, text, jsonb);

create function public.material_crear(
  p_empleado_id int,
  p_motivo      text,
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
  v_motivo    text;
  v_id        uuid;
  v_folio     text;
  v_n         int;
begin
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'error', 'Escribe para qué necesitas el material');
  end if;

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
    (empleado_id, empleado_nombre, sucursal, cod_estab, motivo)
  values
    (p_empleado_id, v_nombre, v_abrev, v_cod_estab, v_motivo)
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
