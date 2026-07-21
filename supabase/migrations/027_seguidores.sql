-- ============================================================
-- Seguir tiendas o vendedores: cuando alguien que sigues publica una
-- carta o producto nuevo, te llega una notificación. El número de
-- seguidores es público (se ve en el perfil); a quién sigues cada
-- quien solo lo puede leer/editar esa misma persona.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists seguidores (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  seguido_perfil_id uuid not null references perfiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (perfil_id, seguido_perfil_id),
  check (perfil_id <> seguido_perfil_id)
);

alter table seguidores enable row level security;

drop policy if exists "seguidores: lectura publica" on seguidores;
create policy "seguidores: lectura publica" on seguidores
  for select using (true);

drop policy if exists "seguidores: seguir" on seguidores;
create policy "seguidores: seguir" on seguidores
  for insert with check (perfil_id = auth.uid());

drop policy if exists "seguidores: dejar de seguir" on seguidores;
create policy "seguidores: dejar de seguir" on seguidores
  for delete using (perfil_id = auth.uid());

-- Avisa a los seguidores de un vendedor cuando publica algo nuevo.
create or replace function public.notificar_nueva_publicacion_seguidores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  el_perfil_id uuid;
  nombre_vendedor text;
  titulo_item text;
begin
  if TG_TABLE_NAME = 'mercado_listings' then
    el_perfil_id := NEW.perfil_id;
    titulo_item := NEW.carta;
  else
    select perfil_id into el_perfil_id from tiendas where id = NEW.tienda_id;
    titulo_item := coalesce(NEW.carta, NEW.producto);
  end if;

  if el_perfil_id is null then
    return NEW;
  end if;

  select nombre into nombre_vendedor from perfiles where id = el_perfil_id;

  insert into notificaciones (perfil_id, tipo, titulo, mensaje, url)
  select s.perfil_id, 'seguido_publico', coalesce(nombre_vendedor, 'Alguien que sigues') || ' publicó algo nuevo', titulo_item, '/'
  from seguidores s
  where s.seguido_perfil_id = el_perfil_id;

  return NEW;
end;
$$;

drop trigger if exists mercado_listings_notif_seguidores on public.mercado_listings;
create trigger mercado_listings_notif_seguidores
after insert on public.mercado_listings
for each row execute function public.notificar_nueva_publicacion_seguidores();

drop trigger if exists inventario_tienda_notif_seguidores on public.inventario_tienda;
create trigger inventario_tienda_notif_seguidores
after insert on public.inventario_tienda
for each row execute function public.notificar_nueva_publicacion_seguidores();

drop trigger if exists sellado_tienda_notif_seguidores on public.sellado_tienda;
create trigger sellado_tienda_notif_seguidores
after insert on public.sellado_tienda
for each row execute function public.notificar_nueva_publicacion_seguidores();
