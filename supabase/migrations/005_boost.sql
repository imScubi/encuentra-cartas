-- ============================================================
-- Sistema de "Boost": pagar por destacar una publicación (carta suelta
-- o producto sellado, de tienda o de vendedor individual) durante 3 o 7
-- días, para que aparezca primero en resultados de búsqueda, Mercado y
-- detalle de tienda.
--
-- Cómo aplicar: copia y pega todo este archivo en
-- Supabase → SQL Editor → New query → Run.
-- ============================================================

alter table mercado_listings add column if not exists destacado_hasta timestamptz;
alter table inventario_tienda add column if not exists destacado_hasta timestamptz;
alter table sellado_tienda add column if not exists destacado_hasta timestamptz;

create table if not exists boosts (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tabla text not null check (tabla in ('mercado_listings', 'inventario_tienda', 'sellado_tienda')),
  listing_id uuid not null,
  dias integer not null check (dias in (3, 7)),
  mp_payment_id text,
  status text not null default 'pending',
  monto numeric,
  destacado_hasta timestamptz,
  created_at timestamptz not null default now()
);

alter table boosts enable row level security;

drop policy if exists "boosts: dueño lee su historial" on boosts;
create policy "boosts: dueño lee su historial" on boosts
  for select using (auth.uid() = perfil_id);

-- Los inserts/updates de boosts los hace SOLO el webhook de Mercado Pago
-- (api/mercadopago/webhook.js) con la Service Role Key, nunca el navegador.
