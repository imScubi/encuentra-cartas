-- ============================================================
-- Foto de perfil: columna en perfiles + bucket de Storage para
-- fotos subidas por el usuario (las de Pokémon no se guardan aquí,
-- se referencian directo desde la API pública de PokeAPI).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: lectura publica" on storage.objects;
create policy "avatars: lectura publica" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars: usuario sube su propia foto" on storage.objects;
create policy "avatars: usuario sube su propia foto" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: usuario actualiza su propia foto" on storage.objects;
create policy "avatars: usuario actualiza su propia foto" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: usuario borra su propia foto" on storage.objects;
create policy "avatars: usuario borra su propia foto" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
