-- Filtro de pendientes de comida por sucursal de la cajera.
--
-- Problema: tres vocabularios de sucursal que no coinciden:
--   * cajera (rnd_usuarios.sucursal): abreviatura  -> 'FTE', 'LMM', 'CSL'...
--   * empleado (empleados.sucursal):  nombre largo -> 'EL FUERTE', 'MATRIZ'...
--   * rnd_reembolsos.sucursal_usuario: sucia (mezcla ambos) -> se descarta.
-- El mapeo no es derivable por prefijo (LMM = MATRIZ), así que va en catálogo.
--
-- Criterio: filtrar por sucursal del EMPLEADO beneficiario (empleados.sucursal).

-- 1) Catálogo abreviatura -> nombre largo. Fuente única de verdad.
create table if not exists public.sucursales_map (
  abrev        text primary key,
  nombre_largo text not null
);

insert into public.sucursales_map (abrev, nombre_largo) values
  ('FTE', 'EL FUERTE'),
  ('LMM', 'MATRIZ'),
  ('CSL', 'CABOS'),
  ('CLN', 'CULIACAN'),
  ('JJR', 'JUAN JOSE RIOS'),
  ('LPZ', 'LA PAZ'),
  ('SJC', 'SAN JOSE'),
  ('TML', 'TAMARAL')
on conflict (abrev) do update set nombre_largo = excluded.nombre_largo;

-- 2) RPC con parámetro opcional p_sucursal (abreviatura de la cajera).
--    p_sucursal NULL  -> sin filtro (compatibilidad: gerente/reportes).
--    p_sucursal 'FTE' -> resuelve 'EL FUERTE' y filtra empleados.sucursal.
--    El filtro se aplica DENTRO del CTE base, sobre el emp_id ya resuelto,
--    para que count/sum/array_agg y totales salgan correctos.
--
-- OJO: la versión previa era comidas_pendientes_por_chofer() SIN argumentos.
-- create-or-replace NO la sustituye (distinta firma) y quedarían dos sobrecargas;
-- llamar sin args daría "function is not unique". Por eso hay que dropear la de 0
-- argumentos antes de crear la nueva. La nueva, con default null, cubre las
-- llamadas sin argumento del código existente.
drop function if exists public.comidas_pendientes_por_chofer();

create or replace function public.comidas_pendientes_por_chofer(
  p_sucursal text default null
)
returns table(
  empleado_id integer,
  nombre_beneficiario text,
  telefono text,
  num_comidas bigint,
  total numeric,
  reembolso_ids uuid[],
  estatus text
)
language sql
stable
as $function$
  with objetivo as (
    -- sin_filtro distingue "no hay filtro" (p_sucursal null -> ver todo) de
    -- "hay filtro pero la abreviatura no mapea" (nombre_largo null -> ver nada).
    -- Sin esta distinción, una abreviatura desconocida mostraría TODAS las
    -- sucursales, justo lo contrario de lo que se quiere.
    select
      (p_sucursal is null) as sin_filtro,
      case
        when p_sucursal is null then null
        else (select upper(btrim(m.nombre_largo))
              from sucursales_map m
              where upper(btrim(m.abrev)) = upper(btrim(p_sucursal)))
      end as nombre_largo
  ),
  base as (
    select r.id as reembolso_id, r.nombre_beneficiario, r.monto,
      coalesce(
        r.empleado_id,
        (select e.id from empleados e
          where e.activo
            and upper(regexp_replace(e.nombre||' '||e.apellido,'\s+',' ','g'))
              = upper(regexp_replace(r.nombre_beneficiario,'\s+',' ','g'))
          limit 1)
      ) as emp_id
    from rnd_reembolsos r
    where r.concepto='COMIDAS' and r.estado='comida_pendiente'
  ),
  filtrada as (
    select b.*
    from base b, objetivo o
    where
      -- sin filtro (p_sucursal null): pasa todo
      o.sin_filtro
      -- con filtro: el empleado resuelto debe ser de esa sucursal.
      -- emp_id null (sin_match) queda fuera cuando hay filtro activo.
      -- abreviatura desconocida (nombre_largo null): no matchea -> ve nada.
      or exists (
        select 1 from empleados e
        where e.id = b.emp_id
          and upper(btrim(e.sucursal)) = o.nombre_largo
      )
  )
  select
    f.emp_id as empleado_id,
    max(f.nombre_beneficiario) as nombre_beneficiario,
    (select e.telefono_whatsapp from empleados e where e.id = f.emp_id) as telefono,
    count(*) as num_comidas,
    sum(f.monto) as total,
    array_agg(f.reembolso_id) as reembolso_ids,
    case
      when f.emp_id is null then 'sin_match'
      when (select e.telefono_whatsapp from empleados e where e.id=f.emp_id) is null
        or btrim((select e.telefono_whatsapp from empleados e where e.id=f.emp_id))='' then 'sin_telefono'
      else 'ok'
    end as estatus
  from filtrada f
  group by f.emp_id
  order by nombre_beneficiario;
$function$;
