-- Columnas para el módulo de autorización del Lic Fernando.
-- motivo_rechazo: texto opcional que Fernando escribe al rechazar un lote.
-- autorizado_por: nombre de quien autorizó/rechazó (trazabilidad).
-- fecha_autorizacion: timestamp de la decisión.
alter table rnd_reembolsos
  add column if not exists motivo_rechazo     text,
  add column if not exists autorizado_por     text,
  add column if not exists fecha_autorizacion timestamptz;
