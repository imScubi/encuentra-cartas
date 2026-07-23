-- ============================================================
-- Insignia "Tienda verificada" con trámite real, distinta del badge
-- "✓ Verificado" que ya trae el plan Zafiro+ (ese es automático solo por
-- pagar; este es un trámite: la tienda solicita, un admin revisa y
-- aprueba o rechaza). Se guarda en una tabla aparte (no una columna en
-- `tiendas`) para no necesitar una función serverless nueva ni un trigger
-- que reviente cada vez que la tabla tiendas gane una columna: la RLS de
-- esta tabla nueva ya evita, por sí sola, que una tienda se apruebe a sí
-- misma.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists verificaciones_tienda (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  solicitada_por uuid not null references perfiles(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  nota text,
  resuelta_por uuid references perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resuelta_at timestamptz
);

alter table verificaciones_tienda enable row level security;

-- Lectura pública: para poder mostrar el badge en cualquier tarjeta de
-- tienda (Mercado, Directorio, perfil), no solo a la propia tienda -- mismo
-- criterio que destellos_movimientos (gamificación/estado público, no dato
-- sensible).
drop policy if exists "verif_tienda: lectura publica" on verificaciones_tienda;
create policy "verif_tienda: lectura publica" on verificaciones_tienda
  for select using (true);

-- Solicitar: solo el dueño de esa tienda, y solo puede insertar en estado
-- 'pendiente' -- nunca 'aprobada'/'rechazada' directamente, esos los pone
-- el trigger de abajo al resolver.
drop policy if exists "verif_tienda: dueno solicita" on verificaciones_tienda;
create policy "verif_tienda: dueno solicita" on verificaciones_tienda
  for insert with check (
    estado = 'pendiente'
    and solicitada_por = auth.uid()
    and exists (select 1 from tiendas where id = tienda_id and perfil_id = auth.uid())
  );

-- Resolver (aprobar/rechazar): solo un admin.
drop policy if exists "verif_tienda: admin resuelve" on verificaciones_tienda;
create policy "verif_tienda: admin resuelve" on verificaciones_tienda
  for update using (
    exists (select 1 from perfiles where id = auth.uid() and es_admin = true)
  );

-- Sella resuelta_at y resuelta_por automáticamente al pasar de 'pendiente' a
-- 'aprobada'/'rechazada' -- así el admin no tiene que mandar esos campos a
-- mano desde el navegador.
create or replace function public.sellar_resolucion_verificacion_tienda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.estado <> 'pendiente' and OLD.estado = 'pendiente' then
    NEW.resuelta_at := now();
    NEW.resuelta_por := auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists verificaciones_tienda_sellar on verificaciones_tienda;
create trigger verificaciones_tienda_sellar
before update on verificaciones_tienda
for each row execute function public.sellar_resolucion_verificacion_tienda();
