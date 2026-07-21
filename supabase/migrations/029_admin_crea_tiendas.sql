-- ============================================================
-- Permite que un admin (perfiles.es_admin = true) cree tiendas
-- nuevas directamente desde el panel de administración (antes solo
-- se podían borrar o actualizar, nunca crear, desde la web).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "tiendas: admin crea" on tiendas;
create policy "tiendas: admin crea" on tiendas
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
