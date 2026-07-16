-- Panel del empleado: comidas pendientes + codigo (mostrar existente o generar).
-- Regenera solo si p_regenerar o no hay OTP vigente hoy. Si hay comidas nuevas
-- no cubiertas por el codigo actual, devuelve hay_nuevas=true (la UI ofrece
-- "actualizar"). Mismo esquema de hash que valida la cajera: sha256(salt||codigo).
create or replace function public.empleado_panel(
  p_empleado_id integer,
  p_regenerar boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_semana date := (now() at time zone 'America/Mazatlan')::date;
  v_expira timestamptz := ((v_semana::text || ' 23:59:59')::timestamp) at time zone 'America/Mazatlan';
  v_comidas jsonb; v_total numeric; v_ids uuid[];
  v_codigo text; v_ex record; v_salt text; v_hash text; v_nuevas boolean := false;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'fecha',fecha,'monto',monto) order by fecha),'[]'::jsonb),
         coalesce(sum(monto),0), coalesce(array_agg(id), array[]::uuid[])
    into v_comidas, v_total, v_ids
  from rnd_reembolsos
  where empleado_id=p_empleado_id and concepto='COMIDAS' and estado='comida_pendiente';

  if array_length(v_ids,1) is null then
    return jsonb_build_object('comidas','[]'::jsonb,'total',0,'codigo',null,'expira_en',null,'hay_nuevas',false);
  end if;

  select * into v_ex from rnd_comida_otp where empleado_id=p_empleado_id and semana=v_semana;

  if p_regenerar or v_ex.id is null or v_ex.estado <> 'generado' then
    v_codigo := lpad((abs(('x'||encode(gen_random_bytes(4),'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    v_salt := gen_random_uuid()::text;
    v_hash := encode(digest(v_salt || v_codigo, 'sha256'), 'hex');
    perform public.registrar_otp_comida(p_empleado_id, v_semana, v_codigo, v_hash, v_salt, v_expira, v_ids, null);
  else
    v_codigo := public.revelar_codigo_comida(p_empleado_id, v_semana);
    v_nuevas := not (v_ids <@ v_ex.reembolso_ids and v_ex.reembolso_ids <@ v_ids);
  end if;

  return jsonb_build_object('comidas',v_comidas,'total',v_total,'codigo',v_codigo,
    'expira_en',v_expira,'hay_nuevas',v_nuevas);
end $$;

revoke all on function public.empleado_panel(integer,boolean) from public, anon, authenticated;
