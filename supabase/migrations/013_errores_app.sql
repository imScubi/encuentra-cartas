-- ============================================================
-- Captura de errores de la web: cuando algo falla en el navegador de
-- cualquier usuario, se guarda aquí y se avisa al admin (push + correo),
-- sin repetir el aviso si es el mismo error en menos de una hora.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists errores_app (
  id uuid primary key default gen_random_uuid(),
  mensaje text not null,
  stack text,
  url text,
  perfil_id uuid references perfiles(id) on delete set null,
  notificado boolean not null default false,
  resuelto boolean not null default false,
  created_at timestamptz not null default now()
);

alter table errores_app enable row level security;

drop policy if exists "errores_app: cualquiera reporta" on errores_app;
create policy "errores_app: cualquiera reporta" on errores_app
  for insert with check (true);

drop policy if exists "errores_app: admin lee" on errores_app;
create policy "errores_app: admin lee" on errores_app
  for select using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "errores_app: admin actualiza" on errores_app;
create policy "errores_app: admin actualiza" on errores_app
  for update using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
