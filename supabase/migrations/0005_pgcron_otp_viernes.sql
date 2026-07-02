-- Instala pg_cron y programa la generación de OTP los viernes.
-- pg_net ya está instalado (para el HTTP POST a la Edge Function).
-- El service_role_key se lee de Vault por nombre (nunca en claro en el SQL).
create extension if not exists pg_cron;

select cron.schedule(
  'generar-otp-comidas-viernes',
  '0 15 * * 5',  -- viernes 15:00 UTC = 08:00 Mazatlán (UTC-7)
  $$
  select net.http_post(
    url := 'https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/generar-otp-comidas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
