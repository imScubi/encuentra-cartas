-- ============================================================
-- Personalización del perfil público (Zafiro en adelante):
-- biografía, color de acento propio, y el orden en que se muestran
-- las secciones "En venta" / Wishlist / Carpetas.
--
-- El modo día/noche y los temas por tipo de Pokémon NO usan la base
-- de datos — se guardan solo en el dispositivo (localStorage), así
-- que no requieren columnas nuevas.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists bio text;
alter table perfiles add column if not exists color_acento text;
alter table perfiles add column if not exists orden_secciones jsonb;
