-- Cancelar un folio ya aplicado. El movimiento se revierte en BMS (el
-- inventario regresa y la póliza se da de baja) y aquí se marca la aplicación.
--
-- Al cancelar, las partidas VUELVEN a estar pendientes: la vista
-- `rnd_inventario_pendientes` solo esconde lo que está 'aplicada' o
-- 'en_proceso'. Es lo correcto y no un descuido — el material se entregó al
-- empleado igual, así que sigue faltando descargarlo del ERP. Si se cancela un
-- folio es porque estaba mal armado, no porque el material haya vuelto al
-- almacén.
--
-- El orden de la operación completa es al revés que el de aplicar: primero se
-- cancela en BMS y después se registra aquí. Si truena en medio, la aplicación
-- se queda 'aplicada' y las partidas siguen apartadas — conservador. Al revés
-- (marcar cancelada aquí y fallar allá) las partidas volverían a la lista y se
-- descargarían otra vez sobre un folio que sigue vivo en el ERP.

create or replace function public.inventario_cancelar(
  p_id      uuid,
  p_usuario text,
  p_motivo  text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_estado text; v_folio text;
begin
  if p_usuario is null or btrim(p_usuario) = '' then
    return jsonb_build_object('ok', false, 'error', 'Falta el usuario');
  end if;

  select estado, folio_bms into v_estado, v_folio
    from public.rnd_inventario_aplicaciones where id = p_id for update;

  if v_estado is null then
    return jsonb_build_object('ok', false, 'error', 'No existe esa aplicacion');
  end if;

  -- Idempotente: un reintento tras un timeout no debe reventar ni duplicar.
  if v_estado = 'cancelada' then
    return jsonb_build_object('ok', true, 'yaEstaba', true, 'folio', v_folio);
  end if;

  -- Solo se cancela lo que llegó a aplicarse. Una 'en_proceso' no tiene folio
  -- que revertir en el ERP; esa se resuelve con inventario_liberar, y solo
  -- después de confirmar a mano que BMS no grabó nada.
  if v_estado <> 'aplicada' then
    return jsonb_build_object('ok', false, 'codigo', 'NO_APLICADA',
      'error', 'Solo se cancela una aplicacion con folio; esta esta ' || v_estado);
  end if;

  update public.rnd_inventario_aplicaciones
     set estado             = 'cancelada',
         cancelado_por      = p_usuario,
         cancelado_en       = now(),
         motivo_cancelacion = left(coalesce(p_motivo, ''), 400)
   where id = p_id;

  return jsonb_build_object('ok', true, 'folio', v_folio);
end $$;

revoke execute on function public.inventario_cancelar(uuid,text,text) from anon, authenticated;
