-- ============================================================
-- Deck Builder visual: varios mazos por usuario, cada uno con
-- nombre y etiquetas propias, y cartas con cantidad. Privado
-- (solo el dueño del perfil puede ver/editar sus mazos).
-- Disponible desde Amatista en adelante (ver PLAN_INFO.mazoBuilder).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists mazos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  nombre text not null,
  etiquetas text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mazo_cartas (
  id uuid primary key default gen_random_uuid(),
  mazo_id uuid not null references mazos(id) on delete cascade,
  nombre text not null,
  set_nombre text,
  card_api_id text,
  imagen_url text,
  cantidad int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists mazo_cartas_mazo_id_idx on mazo_cartas(mazo_id);

alter table mazos enable row level security;
alter table mazo_cartas enable row level security;

drop policy if exists "mazos: dueño lee" on mazos;
create policy "mazos: dueño lee" on mazos
  for select using (perfil_id = auth.uid());

drop policy if exists "mazos: dueño crea" on mazos;
create policy "mazos: dueño crea" on mazos
  for insert with check (perfil_id = auth.uid());

drop policy if exists "mazos: dueño actualiza" on mazos;
create policy "mazos: dueño actualiza" on mazos
  for update using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists "mazos: dueño borra" on mazos;
create policy "mazos: dueño borra" on mazos
  for delete using (perfil_id = auth.uid());

drop policy if exists "mazo_cartas: dueño lee" on mazo_cartas;
create policy "mazo_cartas: dueño lee" on mazo_cartas
  for select using (exists (select 1 from mazos where mazos.id = mazo_cartas.mazo_id and mazos.perfil_id = auth.uid()));

drop policy if exists "mazo_cartas: dueño crea" on mazo_cartas;
create policy "mazo_cartas: dueño crea" on mazo_cartas
  for insert with check (exists (select 1 from mazos where mazos.id = mazo_cartas.mazo_id and mazos.perfil_id = auth.uid()));

drop policy if exists "mazo_cartas: dueño actualiza" on mazo_cartas;
create policy "mazo_cartas: dueño actualiza" on mazo_cartas
  for update using (exists (select 1 from mazos where mazos.id = mazo_cartas.mazo_id and mazos.perfil_id = auth.uid()))
  with check (exists (select 1 from mazos where mazos.id = mazo_cartas.mazo_id and mazos.perfil_id = auth.uid()));

drop policy if exists "mazo_cartas: dueño borra" on mazo_cartas;
create policy "mazo_cartas: dueño borra" on mazo_cartas
  for delete using (exists (select 1 from mazos where mazos.id = mazo_cartas.mazo_id and mazos.perfil_id = auth.uid()));
