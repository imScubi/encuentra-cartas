-- ============================================================
-- Sorteos, segunda vuelta:
--   1) Boletos automáticos por publicar: un sorteo puede marcarse con
--      entrada_por_publicacion = true -- mientras esté activo, cada carta
--      que alguien publique en el Mercado le suma +1 boleto en ese sorteo
--      (lo entra automático con 1 boleto si todavía no participaba).
--   2) destacado: para mostrar el sorteo en grande en la primera pantalla.
--   3) Tiendas afiliadas (cualquier plan, no solo Aurora) también pueden
--      organizar un sorteo, pero entra en estado 'pendiente' y necesita
--      que Admin lo apruebe (pasarlo a 'activo') antes de que se vea
--      públicamente -- a diferencia de Admin/Aurora, que se publica
--      'activo' de inmediato.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table sorteos add column if not exists entrada_por_publicacion boolean not null default false;
alter table sorteos add column if not exists destacado boolean not null default false;

-- Ampliar el check de estado para incluir 'pendiente' (ver nota en
-- 046_accesorios_mercado.sql sobre por qué se busca el constraint por
-- nombre en vez de asumir el nombre "de convención").
alter table sorteos drop constraint if exists sorteos_estado_check;
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.sorteos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table sorteos drop constraint %I', con.conname);
  end loop;
end $$;
alter table sorteos add constraint sorteos_estado_check check (estado in ('pendiente', 'activo', 'cerrado', 'cancelado'));

-- Reemplaza la policy de insert: Admin o tienda Aurora publica 'activo'
-- de inmediato; una tienda afiliada (de cualquier plan) publica
-- 'pendiente' y necesita aprobación.
drop policy if exists "sorteos: admin o tienda aurora puede crear" on sorteos;
drop policy if exists "sorteos: crear (admin, aurora, o tienda afiliada pendiente)" on sorteos;
create policy "sorteos: crear (admin, aurora, o tienda afiliada pendiente)" on sorteos
  for insert with check (
    perfil_id = auth.uid()
    and (
      (
        estado = 'activo'
        and exists (select 1 from perfiles where id = auth.uid() and (es_admin = true or plan = 'enteball'))
      )
      or (
        estado = 'pendiente'
        and tienda_id is not null
        and exists (select 1 from tiendas where id = tienda_id and perfil_id = auth.uid() and afiliada = true)
      )
    )
  );

-- El propio organizador no se puede auto-aprobar (pasar su sorteo de
-- 'pendiente' a 'activo') -- eso solo lo puede hacer Admin. Se hace con
-- un trigger (no con la policy de update) porque la policy no tiene forma
-- fácil de comparar el estado VIEJO contra el NUEVO.
create or replace function sorteo_validar_transicion() returns trigger as $$
begin
  if old.estado = 'pendiente' and new.estado = 'activo' then
    if not exists (select 1 from perfiles where id = auth.uid() and es_admin = true) then
      raise exception 'Solo un administrador puede aprobar este sorteo.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists sorteo_validar_transicion_trigger on sorteos;
create trigger sorteo_validar_transicion_trigger before update on sorteos
  for each row execute function sorteo_validar_transicion();

-- Boleto automático por publicar una carta mientras el sorteo esté activo.
-- security definer porque hay que sumarle boletos a la fila de
-- sorteo_participantes del propio publicador (o insertarla si no existe),
-- algo que su sesión no podría hacer sola por RLS al no ser un insert de
-- "su propia" fila desde su punto de vista de cliente.
create or replace function sorteo_sumar_boleto_por_publicacion() returns trigger as $$
begin
  if new.tipo = 'carta' then
    update sorteo_participantes sp
      set boletos = sp.boletos + 1
      from sorteos s
      where sp.sorteo_id = s.id
        and sp.perfil_id = new.perfil_id
        and s.entrada_por_publicacion = true
        and s.estado = 'activo'
        and s.fecha_fin > now();

    insert into sorteo_participantes (sorteo_id, perfil_id, boletos)
    select s.id, new.perfil_id, 1
    from sorteos s
    where s.entrada_por_publicacion = true
      and s.estado = 'activo'
      and s.fecha_fin > now()
      and not exists (
        select 1 from sorteo_participantes sp2
        where sp2.sorteo_id = s.id and sp2.perfil_id = new.perfil_id
      );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists sorteo_publicacion_trigger on mercado_listings;
create trigger sorteo_publicacion_trigger after insert on mercado_listings
  for each row execute function sorteo_sumar_boleto_por_publicacion();
