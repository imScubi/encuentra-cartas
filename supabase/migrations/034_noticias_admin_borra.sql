-- ============================================================
-- Permite que un admin (perfiles.es_admin = true) borre cualquier
-- anuncio/noticia (pendiente, programado o ya publicado) — antes solo
-- se podía crear, aprobar/rechazar o actualizar, nunca borrar.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "noticias: admin borra cualquiera" on noticias;
create policy "noticias: admin borra cualquiera" on noticias
  for delete using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
