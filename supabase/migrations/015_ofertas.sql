-- ============================================================
-- Ofertas/descuentos: precio_antes (opcional) guarda el precio original.
-- Si precio_antes > precio, la publicación se muestra con una insignia
-- de descuento y el precio anterior tachado.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table inventario_tienda add column if not exists precio_antes numeric;
alter table sellado_tienda add column if not exists precio_antes numeric;
alter table mercado_listings add column if not exists precio_antes numeric;
