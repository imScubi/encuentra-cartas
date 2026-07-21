-- ============================================================
-- Ventas confirmadas + reseñas de 1 a 5 estrellas.
--
-- Flujo: el vendedor marca una publicación como "vendida" y elige al
-- comprador (queda como venta "pendiente"); el comprador la confirma o
-- la rechaza. Solo cuando queda "confirmada" cuenta para el contador de
-- ventas completadas de ambos, y solo entonces se pueden calificar
-- mutuamente (una reseña por venta y por persona). Las reseñas de un
-- perfil NUNCA se pueden ocultar (no forman parte de perfiles.visibilidad).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists ventas (
  id uuid primary key default gen_random_uuid(),
  vendedor_perfil_id uuid not null references perfiles(id) on delete cascade,
  comprador_perfil_id uuid not null references perfiles(id) on delete cascade,
  tabla_origen text not null,
  listing_id uuid,
  descripcion text not null,
  precio numeric,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'rechazada')),
  created_at timestamptz not null default now(),
  confirmada_at timestamptz,
  check (vendedor_perfil_id <> comprador_perfil_id)
);

alter table ventas enable row level security;

drop policy if exists "ventas: participantes ven las suyas" on ventas;
create policy "ventas: participantes ven las suyas" on ventas
  for select using (auth.uid() = vendedor_perfil_id or auth.uid() = comprador_perfil_id);

drop policy if exists "ventas: el vendedor registra la venta" on ventas;
create policy "ventas: el vendedor registra la venta" on ventas
  for insert with check (auth.uid() = vendedor_perfil_id);

drop policy if exists "ventas: el comprador confirma o rechaza" on ventas;
create policy "ventas: el comprador confirma o rechaza" on ventas
  for update using (auth.uid() = comprador_perfil_id);

create table if not exists resenas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  autor_perfil_id uuid not null references perfiles(id) on delete cascade,
  objetivo_perfil_id uuid not null references perfiles(id) on delete cascade,
  estrellas int not null check (estrellas between 1 and 5),
  comentario text,
  created_at timestamptz not null default now(),
  unique (venta_id, autor_perfil_id)
);

alter table resenas enable row level security;

drop policy if exists "resenas: lectura publica" on resenas;
create policy "resenas: lectura publica" on resenas for select using (true);

drop policy if exists "resenas: el autor califica su venta confirmada" on resenas;
create policy "resenas: el autor califica su venta confirmada" on resenas
  for insert with check (
    autor_perfil_id = auth.uid()
    and exists (
      select 1 from ventas v
      where v.id = venta_id
        and v.estado = 'confirmada'
        and (v.vendedor_perfil_id = auth.uid() or v.comprador_perfil_id = auth.uid())
        and objetivo_perfil_id = case when v.vendedor_perfil_id = auth.uid() then v.comprador_perfil_id else v.vendedor_perfil_id end
    )
  );

-- Avisa al comprador que tiene una venta por confirmar.
create or replace function public.notificar_venta_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  vendedor_nombre text;
begin
  select nombre into vendedor_nombre from perfiles where id = NEW.vendedor_perfil_id;
  insert into notificaciones (perfil_id, tipo, titulo, mensaje, url)
  values (NEW.comprador_perfil_id, 'venta', 'Confirma tu compra', coalesce(vendedor_nombre, 'Un vendedor') || ' marcó que te vendió: ' || NEW.descripcion, '/');
  return NEW;
end;
$$;

drop trigger if exists venta_pendiente_notifica on public.ventas;
create trigger venta_pendiente_notifica
after insert on public.ventas
for each row execute function public.notificar_venta_pendiente();

-- Avisa al vendedor cuando el comprador confirma (o rechaza) la venta.
create or replace function public.notificar_venta_resuelta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.estado = 'confirmada' and OLD.estado is distinct from 'confirmada' then
    insert into notificaciones (perfil_id, tipo, titulo, mensaje, url)
    values (NEW.vendedor_perfil_id, 'venta', 'Venta confirmada', 'Tu comprador confirmó: ' || NEW.descripcion || '. Ya puedes calificarlo.', '/');
  elsif NEW.estado = 'rechazada' and OLD.estado is distinct from 'rechazada' then
    insert into notificaciones (perfil_id, tipo, titulo, mensaje, url)
    values (NEW.vendedor_perfil_id, 'venta', 'Venta rechazada', 'Tu comprador dijo que esta venta no ocurrió: ' || NEW.descripcion, '/');
  end if;
  return NEW;
end;
$$;

drop trigger if exists venta_resuelta_notifica on public.ventas;
create trigger venta_resuelta_notifica
after update on public.ventas
for each row execute function public.notificar_venta_resuelta();
