-- ============================================================
-- Filtro por zona y "tienda más cercana" en el Directorio (Zafiro+).
-- Asegura que tiendas tenga lat/lng (usadas también en el mapa del
-- perfil de tienda) para poder calcular distancia con la ubicación
-- del usuario.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table tiendas add column if not exists lat double precision;
alter table tiendas add column if not exists lng double precision;
