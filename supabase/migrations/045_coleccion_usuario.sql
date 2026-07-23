-- ============================================================
-- Catálogo de sets por TCG: cada usuario puede marcar una carta como
-- "tengo" o "quiero" mientras navega el catálogo (era > set > cartas).
-- Marcar "quiero" además crea una entrada en wishlist (lo hace el
-- frontend, no un trigger, para reusar la misma validación/deduplicado
-- que ya usa la Wishlist Premium manual).
-- ============================================================

create table if not exists coleccion_usuario (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tcg text not null,
  card_api_id text not null,
  carta text not null,
  set_nombre text,
  imagen_url text,
  estado text not null check (estado in ('tengo', 'quiero')),
  created_at timestamptz not null default now(),
  unique (perfil_id, tcg, card_api_id)
);

alter table coleccion_usuario enable row level security;

drop policy if exists "coleccion_usuario: dueño administra" on coleccion_usuario;
create policy "coleccion_usuario: dueño administra" on coleccion_usuario
  for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
