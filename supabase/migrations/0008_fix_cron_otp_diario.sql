-- Alinea el cron con produccion: L-V 9:30 Mazatlan (UTC-7) = 16:30 UTC.
-- La migracion 0005 quedo desactualizada (decia viernes '0 15 * * 5'); en
-- produccion el job ya corre '30 16 * * 1-5'. Esta migracion deja a los
-- entornos NUEVOS en ese mismo estado, con nombre canonico.
--
-- NOTA OPERATIVA: en PRODUCCION el cron ya corre correctamente bajo el nombre
-- legado 'generar-otp-comidas-viernes'. Esta migracion NO se aplica a prod para
-- no tocar el job vivo (evita una ventana de reprogramacion en un job que mueve
-- dinero). Solo reproduce el estado correcto en entornos frescos.
--
-- Idempotente: desprograma cualquier job previo (viejo o nuevo) y reprograma uno.
do $$
begin
  perform cron.unschedule('generar-otp-comidas-viernes');
exception when others then null;  -- no existia; ok
end $$;

do $$
begin
  perform cron.unschedule('generar-otp-comidas-diario');
exception when others then null;
end $$;

select cron.schedule(
  'generar-otp-comidas-diario',
  '30 16 * * 1-5',
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
