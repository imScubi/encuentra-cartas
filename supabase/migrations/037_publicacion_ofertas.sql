-- ============================================================
-- Comentarios y ofertas en la publicación de una carta: cualquier usuario
-- con sesión puede dejar un comentario y/o proponer un monto de oferta en
-- la ficha de detalle de una publicación (mercado_listings o
-- inventario_tienda). Es de lectura pública (cualquiera que vea la
-- publicación ve los comentarios), pero solo se puede publicar y borrar
-- el propio.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists publicacion_ofertas (
  id uuid primary key default gen_random_uuid(),
  listing_tabla text not null check (listing_tabla in ('mercado_listings', 'inventario_tienda', 'sellado_tienda')),
  listing_id uuid not null,
  autor_id uuid not null references perfiles(id) on delete cascade,
  texto text,
  monto_oferta numeric,
  created_at timestamptz not null default now()
);

create index if not exists publicacion_ofertas_listing_idx on publicacion_ofertas (listing_tabla, listing_id, created_at);

alter table publicacion_ofertas enable row level security;

drop policy if exists "publicacion_ofertas: lectura publica" on publicacion_ofertas;
create policy "publicacion_ofertas: lectura publica" on publicacion_ofertas
  for select using (true);

drop policy if exists "publicacion_ofertas: cualquiera con sesion publica la suya" on publicacion_ofertas;
create policy "publicacion_ofertas: cualquiera con sesion publica la suya" on publicacion_ofertas
  for insert with check (autor_id = auth.uid());

drop policy if exists "publicacion_ofertas: el autor borra la suya" on publicacion_ofertas;
create policy "publicacion_ofertas: el autor borra la suya" on publicacion_ofertas
  for delete using (autor_id = auth.uid());
