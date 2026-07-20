-- ============================================================
-- Permite que una alerta de Wishlist Premium apunte a una carta o
-- producto sellado exacto (igual que al publicar en Mi Tienda / Mercado),
-- en vez de solo un texto libre.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table alertas add column if not exists tipo text not null default 'carta' check (tipo in ('carta', 'sellado'));
alter table alertas add column if not exists card_api_id text;
alter table alertas add column if not exists imagen_url text;
alter table alertas add column if not exists precio_ref_mxn numeric;
