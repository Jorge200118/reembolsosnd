-- FASE 2: aplicar de verdad en BMS.
--
-- Aplicar un folio toca DOS sistemas: BMS (SQL Server) y esta base. No hay
-- transacción que abarque a los dos, así que hay que elegir hacia qué lado se
-- rompe cuando algo falla en medio.
--
-- El peor error posible aquí es la DOBLE DESCARGA: que BMS grabe pero esta base
-- no se entere, porque entonces la pantalla vuelve a ofrecer esas partidas y el
-- material se descuenta dos veces del inventario. Nadie lo nota hasta el
-- conteo físico.
--
-- Por eso el orden es RESERVAR -> APLICAR EN BMS -> CONFIRMAR:
--
--   1. Se crea la aplicación en 'en_proceso' con sus partidas. El unique sobre
--      linea_id las deja apartadas: ninguna otra pestaña ni otro usuario puede
--      tomarlas mientras tanto.
--   2. Se llama a BMS.
--   3. Se confirma con el folio real y las cantidades que BMS reportó.
--
-- Si truena entre 2 y 3 queda una fila 'en_proceso' sin folio: un pendiente
-- VISIBLE que alguien reconcilia a mano contra BMS, con las partidas todavía
-- apartadas. Se rompe hacia el lado seguro — nunca se descarga dos veces.

-- 'en_proceso': reservado, sin confirmar todavía.
-- 'fallida':    BMS rechazó explícitamente; las partidas se liberan.
alter table public.rnd_inventario_aplicaciones
  drop constraint if exists rnd_inventario_aplicaciones_estado_check;

alter table public.rnd_inventario_aplicaciones
  add constraint rnd_inventario_aplicaciones_estado_check
  check (estado in ('en_proceso','aplicada','cancelada','fallida'));

-- Mientras está 'en_proceso' todavía no hay folio: BMS lo asigna al aplicar.
alter table public.rnd_inventario_aplicaciones
  alter column folio_bms drop not null;

-- El unique de folio ya no puede incluir filas sin folio (varias 'en_proceso'
-- tendrían folio_bms null y en Postgres los null no chocan entre sí, pero es
-- más claro decirlo explícito con un índice parcial).
alter table public.rnd_inventario_aplicaciones
  drop constraint if exists rnd_inventario_aplicaciones_folio_bms_transaccion_cod_estab_key;

create unique index if not exists idx_inv_aplic_folio_unico
  on public.rnd_inventario_aplicaciones (folio_bms, transaccion, cod_estab)
  where folio_bms is not null;

-- Una aplicación confirmada SIEMPRE trae folio; una en proceso, nunca.
alter table public.rnd_inventario_aplicaciones
  drop constraint if exists chk_inv_aplic_folio_coherente;

alter table public.rnd_inventario_aplicaciones
  add constraint chk_inv_aplic_folio_coherente check (
    (estado = 'en_proceso' and folio_bms is null)
    or (estado in ('aplicada','cancelada') and folio_bms is not null)
    or (estado = 'fallida')
  );

comment on column public.rnd_inventario_aplicaciones.estado is
  'en_proceso = reservado sin confirmar; aplicada = con folio en BMS; cancelada = revertida en BMS; fallida = BMS rechazo, partidas liberadas';

-- La vista de pendientes debe seguir escondiendo lo reservado: una partida
-- 'en_proceso' está en vuelo y no se puede volver a ofrecer.
create or replace view public.rnd_inventario_pendientes
with (security_invoker = on) as
select
  l.id                as linea_id,
  s.id                as solicitud_id,
  s.folio             as folio_solicitud,
  s.sucursal,
  s.cod_estab,
  s.empleado_id,
  s.empleado_nombre,
  s.fecha_entrega,
  l.area,
  l.cod_prod,
  l.descripcion,
  l.unidad,
  l.cantidad_entregada as cantidad,
  l.costo_unitario
from public.rnd_material_lineas l
join public.rnd_material_solicitudes s on s.id = l.solicitud_id
where l.cantidad_entregada is not null
  and l.cantidad_entregada > 0
  and s.estado = 'entregada'
  and not exists (
    select 1
    from public.rnd_inventario_aplicaciones_lineas al
    join public.rnd_inventario_aplicaciones a on a.id = al.aplicacion_id
    where al.linea_id = l.id
      -- 'en_proceso' cuenta como ocupada: está en vuelo hacia BMS.
      -- 'fallida' y 'cancelada' NO: esas partidas vuelven a estar disponibles.
      and a.estado in ('aplicada','en_proceso')
  );

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- Escriben con service_role, igual que las RPCs de material (migración 0021).
-- Se revoca execute a anon/authenticated: nadie debe poder reservar ni
-- confirmar desde el navegador.

