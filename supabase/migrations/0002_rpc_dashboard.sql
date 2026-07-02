-- Agregación server-side: conteo y suma por estado. Evita traer 9,409 filas al cliente.
create or replace function public.rnd_dashboard_por_estado()
returns table (estado text, cantidad bigint, total numeric)
language sql
stable
as $$
  select estado, count(*)::bigint as cantidad, coalesce(sum(monto), 0) as total
  from public.rnd_reembolsos
  group by estado;
$$;
