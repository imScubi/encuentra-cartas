-- ============================================================
-- Permite adjuntar una imagen a un anuncio (admin o tienda).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table noticias add column if not exists imagen_url text;

insert into storage.buckets (id, name, public)
values ('anuncios', 'anuncios', true)
on conflict (id) do nothing;

drop policy if exists "anuncios-imagenes: lectura publica" on storage.objects;
create policy "anuncios-imagenes: lectura publica" on storage.objects
  for select using (bucket_id = 'anuncios');

drop policy if exists "anuncios-imagenes: usuario sube a su carpeta" on storage.objects;
create policy "anuncios-imagenes: usuario sube a su carpeta" on storage.objects
  for insert with check (bucket_id = 'anuncios' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "anuncios-imagenes: usuario actualiza su carpeta" on storage.objects;
create policy "anuncios-imagenes: usuario actualiza su carpeta" on storage.objects
  for update using (bucket_id = 'anuncios' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "anuncios-imagenes: usuario borra su carpeta" on storage.objects;
create policy "anuncios-imagenes: usuario borra su carpeta" on storage.objects
  for delete using (bucket_id = 'anuncios' and (storage.foldername(name))[1] = auth.uid()::text);
