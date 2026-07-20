-- ============================================================
-- Permite que un admin (perfiles.es_admin = true) borre cualquier
-- tienda, carta, producto sellado o publicación del Mercado — útil
-- para quitar tiendas duplicadas o publicaciones problemáticas sin
-- depender del dueño original.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "tiendas: admin borra cualquiera" on tiendas;
create policy "tiendas: admin borra cualquiera" on tiendas
  for delete using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "tiendas: admin actualiza cualquiera" on tiendas;
create policy "tiendas: admin actualiza cualquiera" on tiendas
  for update using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "inventario_tienda: admin borra cualquiera" on inventario_tienda;
create policy "inventario_tienda: admin borra cualquiera" on inventario_tienda
  for delete using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "sellado_tienda: admin borra cualquiera" on sellado_tienda;
create policy "sellado_tienda: admin borra cualquiera" on sellado_tienda
  for delete using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "mercado_listings: admin borra cualquiera" on mercado_listings;
create policy "mercado_listings: admin borra cualquiera" on mercado_listings
  for delete using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
