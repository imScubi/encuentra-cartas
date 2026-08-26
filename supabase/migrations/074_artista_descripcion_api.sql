-- ============================================================
-- Artista/ilustrador y descripción (texto de reglas de la carta, o qué
-- trae el producto sellado) de apitcg.com -- viajan en attributes.Artist
-- y attributes.Description del mismo Product (carta o sellado), pero hoy
-- se descartan al leer la respuesta.
--
-- descripcion_api: texto original (en inglés, tal como lo da apitcg.com,
--   ya limpio de HTML).
-- descripcion_api_es: traducción cacheada al pedirla la primera vez
--   (botón "Traducir" en la vista pública) -- así no se vuelve a gastar
--   cuota de traducción en cada visita.
--
-- artista queda siempre null en sellado_tienda (sellado no tiene
-- ilustrador) -- se deja la columna por simetría con las otras dos
-- tablas y para que el código compartido no tenga que distinguir.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mercado_listings add column if not exists artista text;
alter table mercado_listings add column if not exists descripcion_api text;
alter table mercado_listings add column if not exists descripcion_api_es text;

alter table inventario_tienda add column if not exists artista text;
alter table inventario_tienda add column if not exists descripcion_api text;
alter table inventario_tienda add column if not exists descripcion_api_es text;

alter table sellado_tienda add column if not exists artista text;
alter table sellado_tienda add column if not exists descripcion_api text;
alter table sellado_tienda add column if not exists descripcion_api_es text;
