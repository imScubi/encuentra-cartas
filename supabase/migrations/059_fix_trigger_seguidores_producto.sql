-- ============================================================
-- Arregla un bug real desde la migración 027: el trigger que avisa a los
-- seguidores de una tienda cuando publica algo nuevo hacía
-- `coalesce(NEW.carta, NEW.producto)` para CUALQUIER tabla que no fuera
-- mercado_listings -- pero inventario_tienda (cartas sueltas de una
-- tienda) tiene columna `carta`, NO `producto` (esa solo existe en
-- sellado_tienda). Postgres truena con "record "new" has no field
-- "producto"" en cuanto alguien intenta agregar una carta suelta a su
-- tienda, porque el trigger revienta la transacción completa (AFTER
-- INSERT). Se separa explícitamente por tabla: mercado_listings e
-- inventario_tienda usan `carta`, sellado_tienda usa `producto`.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

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
  else
    select perfil_id into el_perfil_id from tiendas where id = NEW.tienda_id;
  end if;

  if TG_TABLE_NAME = 'sellado_tienda' then
    titulo_item := NEW.producto;
  else
    titulo_item := NEW.carta;
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
