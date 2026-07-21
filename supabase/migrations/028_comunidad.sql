-- ============================================================
-- Feed simple de la comunidad: fotos de pulls, aperturas de sobres,
-- logros. Cualquiera con sesión puede publicar; el feed es público
-- (de lectura) para todos, con o sin sesión. Reacciones simples tipo
-- "me gusta" (una por persona por publicación).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists publicaciones_comunidad (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  imagen_url text not null,
  texto text,
  tipo text not null default 'otro' check (tipo in ('pull', 'apertura', 'logro', 'otro')),
  created_at timestamptz not null default now()
);

alter table publicaciones_comunidad enable row level security;

drop policy if exists "comunidad: lectura publica" on publicaciones_comunidad;
create policy "comunidad: lectura publica" on publicaciones_comunidad
  for select using (true);

drop policy if exists "comunidad: publica lo suyo" on publicaciones_comunidad;
create policy "comunidad: publica lo suyo" on publicaciones_comunidad
  for insert with check (perfil_id = auth.uid());

drop policy if exists "comunidad: borra lo suyo" on publicaciones_comunidad;
create policy "comunidad: borra lo suyo" on publicaciones_comunidad
  for delete using (perfil_id = auth.uid());

drop policy if exists "comunidad: admin borra cualquiera" on publicaciones_comunidad;
create policy "comunidad: admin borra cualquiera" on publicaciones_comunidad
  for delete using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

create table if not exists comunidad_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references publicaciones_comunidad(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, perfil_id)
);

alter table comunidad_likes enable row level security;

drop policy if exists "comunidad_likes: lectura publica" on comunidad_likes;
create policy "comunidad_likes: lectura publica" on comunidad_likes
  for select using (true);

drop policy if exists "comunidad_likes: da like con su cuenta" on comunidad_likes;
create policy "comunidad_likes: da like con su cuenta" on comunidad_likes
  for insert with check (perfil_id = auth.uid());

drop policy if exists "comunidad_likes: quita su propio like" on comunidad_likes;
create policy "comunidad_likes: quita su propio like" on comunidad_likes
  for delete using (perfil_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('comunidad', 'comunidad', true)
on conflict (id) do nothing;

drop policy if exists "comunidad-fotos: lectura publica" on storage.objects;
create policy "comunidad-fotos: lectura publica" on storage.objects
  for select using (bucket_id = 'comunidad');

drop policy if exists "comunidad-fotos: usuario sube la suya" on storage.objects;
create policy "comunidad-fotos: usuario sube la suya" on storage.objects
  for insert with check (bucket_id = 'comunidad' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "comunidad-fotos: usuario borra la suya" on storage.objects;
create policy "comunidad-fotos: usuario borra la suya" on storage.objects
  for delete using (bucket_id = 'comunidad' and (storage.foldername(name))[1] = auth.uid()::text);
