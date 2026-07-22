-- Cuarto vocabulario de sucursal: el cod_estab numérico del ERP (SQL Server BMSCabos).
--
-- Ya conviven tres vocabularios:
--   * abreviatura   (rnd_usuarios.sucursal)  -> 'FTE', 'LMM', 'CSL'...
--   * nombre largo  (empleados.sucursal)     -> 'EL FUERTE', 'MATRIZ'...
--   * nombre bonito (packages/domain)        -> 'El Fuerte', 'Los Mochis'... (solo UI)
-- El ERP usa un cuarto: un entero por establecimiento. No es derivable de nada,
-- así que vive en sucursales_map, que ya es la fuente única de verdad del mapeo.
--
-- Valores tomados de C:\censos-web\config\sucursales.js (SUCURSALES).
-- Ojo: CSL (CSL Brisas, estab 8) es el único cuyo BMS vive en otro servidor y
-- se consulta por linked server; eso lo resuelve censos-web, no esta tabla.

alter table public.sucursales_map
  add column if not exists cod_estab int;

update public.sucursales_map as s
   set cod_estab = v.cod
  from (values
    ('LMM', 1),
    ('FTE', 3),
    ('CLN', 5),
    ('LPZ', 6),
    ('SJC', 7),
    ('CSL', 8),
    ('JJR', 11),
    ('TML', 17)
  ) as v(abrev, cod)
 where s.abrev = v.abrev;

comment on column public.sucursales_map.cod_estab is
  'cod_estab del ERP BMSCabos. Fuente: censos-web/config/sucursales.js';
