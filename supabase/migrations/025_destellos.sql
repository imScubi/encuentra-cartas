-- ============================================================
-- Sistema de recompensas "Destellos ✨": puntos que se ganan con
-- actividad real (ventas confirmadas, reseñas, publicaciones, perfil
-- completo) y se canjean por Boost gratis. Es un ledger (histórico de
-- movimientos, positivos y negativos) — el saldo siempre se calcula
-- sumando la tabla, nunca se guarda un total aparte para no
-- desincronizarse.
--
-- El cliente (navegador) NUNCA puede insertar movimientos directamente
-- — todo se otorga por triggers (al confirmarse una venta, al dejar
-- una reseña, al publicar, al completar el perfil) o por el endpoint
-- de canje (api/recompensas/canjear.js, con la service role key), así
-- no se puede inventar saldo desde el navegador.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists destellos_movimientos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  cantidad integer not null,
  motivo text not null,
  referencia_tabla text,
  referencia_id uuid,
  created_at timestamptz not null default now()
);

alter table destellos_movimientos enable row level security;

-- Lectura pública (no solo del dueño): el nivel/insignia de Destellos se
-- muestra en el perfil público de cualquiera, así que hace falta poder
-- sumar los movimientos de OTRA persona, no solo los propios. Es
-- información de gamificación, no sensible (mismo criterio que las
-- reseñas, que también son públicas).
drop policy if exists "destellos: cada quien ve los suyos" on destellos_movimientos;
drop policy if exists "destellos: lectura publica" on destellos_movimientos;
create policy "destellos: lectura publica" on destellos_movimientos
  for select using (true);

-- Venta confirmada: +20 al vendedor, +10 al comprador, +25 de bono la
-- primera vez que cada uno completa una venta/compra.
create or replace function public.otorgar_destellos_venta_confirmada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ventas_previas_vendedor int;
  ventas_previas_comprador int;
begin
  if NEW.estado = 'confirmada' and OLD.estado is distinct from 'confirmada' then
    insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
    values (NEW.vendedor_perfil_id, 20, 'venta_confirmada_vendedor', 'ventas', NEW.id);
    insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
    values (NEW.comprador_perfil_id, 10, 'venta_confirmada_comprador', 'ventas', NEW.id);

    select count(*) into ventas_previas_vendedor from ventas
      where vendedor_perfil_id = NEW.vendedor_perfil_id and estado = 'confirmada' and id <> NEW.id;
    if ventas_previas_vendedor = 0 then
      insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
      values (NEW.vendedor_perfil_id, 25, 'primera_venta', 'ventas', NEW.id);
    end if;

    select count(*) into ventas_previas_comprador from ventas
      where comprador_perfil_id = NEW.comprador_perfil_id and estado = 'confirmada' and id <> NEW.id;
    if ventas_previas_comprador = 0 then
      insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
      values (NEW.comprador_perfil_id, 25, 'primera_compra', 'ventas', NEW.id);
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists venta_confirmada_destellos on public.ventas;
create trigger venta_confirmada_destellos
after update on public.ventas
for each row execute function public.otorgar_destellos_venta_confirmada();

-- Reseña: +5 a quien la escribe, +10 extra a quien recibe 5 estrellas.
create or replace function public.otorgar_destellos_resena()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
  values (NEW.autor_perfil_id, 5, 'resena_dejada', 'resenas', NEW.id);
  if NEW.estrellas = 5 then
    insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
    values (NEW.objetivo_perfil_id, 10, 'resena_5_estrellas', 'resenas', NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists resena_destellos on public.resenas;
create trigger resena_destellos
after insert on public.resenas
for each row execute function public.otorgar_destellos_resena();

-- Publicar carta/producto: +2, con tope de 10 publicaciones (20 puntos) por
-- día para que no se pueda ganar puntos infinitos solo publicando spam.
create or replace function public.otorgar_destellos_publicacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  el_perfil_id uuid;
  publicadas_hoy int;
begin
  if TG_TABLE_NAME = 'mercado_listings' then
    el_perfil_id := NEW.perfil_id;
  else
    select perfil_id into el_perfil_id from tiendas where id = NEW.tienda_id;
  end if;

  if el_perfil_id is null then
    return NEW;
  end if;

  select count(*) into publicadas_hoy
  from destellos_movimientos
  where perfil_id = el_perfil_id and motivo = 'publicacion' and created_at >= date_trunc('day', now());

  if publicadas_hoy < 10 then
    insert into destellos_movimientos (perfil_id, cantidad, motivo, referencia_tabla, referencia_id)
    values (el_perfil_id, 2, 'publicacion', TG_TABLE_NAME, NEW.id);
  end if;

  return NEW;
end;
$$;

drop trigger if exists mercado_listings_destellos on public.mercado_listings;
create trigger mercado_listings_destellos
after insert on public.mercado_listings
for each row execute function public.otorgar_destellos_publicacion();

drop trigger if exists inventario_tienda_destellos on public.inventario_tienda;
create trigger inventario_tienda_destellos
after insert on public.inventario_tienda
for each row execute function public.otorgar_destellos_publicacion();

drop trigger if exists sellado_tienda_destellos on public.sellado_tienda;
create trigger sellado_tienda_destellos
after insert on public.sellado_tienda
for each row execute function public.otorgar_destellos_publicacion();

-- Perfil completo (foto + al menos 1 Pokémon favorito + al menos una red o
-- WhatsApp): +15 una sola vez.
create or replace function public.otorgar_destellos_perfil_completo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ya_tiene boolean;
begin
  if NEW.avatar_url is not null
     and coalesce(array_length(NEW.pokemon_favoritos, 1), 0) > 0
     and (NEW.whatsapp is not null or NEW.facebook is not null or NEW.instagram is not null) then
    select exists(select 1 from destellos_movimientos where perfil_id = NEW.id and motivo = 'perfil_completo') into ya_tiene;
    if not ya_tiene then
      insert into destellos_movimientos (perfil_id, cantidad, motivo) values (NEW.id, 15, 'perfil_completo');
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists perfil_completo_destellos on public.perfiles;
create trigger perfil_completo_destellos
after update on public.perfiles
for each row execute function public.otorgar_destellos_perfil_completo();
