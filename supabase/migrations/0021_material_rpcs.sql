-- Único camino de escritura del módulo de material. Cada RPC valida la
-- transición de estado con un `for update` sobre la solicitud, para que dos
-- clics simultáneos no autoricen ni entreguen dos veces: gana el primero.
--
-- Todas devuelven jsonb {ok, ...}. Los errores de negocio vuelven como
-- ok:false con mensaje legible; solo lo verdaderamente excepcional levanta.

-- ── Crear (la llama el route handler del empleado con service_role) ──────────
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

  if exists (
    select 1 from jsonb_array_elements(p_lineas) l
     where coalesce(trim(l->>'cod_prod'), '') = ''
        or coalesce(trim(l->>'descripcion'), '') = ''
        or coalesce((l->>'cantidad')::numeric, 0) <= 0
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales sin código o con cantidad inválida');
  end if;

  -- El empleado sale del padrón de comidas (`empleados`), que es el mismo que
  -- usa el login de la PWA. NO es rnd_empleados (ese es el de reembolsos).
  select trim(concat_ws(' ', e.nombre, e.apellido)), e.sucursal
    into v_nombre, v_suc_larga
    from public.empleados e
   where e.id = p_empleado_id and e.activo;

  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Empleado no encontrado o inactivo');
  end if;

  -- Nombre largo (EL FUERTE) -> abreviatura (FTE) + cod_estab del ERP.
  select m.abrev, m.cod_estab
    into v_abrev, v_cod_estab
    from public.sucursales_map m
   where upper(trim(m.nombre_largo)) = upper(trim(coalesce(v_suc_larga, '')));

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

-- ── Autorizar (gerente) ─────────────────────────────────────────────────────
create or replace function public.material_autorizar(
  p_id      uuid,
  p_usuario text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text;
begin
  select estado, folio into v_estado, v_folio
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'La solicitud ya está ' || v_estado);
  end if;

  update public.rnd_material_solicitudes
     set estado = 'autorizada',
         autorizado_por = nullif(trim(coalesce(p_usuario, '')), ''),
         fecha_autorizacion = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', v_folio);
end;
$$;

-- ── Rechazar (gerente) ──────────────────────────────────────────────────────
create or replace function public.material_rechazar(
  p_id      uuid,
  p_usuario text,
  p_motivo  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text;
begin
  select estado, folio into v_estado, v_folio
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'La solicitud ya está ' || v_estado);
  end if;

  update public.rnd_material_solicitudes
     set estado = 'rechazada',
         autorizado_por = nullif(trim(coalesce(p_usuario, '')), ''),
         fecha_autorizacion = now(),
         motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'rechazada', 'folio', v_folio);
end;
$$;

-- ── Entregar (almacén) ──────────────────────────────────────────────────────
-- p_entregas: [{"linea_id": "<uuid>", "cantidad_entregada": 3}, ...]
-- Las líneas que no vengan en el arreglo se cierran en 0: si no se capturó,
-- no se entregó. Así ninguna línea queda en NULL después de cerrar.
create or replace function public.material_entregar(
  p_id       uuid,
  p_usuario  text,
  p_entregas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_folio text; v_n int;
begin
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

  update public.rnd_material_lineas l
     set cantidad_entregada = greatest(0, (e->>'cantidad_entregada')::numeric)
    from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
   where l.solicitud_id = p_id
     and l.id = (e->>'linea_id')::uuid;
  get diagnostics v_n = row_count;

  update public.rnd_material_lineas
     set cantidad_entregada = 0
   where solicitud_id = p_id
     and cantidad_entregada is null;

  update public.rnd_material_solicitudes
     set estado = 'entregada',
         entregado_por = nullif(trim(coalesce(p_usuario, '')), ''),
         fecha_entrega = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'entregada', 'folio', v_folio, 'lineas', v_n);
end;
$$;

-- ── Cancelar (el propio empleado, solo mientras siga pendiente) ─────────────
create or replace function public.material_cancelar(
  p_id          uuid,
  p_empleado_id int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text; v_dueno int;
begin
  select estado, empleado_id into v_estado, v_dueno
    from public.rnd_material_solicitudes
   where id = p_id
   for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if v_dueno is distinct from p_empleado_id then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud no es tuya');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'estado', v_estado,
                              'error', 'Ya no se puede cancelar: está ' || v_estado);
  end if;

  update public.rnd_material_solicitudes
     set estado = 'cancelada'
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'cancelada');
end;
$$;

-- ── Cerrojo: solo service_role escribe ──────────────────────────────────────
-- Por defecto Postgres da execute a public; hay que quitarlo explícitamente,
-- o la anon key del navegador podría llamar estas funciones.
revoke execute on function public.material_crear(int, text, jsonb)      from public, anon, authenticated;
revoke execute on function public.material_autorizar(uuid, text)        from public, anon, authenticated;
revoke execute on function public.material_rechazar(uuid, text, text)   from public, anon, authenticated;
revoke execute on function public.material_entregar(uuid, text, jsonb)  from public, anon, authenticated;
revoke execute on function public.material_cancelar(uuid, int)          from public, anon, authenticated;

grant execute on function public.material_crear(int, text, jsonb)       to service_role;
grant execute on function public.material_autorizar(uuid, text)         to service_role;
grant execute on function public.material_rechazar(uuid, text, text)    to service_role;
grant execute on function public.material_entregar(uuid, text, jsonb)   to service_role;
grant execute on function public.material_cancelar(uuid, int)           to service_role;
