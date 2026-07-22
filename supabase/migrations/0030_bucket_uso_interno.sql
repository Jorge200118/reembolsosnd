-- Bucket PRIVADO para la evidencia de entrega. No se reusa `rnd-documentos`
-- (el de la evidencia de reembolsos) porque está marcado como público:
-- cualquiera con la URL ve el archivo sin sesión.
--
-- A propósito NO se crean políticas: sin políticas, sólo `service_role` puede
-- leer o escribir, y toda la subida y la lectura pasan por nuestros route
-- handlers, que verifican rol y sucursal antes de tocar nada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rnd-uso-interno', 'rnd-uso-interno', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
