-- ============================================================
-- Permite adjuntar VARIAS imágenes a un anuncio (antes solo una,
-- en imagen_url). imagen_url se conserva (guarda la primera, para
-- que cualquier lugar que todavía la lea siga funcionando) y
-- imagenes_urls trae la lista completa para la galería.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table noticias add column if not exists imagenes_urls text[];

update noticias set imagenes_urls = array[imagen_url] where imagenes_urls is null and imagen_url is not null;
