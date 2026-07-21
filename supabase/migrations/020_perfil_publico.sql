-- ============================================================
-- Perfil más personalizable: hasta 3 Pokémon favoritos (que tienen
-- prioridad en la vitrina de inicio) y control de qué secciones se
-- muestran en el perfil público de cada usuario.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists pokemon_favoritos text[];
alter table perfiles add column if not exists visibilidad jsonb not null default '{"publicaciones": true, "wishlist": true, "favoritos": true, "carpetas": true}'::jsonb;
