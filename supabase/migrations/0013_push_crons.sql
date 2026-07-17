-- Cron del recordatorio push: 15:00 Mazatlán (UTC-7) = 22:00 UTC, L-V.
-- codigo_listo NO es cron: se encadena al final de generar-otp-comidas.
-- comida_nueva NO es cron: enganche edge->edge en crear-comida.
--
-- AVISO OPERATIVO (igual que 0008): en PROD el cron se aplica a mano para no
-- colisionar con jobs vivos. Requiere el secreto 'service_role_key' en el Vault
-- (ya existe, usado por el cron de generar-otp-comidas).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('enviar-push-recordatorio'); exception when others then null; end $$;

select cron.schedule('enviar-push-recordatorio', '0 22 * * 1-5', $$
  select net.http_post(
    url := 'https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"recordatorio"}'::jsonb
  );
$$);
