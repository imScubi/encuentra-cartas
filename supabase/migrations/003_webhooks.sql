-- ============================================================
-- Database Webhooks para la Wishlist Premium, creados directo por SQL
-- (equivalente a usar la sección "Webhooks" del dashboard, por si no
-- la encuentras en tu versión de la interfaz de Supabase).
--
-- Usa la extensión estándar pg_net (no depende de nada que Supabase
-- tenga que haber preconfigurado por su cuenta).
--
-- IMPORTANTE: antes de correr esto, reemplaza TU-DOMINIO por tu URL
-- real de Vercel en la línea "url :=" de abajo (una sola vez, se usa
-- en los 3 triggers). Luego copia y pega todo el archivo en
-- Supabase → SQL Editor → Run.
-- ============================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.notificar_alerta_wishlist()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://TU-DOMINIO.vercel.app/api/alertas/verificar',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('type', 'INSERT', 'table', TG_TABLE_NAME, 'record', row_to_json(NEW))
  );
  return NEW;
end;
$$;

drop trigger if exists alerta_mercado_listings on public.mercado_listings;
create trigger alerta_mercado_listings
after insert on public.mercado_listings
for each row execute function public.notificar_alerta_wishlist();

drop trigger if exists alerta_inventario_tienda on public.inventario_tienda;
create trigger alerta_inventario_tienda
after insert on public.inventario_tienda
for each row execute function public.notificar_alerta_wishlist();

drop trigger if exists alerta_sellado_tienda on public.sellado_tienda;
create trigger alerta_sellado_tienda
after insert on public.sellado_tienda
for each row execute function public.notificar_alerta_wishlist();
