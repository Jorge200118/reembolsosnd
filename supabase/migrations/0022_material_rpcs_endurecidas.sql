-- Endurecimiento de las RPCs de material tras la revisión de código.
--
-- Tres agujeros reales en material_entregar, el único punto del módulo que
-- registra movimiento físico de mercancía:
--   1. aceptaba entregar más de lo pedido (999 de 2 pedidos, con ok:true);
--   2. descartaba en silencio las líneas que no empataban y devolvía ok:true
--      con un contador que no era el número de entradas recibidas;
--   3. con un linea_id duplicado ganaba un valor arbitrario, sin error.
-- El almacenista podía teclear 8 y que se guardara 0 mientras todos leían "OK".
--
-- Además: los casteos de jsonb levantaban excepción cruda (invalid input syntax)
-- en vez del {ok:false, error} que promete el spec §5, y la trazabilidad era
-- opcional (usuario vacío autorizaba igual, dejando autorizado_por en NULL).

-- ── 1. Cota dura: no se puede entregar más de lo pedido ─────────────────────
-- Ambas columnas viven en la misma fila, así que el check de tabla basta y
-- protege incluso si algún día alguien escribe por otra vía.
alter table public.rnd_material_lineas
  drop constraint if exists rnd_material_lineas_cantidad_entregada_check;

alter table public.rnd_material_lineas
  add constraint rnd_material_lineas_entregada_valida
  check (cantidad_entregada is null
         or (cantidad_entregada >= 0 and cantidad_entregada <= cantidad));

-- ── 2. La secuencia del folio no la toca la anon key ────────────────────────
-- El default se evalúa ANTES del WITH CHECK de RLS, así que un insert
-- rechazado igual quemaba un folio. No rompe nada (el folio es texto único),
-- pero que nadie lea el folio como "cuántas solicitudes hubo".
revoke usage, select, update on sequence public.rnd_material_folio_seq from anon, authenticated;

-- ── 3. material_crear: validar tipos, no reventar ───────────────────────────
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
        or coalesce(jsonb_typeof(l->'costo_unitario')      not in ('number','null'), false)
        or coalesce(jsonb_typeof(l->'existencia_al_pedir') not in ('number','null'), false)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales sin código o con cantidad inválida');
  end if;

  -- El empleado sale del padrón de comidas (`empleados`), que es el mismo que
  -- usa el login de la PWA. NO es rnd_empleados (ese es el de reembolsos).
  select trim(concat_ws(' ', e.nombre, e.apellido)), e.sucursal
    into v_nombre, v_suc_larga
    from public.empleados e
   where e.id = p_empleado_id and e.activo;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Empleado no encontrado o inactivo');
  end if;

  -- Nombre largo (EL FUERTE) -> abreviatura (FTE) + cod_estab del ERP.
  -- unaccent por consistencia con 0016: si un día llega 'CULIACÁN', comidas
  -- sigue funcionando y material no debe ser el único que falle duro.
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

-- ── 4. Autorizar y rechazar: la trazabilidad deja de ser opcional ───────────
-- Registrar quién autorizó es la razón de ser de estas RPCs (spec §1).
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
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién autoriza');
  end if;

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
         autorizado_por = trim(p_usuario),
         fecha_autorizacion = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'autorizada', 'folio', v_folio);
end;
$$;

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
  if coalesce(trim(p_usuario), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta quién rechaza');
  end if;

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
         autorizado_por = trim(p_usuario),
         fecha_autorizacion = now(),
         motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '')
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'rechazada', 'folio', v_folio);
end;
$$;

-- ── 5. Entregar: validar TODO antes de escribir nada ────────────────────────
-- Clave: las validaciones van antes del update. Devolver ok:false después de
-- haber escrito no revierte nada (la función corre en la transacción de quien
-- llama y el return es normal, no una excepción).
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

  -- Sin repetidos: antes ganaba uno arbitrario y el resto se perdía callado.
  if v_recibidas <> (
    select count(distinct e->>'linea_id')
      from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
  ) then
    return jsonb_build_object('ok', false, 'error', 'Hay materiales repetidos en la entrega');
  end if;

  -- Pertenencia: ninguna línea puede ser de otra solicitud.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e
     where not exists (
       select 1 from public.rnd_material_lineas l
        where l.id = (e->>'linea_id')::uuid and l.solicitud_id = p_id
     )
  ) then
    return jsonb_build_object('ok', false, 'error', 'Alguna línea no pertenece a esta solicitud');
  end if;

  -- Tope: no se entrega más de lo pedido.
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

-- ── 6. Recordatorio para el futuro ──────────────────────────────────────────
-- create or replace PRESERVA la ACL, así que el cerrojo de 0021 sobrevive a
-- este archivo. Pero cambiar la FIRMA de una función crea una función nueva
-- con execute a PUBLIC: si algún día cambias parámetros, mueve también su
-- revoke/grant. Es la misma trampa que documentó 0016.
--
-- Nota de diseño: rnd_material_solicitudes.empleado_id NO tiene llave foránea
-- a empleados a propósito. Ninguna tabla rnd_* la tiene: ese padrón es ajeno al
-- módulo, y empleado_nombre queda congelado para que la solicitud siga siendo
-- legible aunque el empleado se dé de baja.
