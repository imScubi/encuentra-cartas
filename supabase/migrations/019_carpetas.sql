-- ============================================================
-- "Carpetas": álbumes de fotos de una tienda o vendedor individual.
-- Cada carpeta puede tener varias fotos (páginas de un álbum físico);
-- las cartas detectadas en esas fotos (por IA) o agregadas después se
-- etiquetan con carpeta_id para poder agruparlas.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists carpetas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tienda_id uuid references tiendas(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

create table if not exists carpeta_fotos (
  id uuid primary key default gen_random_uuid(),
  carpeta_id uuid not null references carpetas(id) on delete cascade,
  imagen_url text not null,
  created_at timestamptz not null default now()
);

alter table inventario_tienda add column if not exists carpeta_id uuid references carpetas(id) on delete set null;
alter table mercado_listings add column if not exists carpeta_id uuid references carpetas(id) on delete set null;

alter table carpetas enable row level security;
alter table carpeta_fotos enable row level security;

drop policy if exists "carpetas: dueno ve las suyas" on carpetas;
create policy "carpetas: dueno ve las suyas" on carpetas
  for select using (perfil_id = auth.uid());

drop policy if exists "carpetas: dueno crea las suyas" on carpetas;
create policy "carpetas: dueno crea las suyas" on carpetas
  for insert with check (perfil_id = auth.uid());

drop policy if exists "carpetas: dueno actualiza las suyas" on carpetas;
create policy "carpetas: dueno actualiza las suyas" on carpetas
  for update using (perfil_id = auth.uid());

drop policy if exists "carpetas: dueno borra las suyas" on carpetas;
create policy "carpetas: dueno borra las suyas" on carpetas
  for delete using (perfil_id = auth.uid());

drop policy if exists "carpeta_fotos: dueno ve las suyas" on carpeta_fotos;
create policy "carpeta_fotos: dueno ve las suyas" on carpeta_fotos
  for select using (carpeta_id in (select id from carpetas where perfil_id = auth.uid()));

drop policy if exists "carpeta_fotos: dueno agrega a las suyas" on carpeta_fotos;
create policy "carpeta_fotos: dueno agrega a las suyas" on carpeta_fotos
  for insert with check (carpeta_id in (select id from carpetas where perfil_id = auth.uid()));

drop policy if exists "carpeta_fotos: dueno borra las suyas" on carpeta_fotos;
create policy "carpeta_fotos: dueno borra las suyas" on carpeta_fotos
  for delete using (carpeta_id in (select id from carpetas where perfil_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('carpetas', 'carpetas', true)
on conflict (id) do nothing;

drop policy if exists "carpetas-fotos: lectura publica" on storage.objects;
create policy "carpetas-fotos: lectura publica" on storage.objects
  for select using (bucket_id = 'carpetas');

drop policy if exists "carpetas-fotos: usuario sube a su carpeta" on storage.objects;
create policy "carpetas-fotos: usuario sube a su carpeta" on storage.objects
  for insert with check (bucket_id = 'carpetas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "carpetas-fotos: usuario borra su carpeta" on storage.objects;
create policy "carpetas-fotos: usuario borra su carpeta" on storage.objects
  for delete using (bucket_id = 'carpetas' and (storage.foldername(name))[1] = auth.uid()::text);
