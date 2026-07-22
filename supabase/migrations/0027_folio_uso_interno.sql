-- El módulo pasa a llamarse "Uso interno" (era "Material"), así que el folio
-- deja de ser SM- (Solicitud de Material) y pasa a SUI- (Solicitud de Uso
-- Interno).
--
-- Se hace ahora y no después porque la tabla está vacía: no hay un solo folio
-- emitido, así que no queda ninguna solicitud vieja con el prefijo anterior ni
-- hay que explicarle a nadie por qué existen dos formatos. La secuencia sí
-- sigue donde va (no se reinicia): los números consumidos en pruebas quedan
-- consumidos, que es lo correcto para una secuencia.
--
-- Solo cambia el DEFAULT de la columna. Ni el tipo ni el índice único se tocan.

alter table public.rnd_material_solicitudes
  alter column folio set default ('SUI-' || lpad(nextval('public.rnd_material_folio_seq')::text, 6, '0'));
