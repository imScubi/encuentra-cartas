-- ============================================================
-- Calendario de torneos/eventos: las tiendas publican torneos con su
-- información y ubicación; los usuarios marcan "Me interesa" y reciben
-- un recordatorio (push + correo + en la bandeja) antes del torneo.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists torneos (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  juego text,
  fecha timestamptz not null,
  direccion text,
  lat double precision,
  lng double precision,
  imagen_url text,
  costo numeric,
  created_at timestamptz not null default now()
);

create table if not exists torneo_interes (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneos(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  recordado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (torneo_id, perfil_id)
);

alter table torneos enable row level security;
alter table torneo_interes enable row level security;

drop policy if exists "torneos: lectura publica" on torneos;
create policy "torneos: lectura publica" on torneos
  for select using (true);

drop policy if exists "torneos: tienda crea los suyos" on torneos;
create policy "torneos: tienda crea los suyos" on torneos
  for insert with check (tienda_id in (select id from tiendas where perfil_id = auth.uid()));

drop policy if exists "torneos: tienda actualiza los suyos" on torneos;
create policy "torneos: tienda actualiza los suyos" on torneos
  for update using (tienda_id in (select id from tiendas where perfil_id = auth.uid()));

drop policy if exists "torneos: tienda borra los suyos" on torneos;
create policy "torneos: tienda borra los suyos" on torneos
  for delete using (tienda_id in (select id from tiendas where perfil_id = auth.uid()));

drop policy if exists "torneo_interes: lectura publica" on torneo_interes;
create policy "torneo_interes: lectura publica" on torneo_interes
  for select using (true);

drop policy if exists "torneo_interes: usuario marca interes" on torneo_interes;
create policy "torneo_interes: usuario marca interes" on torneo_interes
  for insert with check (perfil_id = auth.uid());

drop policy if exists "torneo_interes: usuario quita su interes" on torneo_interes;
create policy "torneo_interes: usuario quita su interes" on torneo_interes
  for delete using (perfil_id = auth.uid());
