-- ============================================================
-- Guarda de dónde salió el "precio de referencia" que se prellena al
-- publicar (ej. "TCGplayer", "Cardmarket", "eBay") para poder mostrárselo
-- a quien compra/vende junto al precio, en vez de un número sin origen.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mercado_listings add column if not exists precio_ref_fuente text;
alter table inventario_tienda add column if not exists precio_ref_fuente text;
alter table sellado_tienda add column if not exists precio_ref_fuente text;
alter table alertas add column if not exists precio_ref_fuente text;
