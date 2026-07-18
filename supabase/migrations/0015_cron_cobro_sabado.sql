-- Extiende el cobro de comidas a SÁBADO (antes solo lunes a viernes).
-- El OTP se llavea por día (semana = fecha de hoy en Mazatlán), así que un código
-- del viernes NO sirve el sábado: hace falta generar uno nuevo ese día. Por eso
-- ambos crons se reprograman de '1-5' (L-V) a '1-6' (L-S):
--   * generar-otp-comidas: reparte por WhatsApp el código del día.
--   * enviar-push-recordatorio: recordatorio a los choferes con suscripción.
--
-- AVISO OPERATIVO (igual que 0008 y 0013): en PRODUCCIÓN los crons se aplican a
-- mano para no colisionar con jobs vivos que mueven dinero. Esta migración deja el
-- estado correcto en entornos NUEVOS; para prod hay que correr el mismo reschedule
-- a mano (el job de OTP vive bajo el nombre legado 'generar-otp-comidas-viernes').
-- Idempotente: desprograma cualquier nombre previo y reprograma uno solo.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Generación/reparto del OTP del día: L-V -> L-S (9:30 Mazatlán = 16:30 UTC).
do $$ begin perform cron.unschedule('generar-otp-comidas-viernes'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('generar-otp-comidas-diario'); exception when others then null; end $$;

select cron.schedule(
  'generar-otp-comidas-diario',
  '30 16 * * 1-6',
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

-- 2) Recordatorio push: L-V -> L-S (15:00 Mazatlán = 22:00 UTC).
do $$ begin perform cron.unschedule('enviar-push-recordatorio'); exception when others then null; end $$;

select cron.schedule('enviar-push-recordatorio', '0 22 * * 1-6', $$
  select net.http_post(
    url := 'https://uqncsqstpcynjxnjhrqu.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"recordatorio"}'::jsonb
  );
$$);
