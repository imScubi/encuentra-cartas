-- ============================================================
-- Sistema de suscripciones / rangos: Pokeball, Super Ball,
-- Ultra Ball, Master Ball, Ente Ball.
--
-- Cómo aplicar: copia y pega todo este archivo en
-- Supabase → SQL Editor → New query → Run.
-- Es seguro volver a correrlo (usa IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Rango/plan en perfiles ----------

alter table perfiles
  add column if not exists plan text not null default 'pokeball';

alter table perfiles
  drop constraint if exists perfiles_plan_check;
alter table perfiles
  add constraint perfiles_plan_check
  check (plan in ('pokeball', 'superball', 'ultraball', 'masterball', 'enteball'));

-- Ente Ball es exclusivo de cuentas de tienda
alter table perfiles
  drop constraint if exists perfiles_enteball_solo_tienda;
alter table perfiles
  add constraint perfiles_enteball_solo_tienda
  check (plan <> 'enteball' or tipo = 'tienda');

alter table perfiles add column if not exists plan_vence timestamptz;
alter table perfiles add column if not exists instagram text;
alter table perfiles add column if not exists google_maps_url text;

-- ---------- 2. Wishlist premium (alertas de precio) ----------

create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tcg text not null default 'pokemon',
  carta text not null,
  precio_max numeric,
  zona text,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

alter table alertas enable row level security;

drop policy if exists "alertas: dueño lee" on alertas;
create policy "alertas: dueño lee" on alertas
  for select using (auth.uid() = perfil_id);

drop policy if exists "alertas: dueño escribe" on alertas;
create policy "alertas: dueño escribe" on alertas
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "alertas: dueño actualiza" on alertas;
create policy "alertas: dueño actualiza" on alertas
  for update using (auth.uid() = perfil_id);

drop policy if exists "alertas: dueño borra" on alertas;
create policy "alertas: dueño borra" on alertas
  for delete using (auth.uid() = perfil_id);

-- ---------- 3. Suscripciones push (notificaciones reales) ----------

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

drop policy if exists "push: dueño lee" on push_subscriptions;
create policy "push: dueño lee" on push_subscriptions
  for select using (auth.uid() = perfil_id);

drop policy if exists "push: dueño se suscribe" on push_subscriptions;
create policy "push: dueño se suscribe" on push_subscriptions
  for insert with check (auth.uid() = perfil_id);

drop policy if exists "push: dueño borra" on push_subscriptions;
create policy "push: dueño borra" on push_subscriptions
  for delete using (auth.uid() = perfil_id);

-- Nota: la función serverless que envía los pushes (api/alertas/verificar.js)
-- usa la Service Role Key, que no pasa por RLS, así que no necesita política propia.

-- ---------- 4. Registro de pagos (Mercado Pago) ----------

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  plan text not null check (plan in ('superball', 'ultraball', 'masterball', 'enteball')),
  mp_preference_id text,
  mp_payment_id text,
  status text not null default 'pending',
  monto numeric,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  created_at timestamptz not null default now()
);

alter table pagos enable row level security;

drop policy if exists "pagos: dueño lee su historial" on pagos;
create policy "pagos: dueño lee su historial" on pagos
  for select using (auth.uid() = perfil_id);

-- Los inserts/updates de pagos los hace SOLO el webhook de Mercado Pago
-- (api/mercadopago/webhook.js) con la Service Role Key, nunca el navegador.

-- ---------- 5. (Opcional) promo de lanzamiento ----------
-- Da Master Ball gratis por 90 días a todas las cuentas de tienda que ya
-- existan hoy, para poblar la app rápido. Corre esto UNA sola vez si quieres
-- aplicar la promo retroactivamente a tiendas ya registradas:
--
-- update perfiles set plan = 'masterball', plan_vence = now() + interval '90 days'
-- where tipo = 'tienda' and plan = 'pokeball';
