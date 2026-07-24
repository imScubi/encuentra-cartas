-- ============================================================
-- Ofertas de intercambio en la publicación de una carta: además de un
-- comentario o una oferta en efectivo (migración 037), un comprador puede
-- proponer intercambiar una o varias cartas propias por la del vendedor
-- (opcionalmente sumando efectivo). Cada carta ofrecida trae el nombre/set
-- elegido en el buscador de catálogo (para mostrar imagen oficial) + una
-- foto real de frente (obligatoria) de la carta física que se está
-- ofreciendo, para que el vendedor sepa qué está viendo de verdad.
--
-- "tipo" distingue las 3 clases de fila en la misma tabla:
--   'comentario'  -- solo texto, sin oferta (comportamiento de siempre)
--   'precio'      -- oferta en efectivo (monto_oferta), como ya existía
--   'intercambio' -- una o más cartas (cartas_ofrecidas) + efectivo_extra opcional
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table publicacion_ofertas add column if not exists tipo text not null default 'comentario'
  check (tipo in ('comentario', 'precio', 'intercambio'));

-- Backfill: las filas que ya existían antes de esta migración no tenían
-- "tipo" -- se clasifican según si ya traían un monto_oferta o no.
update publicacion_ofertas set tipo = 'precio' where tipo = 'comentario' and monto_oferta is not null;

-- Cada elemento: {tcg, carta, set_nombre, card_api_id, imagen_url, foto_real_url}
-- -- imagen_url es la foto oficial del catálogo (referencia visual), foto_real_url
-- es la foto de frente que sí tomó quien ofrece, de la carta física real.
alter table publicacion_ofertas add column if not exists cartas_ofrecidas jsonb;

-- Efectivo que se suma a las cartas ofrecidas en una oferta de intercambio
-- (distinto de monto_oferta, que es una oferta 100% en efectivo sin cartas).
alter table publicacion_ofertas add column if not exists efectivo_extra numeric;
