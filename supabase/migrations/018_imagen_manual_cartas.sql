-- ============================================================
-- Bucket de Storage para que un vendedor (tienda o individual) suba su
-- propia foto de una carta/producto cuando el catálogo oficial (TCGdex)
-- no tiene imagen — pasa con cartas de arte especial, promos, etc.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('cartas', 'cartas', true)
on conflict (id) do nothing;

drop policy if exists "cartas: lectura publica" on storage.objects;
create policy "cartas: lectura publica" on storage.objects
  for select using (bucket_id = 'cartas');

drop policy if exists "cartas: usuario sube a su carpeta" on storage.objects;
create policy "cartas: usuario sube a su carpeta" on storage.objects
  for insert with check (bucket_id = 'cartas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cartas: usuario actualiza su carpeta" on storage.objects;
create policy "cartas: usuario actualiza su carpeta" on storage.objects
  for update using (bucket_id = 'cartas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cartas: usuario borra su carpeta" on storage.objects;
create policy "cartas: usuario borra su carpeta" on storage.objects
  for delete using (bucket_id = 'cartas' and (storage.foldername(name))[1] = auth.uid()::text);
