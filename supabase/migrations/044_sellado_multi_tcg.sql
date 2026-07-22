-- ============================================================
-- Producto sellado para cualquier TCG (antes solo existía para Pokémon).
-- sellado_tienda no tenía columna tcg — se agrega igual que ya la tiene
-- mercado_listings/inventario_tienda, con "pokemon" por default para no
-- romper el producto sellado ya publicado (que hoy sí es todo Pokémon).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table sellado_tienda add column if not exists tcg text not null default 'pokemon';
