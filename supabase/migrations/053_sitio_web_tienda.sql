-- ============================================================
-- Link al sitio web propio de una tienda (ej. su Shopify, su página
-- propia), aparte de Instagram y Google Maps que ya existían. Vive en
-- perfiles (no en tiendas) porque ahí es donde ya viven instagram y
-- google_maps_url -- mismo patrón, mismo gate de plan (Zafiro+).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists sitio_web text;