-- 1) RESERVAR. Aparta las partidas antes de tocar BMS.
create or replace function public.inventario_reservar(
  p_sucursal  text,
  p_cod_estab int,
  p_usuario   text,
  p_lineas    jsonb        -- [{linea_id, cod_prod, cantidad, costo_unitario}]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n  int;
begin
  if p_usuario is null or btrim(p_usuario) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario');
  end if;
  if p_cod_estab is null then
    return jsonb_build_object('ok', false, 'error', 'Esta sucursal no tiene establecimiento del ERP');
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    return jsonb_build_object('ok', false, 'error', 'No hay partidas que aplicar');
  end if;

  -- Se valida TODO antes de insertar nada. En PL/pgSQL un `return` normal no
  -- revierte lo ya escrito (la función corre dentro de la transacción de quien
  -- llama), así que rechazar después de haber insertado dejaría una reserva
  -- huérfana apartando partidas que nadie va a aplicar.
  --
  -- La vista `rnd_inventario_pendientes` ya excluye lo aplicado y lo que está
  -- en proceso, así que esta sola comprobación cubre los dos casos: la partida
  -- dejó de estar pendiente, o alguien más la apartó primero.
  if exists (
    select 1 from jsonb_array_elements(p_lineas) e
    where not exists (
      select 1 from public.rnd_inventario_pendientes p
      where p.linea_id = (e->>'linea_id')::uuid
    )
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'DESACTUALIZADA',
      'error', 'Algunas partidas ya no están pendientes o alguien más las está aplicando; recarga la pantalla');
  end if;

  -- Cabecera y partidas van dentro del MISMO bloque con manejo de excepción:
  -- así forman una subtransacción y, si el unique(linea_id) revienta por una
  -- carrera entre dos pestañas, se revierten las dos cosas y no queda cabecera
  -- suelta. Ese unique es la garantía dura contra la doble descarga; la
  -- comprobación de arriba solo sirve para dar un mensaje entendible.
  begin
    insert into public.rnd_inventario_aplicaciones
      (cod_estab, sucursal, estado, aplicado_por, partidas, unidades, costo_total)
    values (p_cod_estab, p_sucursal, 'en_proceso', p_usuario, 0, 0, 0)
    returning id into v_id;

    insert into public.rnd_inventario_aplicaciones_lineas
      (aplicacion_id, linea_id, cod_prod, cantidad_solicitada, cantidad_aplicada, costo_unitario)
    select v_id,
           (e->>'linea_id')::uuid,
           e->>'cod_prod',
           (e->>'cantidad')::numeric,
           0,                                   -- todavía no se aplica nada
           nullif(e->>'costo_unitario','')::numeric
    from jsonb_array_elements(p_lineas) e;

    get diagnostics v_n = row_count;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'codigo', 'YA_APARTADA',
      'error', 'Alguien más está aplicando estas partidas; recarga la pantalla');
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'partidas', v_n);
end $$;

-- 2) CONFIRMAR. Ya hay folio en BMS: se guarda lo que el ERP reportó.
create or replace function public.inventario_confirmar(
  p_id         uuid,
  p_folio_bms  text,
  p_aplicadas  jsonb        -- [{linea_id, cantidad_aplicada}]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  select estado into v_estado from public.rnd_inventario_aplicaciones where id = p_id for update;
  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'No existe esa aplicación');
  end if;
  -- Idempotente: confirmar dos veces la misma no duplica ni revienta. Importa
  -- porque un reintento tras un timeout puede llegar a una ya confirmada.
  if v_estado = 'aplicada' then
    return jsonb_build_object('ok', true, 'yaEstaba', true);
  end if;
  if v_estado <> 'en_proceso' then
    return jsonb_build_object('ok', false, 'error', 'Esta aplicación está ' || v_estado);
  end if;

  update public.rnd_inventario_aplicaciones_lineas al
     set cantidad_aplicada = (e->>'cantidad_aplicada')::numeric
    from jsonb_array_elements(p_aplicadas) e
   where al.aplicacion_id = p_id
     and al.linea_id = (e->>'linea_id')::uuid;

  update public.rnd_inventario_aplicaciones a
     set folio_bms   = p_folio_bms,
         estado      = 'aplicada',
         aplicado_en = now(),
         partidas    = t.n,
         unidades    = t.uds,
         costo_total = t.costo
    from (
      select count(*) as n,
             coalesce(sum(cantidad_aplicada), 0) as uds,
             coalesce(sum(cantidad_aplicada * coalesce(costo_unitario, 0)), 0) as costo
      from public.rnd_inventario_aplicaciones_lineas where aplicacion_id = p_id
    ) t
   where a.id = p_id;

  return jsonb_build_object('ok', true, 'folio', p_folio_bms);
end $$;

-- 3) LIBERAR. BMS rechazó de forma EXPLÍCITA (nada quedó escrito allá), así que
-- las partidas vuelven a estar disponibles.
--
-- OJO: no se usa cuando la llamada al ERP se cae por red o timeout. Ahí no se
-- sabe si BMS grabó, y liberar sería justamente provocar la doble descarga.
-- Esos casos se quedan 'en_proceso' a propósito, para revisarse a mano.
create or replace function public.inventario_liberar(
  p_id     uuid,
  p_motivo text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_estado text;
begin
  select estado into v_estado from public.rnd_inventario_aplicaciones where id = p_id for update;
  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'No existe esa aplicación');
  end if;
  if v_estado <> 'en_proceso' then
    return jsonb_build_object('ok', false, 'error', 'Solo se libera lo que está en proceso');
  end if;

  -- Se borran las líneas para soltar el unique(linea_id) y que la vista de
  -- pendientes las vuelva a mostrar. La cabecera se conserva en 'fallida' como
  -- rastro de que se intentó y por qué.
  delete from public.rnd_inventario_aplicaciones_lineas where aplicacion_id = p_id;

  update public.rnd_inventario_aplicaciones
     set estado = 'fallida', motivo_cancelacion = left(coalesce(p_motivo, ''), 400)
   where id = p_id;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.inventario_reservar(text,int,text,jsonb)  from anon, authenticated;
revoke execute on function public.inventario_confirmar(uuid,text,jsonb)     from anon, authenticated;
revoke execute on function public.inventario_liberar(uuid,text)             from anon, authenticated;
