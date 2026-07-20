-- ============================================================
-- Renovación automática de planes (suscripciones recurrentes de
-- Mercado Pago, vía "Preapproval").
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists mp_preapproval_id text;
