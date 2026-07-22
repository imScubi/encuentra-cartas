-- ============================================================
-- Tiendas afiliadas + entrega en buzón para publicaciones del Mercado.
--
-- El admin marca ciertas tiendas como "afiliadas" (tiendas.afiliada). Al
-- publicar una carta en "Vender en el Mercado", el vendedor puede marcar
-- que deja la carta en tratos en el buzón de una de esas tiendas afiliadas
-- (mercado_listings.buzon_tienda_id) — solo aparecen las afiliadas como
-- opción, nunca cualquier tienda del directorio.
--
-- perfiles.buzon_default_tienda_id guarda la preferencia del vendedor para
-- que sus publicaciones nuevas ya salgan con ese buzón marcado, sin tener
-- que elegirlo a mano cada vez (se puede seguir cambiando/quitando por
-- publicación individual).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table tiendas add column if not exists afiliada boolean not null default false;

alter table mercado_listings add column if not exists buzon_tienda_id uuid references tiendas(id) on delete set null;

alter table perfiles add column if not exists buzon_default_tienda_id uuid references tiendas(id) on delete set null;
