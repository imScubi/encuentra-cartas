-- ============================================================
-- Sorteos exclusivos por campaña: el organizador (Admin o tienda Aurora/
-- afiliada) puede marcar un sorteo como "exclusivo" y darle un código
-- corto de campaña (para el link/QR que va en la descripción de un video
-- de TikTok/IG). Solo quien llega por ESE link/código puede participar --
-- ni un usuario cualquiera con sesión que solo esté navegando la lista
-- normal de Sorteos, ni el bono de referidos de toda la vida con un
-- ref= inventado.
--
-- Misma puerta para los dos casos: una cuenta recién creada desde el link
-- Y alguien que ya tenía cuenta y solo "reclama su lugar" -- ambas rutas
-- llaman a sorteo_unirse_por_campana() de abajo (ver App.jsx).
--
-- Ticket plano: en un sorteo exclusivo TODOS entran con exactamente 1
-- boleto -- no aplican los bonos de compartir/publicar/referir de los
-- sorteos abiertos (se blindan también del lado del servidor, por si la
-- UI algún día se equivoca).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table sorteos add column if not exists exclusivo boolean not null default false;
alter table sorteos add column if not exists codigo_campana text;

alter table sorteos drop constraint if exists sorteos_codigo_campana_unico;
alter table sorteos add constraint sorteos_codigo_campana_unico unique (codigo_campana);

-- Siempre en MAYÚSCULAS (el cliente lo manda así) para que la comparación
-- en la función de abajo sea directa, sin funciones sobre el índice.
alter table sorteos drop constraint if exists sorteos_codigo_campana_formato;
alter table sorteos add constraint sorteos_codigo_campana_formato
  check (codigo_campana is null or codigo_campana ~ '^[A-Z0-9-]{3,24}$');

alter table sorteos drop constraint if exists sorteos_exclusivo_requiere_codigo;
alter table sorteos add constraint sorteos_exclusivo_requiere_codigo
  check (not exclusivo or codigo_campana is not null);

-- Cierra la puerta "abierta" de sorteo_participantes para sorteos
-- exclusivos -- la única forma de entrar a esos pasa a ser la función
-- security definer de abajo.
drop policy if exists "sorteo_participantes: cualquiera con sesion se une" on sorteo_participantes;
drop policy if exists "sorteo_participantes: cualquiera con sesion se une (no exclusivos)" on sorteo_participantes;
create policy "sorteo_participantes: cualquiera con sesion se une (no exclusivos)" on sorteo_participantes
  for insert with check (
    perfil_id = auth.uid()
    and exists (select 1 from sorteos s where s.id = sorteo_id and s.exclusivo = false)
  );

-- Cierra también el bono de referidos "de toda la vida" (migración 051)
-- para sorteos exclusivos -- si no, cualquiera podría fabricarse un
-- ?sorteo=X&ref=CUALQUIERA para colarse sin haber llegado nunca por el
-- link/código real de la campaña.
drop policy if exists "sorteo_referidos: el nuevo usuario registra su referido" on sorteo_referidos;
create policy "sorteo_referidos: el nuevo usuario registra su referido" on sorteo_referidos
  for insert with check (
    nuevo_perfil_id = auth.uid()
    and exists (select 1 from sorteos s where s.id = sorteo_id and s.exclusivo = false)
  );

-- Única puerta de entrada a un sorteo exclusivo. Recibe SOLO el código de
-- campaña (nunca un sorteo_id ni un perfil_id que mande el cliente) y
-- entra al usuario YA autenticado (auth.uid()) con exactamente 1 boleto.
-- security definer porque auth.uid() (nuevo o existente) no tiene, por
-- RLS normal, permiso de insert en un sorteo exclusivo -- ver policy de
-- arriba.
create or replace function sorteo_unirse_por_campana(p_codigo text) returns void as $$
declare
  s sorteos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para participar.';
  end if;
  select * into s from sorteos where codigo_campana = upper(p_codigo);
  if s.id is null then
    raise exception 'Ese código de campaña no es válido.';
  end if;
  if s.estado <> 'activo' or s.fecha_fin <= now() then
    raise exception 'Este sorteo ya no acepta participantes.';
  end if;
  insert into sorteo_participantes (sorteo_id, perfil_id, boletos)
    values (s.id, auth.uid(), 1)
    on conflict (sorteo_id, perfil_id) do nothing;
end;
$$ language plpgsql security definer;

-- Blindaje de servidor (defensa en profundidad -- la UI no debería ni
-- ofrecer estos bonos en un sorteo exclusivo, ver App.jsx): que nadie
-- termine con más de 1 boleto en un exclusivo aunque se llame a mano.
create or replace function sorteo_reclamar_bono_compartir(p_sorteo_id uuid) returns void as $$
begin
  update sorteo_participantes
    set boletos = boletos + 1, compartido = true
    where sorteo_id = p_sorteo_id and perfil_id = auth.uid() and compartido = false
      and exists (select 1 from sorteos s where s.id = p_sorteo_id and s.exclusivo = false);
end;
$$ language plpgsql security definer;

create or replace function sorteo_sumar_boleto_por_publicacion() returns trigger as $$
begin
  if new.tipo = 'carta' then
    update sorteo_participantes sp
      set boletos = sp.boletos + 1
      from sorteos s
      where sp.sorteo_id = s.id
        and sp.perfil_id = new.perfil_id
        and s.entrada_por_publicacion = true
        and s.exclusivo = false
        and s.estado = 'activo'
        and s.fecha_fin > now();

    insert into sorteo_participantes (sorteo_id, perfil_id, boletos)
    select s.id, new.perfil_id, 1
    from sorteos s
    where s.entrada_por_publicacion = true
      and s.exclusivo = false
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
