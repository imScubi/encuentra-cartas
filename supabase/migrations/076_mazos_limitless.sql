-- ============================================================
-- Integración con Limitless TCG en "Armar Mazo": marcar qué cartas de un
-- mazo ya tienes, y de dónde viene un mazo importado (torneo/jugador de
-- Limitless), para no reimportarlo por accidente.
--
-- tengo: de uso general (cualquier mazo, no solo los importados) -- una
-- carta que agregaste a mano también se puede marcar.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mazo_cartas add column if not exists tengo boolean not null default false;

alter table mazos add column if not exists limitless_tournament_id text;
alter table mazos add column if not exists limitless_player text;
