-- Rellena empleado_id en comidas PENDIENTES sin liga, cruzando por nombre
-- normalizado (MAYUSCULAS, sin acentos, espacios colapsados). Idempotente:
-- solo toca filas con empleado_id nulo. No modifica historico cobrado.
-- unaccent vive en el esquema extensions.
create extension if not exists unaccent with schema extensions;

with match as (
  select r.id as reembolso_id, e.id as emp_id
  from rnd_reembolsos r
  join empleados e
    on upper(regexp_replace(extensions.unaccent(trim(e.nombre) || ' ' || trim(e.apellido)), '\s+', ' ', 'g'))
     = upper(regexp_replace(extensions.unaccent(trim(r.nombre_beneficiario)), '\s+', ' ', 'g'))
  where r.concepto = 'COMIDAS'
    and r.estado = 'comida_pendiente'
    and r.empleado_id is null
    and e.activo = true
)
update rnd_reembolsos r
set empleado_id = m.emp_id
from match m
where r.id = m.reembolso_id;
