-- ============================================================
-- Bandeja de notificaciones dentro de la web (campanita): Wishlist,
-- Anuncios, Mensajes (y más adelante recordatorios de torneo).
--
-- perfil_id = null significa "para todos" (se usa para Anuncios).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfiles(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensaje text,
  url text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notificaciones enable row level security;

drop policy if exists "notificaciones: ver las mias o globales" on notificaciones;
create policy "notificaciones: ver las mias o globales" on notificaciones
  for select using (perfil_id = auth.uid() or perfil_id is null);

drop policy if exists "notificaciones: marcar las mias como leidas" on notificaciones;
create policy "notificaciones: marcar las mias como leidas" on notificaciones
  for update using (perfil_id = auth.uid());

-- Cada mensaje nuevo genera una notificación para quien lo recibe.
create or replace function public.notificar_mensaje_nuevo()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into notificaciones (perfil_id, tipo, titulo, mensaje, url)
  values (NEW.para_perfil_id, 'mensaje', 'Nuevo mensaje', NEW.texto, '/');
  return NEW;
end;
$$;

drop trigger if exists mensaje_notifica on public.mensajes;
create trigger mensaje_notifica
after insert on public.mensajes
for each row execute function public.notificar_mensaje_nuevo();
