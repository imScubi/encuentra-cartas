-- ============================================================
-- Pestaña "Accesorios" en el Mercado (playmats, deckbox, micas, etc.):
-- se agregan como un tercer "tipo" de mercado_listings (junto a carta y
-- sellado) en vez de una tabla nueva, para reusar tal cual el límite de
-- plan, el chat, el carrito, el boost y la moderación de admin que ya
-- existen para esa tabla.
--
-- etiquetas / etiquetas_texto: para que el buscador principal encuentre un
-- accesorio por palabra clave (ej. "sylveon") aunque no sea una carta.
-- etiquetas (text[]) es para mostrar/editar las etiquetas como chips;
-- etiquetas_texto (las mismas, en minúsculas y separadas por espacio) es
-- la que de verdad se busca con ILIKE — PostgREST no permite un ILIKE
-- parcial contra elementos de un array directo desde la URL, así que se
-- mantiene esta copia en texto plano en paralelo (el cliente llena ambas
-- al mismo tiempo).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

-- Red de seguridad por si ya existe con el nombre "de convención" (Postgres
-- nombra así solo un check inline tipo "columna type check (...)").
alter table mercado_listings drop constraint if exists mercado_listings_tipo_check;

-- Por si el check de verdad tiene otro nombre (o hay más de uno que
-- mencione "tipo"): los busca todos y los tira, uno por uno.
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.mercado_listings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table mercado_listings drop constraint %I', con.conname);
  end loop;
end $$;

alter table mercado_listings add constraint mercado_listings_tipo_check check (tipo in ('carta', 'sellado', 'accesorio'));

alter table mercado_listings add column if not exists descripcion text;
alter table mercado_listings add column if not exists etiquetas text[] default '{}';
alter table mercado_listings add column if not exists etiquetas_texto text;

-- "Marcar vendida" en un accesorio inserta en ventas con tipo='accesorio' —
-- amplía el mismo check que migración 043 le puso a esa columna.
alter table ventas drop constraint if exists ventas_tipo_check;

do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.ventas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table ventas drop constraint %I', con.conname);
  end loop;
end $$;

alter table ventas add constraint ventas_tipo_check check (tipo in ('carta', 'sellado', 'accesorio'));
