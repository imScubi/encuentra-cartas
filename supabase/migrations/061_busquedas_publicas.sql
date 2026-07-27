-- ============================================================
-- Tablón público de "busco esta carta": cualquiera con sesión puede decir
-- qué carta anda buscando, se muestra en un banner/carrusel en Inicio y en
-- un apartado completo, y cualquier otro usuario que la tenga puede
-- contactar directo al que la busca (reusa el chat existente, mensajes.
-- perfil_id/para_perfil_id).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists busquedas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tcg text not null,
  carta text not null,
  set_nombre text,
  card_api_id text,
  imagen_url text,
  notas text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists busquedas_activa_creada_idx on busquedas (activa, created_at desc);

alter table busquedas enable row level security;

drop policy if exists "busquedas: lectura publica" on busquedas;
create policy "busquedas: lectura publica" on busquedas
  for select using (true);

drop policy if exists "busquedas: dueño publica" on busquedas;
create policy "busquedas: dueño publica" on busquedas
  for insert with check (perfil_id = auth.uid());

drop policy if exists "busquedas: dueño edita" on busquedas;
create policy "busquedas: dueño edita" on busquedas
  for update using (perfil_id = auth.uid());

drop policy if exists "busquedas: dueño borra" on busquedas;
create policy "busquedas: dueño borra" on busquedas
  for delete using (perfil_id = auth.uid());
