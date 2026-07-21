-- ============================================================
-- Idioma de la carta (Inglés/Español/Japonés), obligatorio al publicar
-- una carta suelta, para que quien compra sepa en qué idioma está sin
-- tener que preguntar. inventario_tienda ya tenía esta columna (el
-- código siempre mandaba "EN" fijo, sin que el vendedor pudiera
-- elegir); mercado_listings no la tenía.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table inventario_tienda add column if not exists idioma text not null default 'EN';
alter table mercado_listings add column if not exists idioma text not null default 'EN';

do $$ begin
  alter table inventario_tienda add constraint inventario_tienda_idioma_check check (idioma in ('EN','ES','JP'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table mercado_listings add constraint mercado_listings_idioma_check check (idioma in ('EN','ES','JP'));
exception when duplicate_object then null;
end $$;
