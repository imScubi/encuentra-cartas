-- ============================================================
-- Reportar publicaciones o perfiles (usuarios/tiendas) sospechosos.
-- Cualquiera con sesión puede reportar; solo el admin puede leerlos y
-- marcarlos como revisados o descartados (mismo patrón que errores_app).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists reportes (
  id uuid primary key default gen_random_uuid(),
  reportante_perfil_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('perfil', 'publicacion')),
  tabla_objetivo text not null,
  objetivo_id uuid not null,
  objetivo_perfil_id uuid references perfiles(id) on delete set null,
  objetivo_nombre text,
  motivo text not null,
  detalle text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisado', 'descartado')),
  created_at timestamptz not null default now()
);

alter table reportes enable row level security;

drop policy if exists "reportes: cualquiera con sesion reporta lo suyo" on reportes;
create policy "reportes: cualquiera con sesion reporta lo suyo" on reportes
  for insert with check (reportante_perfil_id = auth.uid());

drop policy if exists "reportes: admin lee" on reportes;
create policy "reportes: admin lee" on reportes
  for select using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "reportes: admin actualiza" on reportes;
create policy "reportes: admin actualiza" on reportes
  for update using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
