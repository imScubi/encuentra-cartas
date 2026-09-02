-- ============================================================
-- Varias colecciones privadas por usuario ("tableros") -- como el
-- selector de portafolios de Collectr. "Mi colección" (coleccion_usuario,
-- estado='tengo') deja de ser una sola lista plana: cada carta ahora
-- pertenece a un tablero, y la MISMA carta puede vivir en dos tableros
-- distintos con cantidades independientes.
--
-- La Wishlist (coleccion_usuario, estado='quiero') NO se toca --
-- conserva exactamente su regla de unicidad de siempre (una fila por
-- carta por usuario, sin importar tablero), para no romper el choque
-- 23505 del que depende MiWishlistView.agregarCarta.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists coleccion_tableros (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  nombre text not null,
  color text,
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists coleccion_tableros_un_principal on coleccion_tableros(perfil_id) where es_principal;

alter table coleccion_tableros enable row level security;

drop policy if exists "coleccion_tableros: dueño administra" on coleccion_tableros;
create policy "coleccion_tableros: dueño administra" on coleccion_tableros
  for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

alter table coleccion_usuario add column if not exists tablero_id uuid references coleccion_tableros(id) on delete cascade;

-- Backfill idempotente: un tablero "Principal" por perfil que ya tenga
-- filas 'tengo' sin tablero -- seguro de correr dos veces (la segunda
-- vez ya no quedan filas 'tengo' con tablero_id null que backfillear).
insert into coleccion_tableros (perfil_id, nombre, es_principal)
select distinct perfil_id, 'Principal', true from coleccion_usuario
where tablero_id is null and estado = 'tengo'
  and not exists (select 1 from coleccion_tableros ct where ct.perfil_id = coleccion_usuario.perfil_id and ct.es_principal);

update coleccion_usuario cu set tablero_id = ct.id
from coleccion_tableros ct
where ct.perfil_id = cu.perfil_id and ct.es_principal and cu.tablero_id is null and cu.estado = 'tengo';

-- Reemplaza el único índice de antes (uno por carta por usuario, sin
-- importar estado) por dos parciales: 'quiero' (Wishlist) se queda
-- EXACTO igual que hoy; 'tengo' pasa a ser único POR TABLERO.
alter table coleccion_usuario drop constraint if exists coleccion_usuario_perfil_id_tcg_card_api_id_key;
create unique index if not exists coleccion_usuario_quiero_unq on coleccion_usuario (perfil_id, tcg, card_api_id) where estado = 'quiero';
create unique index if not exists coleccion_usuario_tengo_unq on coleccion_usuario (tablero_id, tcg, card_api_id) where estado = 'tengo';

-- Resuelve (o crea, si hace falta) el tablero "Principal" del usuario
-- actual de forma segura ante llamadas concurrentes -- el
-- "on conflict ... do nothing" hace que dos llamadas casi simultáneas
-- (ej. la cola offline de Modo Evento reintentando varias entradas
-- seguidas al reconectar, de un usuario sin tableros todavía) nunca
-- puedan crear dos tableros "es_principal=true": el índice único
-- parcial las serializa, y la que pierde la carrera solo relee lo que
-- la otra ya insertó, en vez de tronar.
create or replace function coleccion_resolver_tablero_principal() returns uuid language plpgsql security invoker as $$
declare v_id uuid;
begin
  select id into v_id from coleccion_tableros where perfil_id = auth.uid() and es_principal limit 1;
  if v_id is not null then return v_id; end if;
  insert into coleccion_tableros (perfil_id, nombre, es_principal) values (auth.uid(), 'Principal', true)
  on conflict (perfil_id) where es_principal do nothing
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  select id into v_id from coleccion_tableros where perfil_id = auth.uid() and es_principal limit 1;
  return v_id;
end;
$$;

-- Marca un tablero como principal de forma atómica (una sola
-- transacción) -- evita la ventana donde ningún tablero o dos
-- tableros serían principales a la vez, que sí existiría si esto se
-- hiciera con dos PATCH separados desde el cliente.
create or replace function coleccion_marcar_tablero_principal(p_tablero_id uuid) returns boolean language plpgsql security invoker as $$
begin
  update coleccion_tableros set es_principal = false where perfil_id = auth.uid() and es_principal and id <> p_tablero_id;
  update coleccion_tableros set es_principal = true where perfil_id = auth.uid() and id = p_tablero_id;
  return true;
end;
$$;

-- coleccion_registrar_entrada/salida ganan p_tablero_id (opcional, al
-- final, con default null para no romper a quien ya las llama sin
-- mandarlo -- Modo Evento sigue funcionando sin cambiar una sola
-- línea): si viene null, se resuelve el tablero Principal.
create or replace function coleccion_registrar_entrada(
  p_historial_id uuid, p_tcg text, p_card_api_id text, p_carta text,
  p_set_nombre text, p_imagen_url text, p_cantidad int, p_precio_ref_mxn numeric,
  p_motivo text, p_monto numeric, p_grupo_id uuid, p_ajuste_efectivo numeric, p_nota text,
  p_tablero_id uuid default null
) returns boolean language plpgsql security invoker as $$
declare v_tablero_id uuid;
begin
  insert into coleccion_historial (id, perfil_id, tipo, motivo, tcg, card_api_id, carta, imagen_url, cantidad, monto, grupo_id, ajuste_efectivo, nota)
  values (p_historial_id, auth.uid(), 'entrada', p_motivo, p_tcg, p_card_api_id, p_carta, p_imagen_url, p_cantidad, p_monto, p_grupo_id, p_ajuste_efectivo, p_nota)
  on conflict (id) do nothing;
  if not found then return true; end if; -- ya se había aplicado (reintento offline)

  if p_card_api_id is not null then
    v_tablero_id := coalesce(p_tablero_id, coleccion_resolver_tablero_principal());
    insert into coleccion_usuario (perfil_id, tcg, card_api_id, carta, set_nombre, imagen_url, estado, cantidad, precio_ref_mxn, precio_ref_actualizado_en, tablero_id)
    values (auth.uid(), p_tcg, p_card_api_id, p_carta, p_set_nombre, p_imagen_url, 'tengo', p_cantidad, p_precio_ref_mxn, case when p_precio_ref_mxn is not null then now() end, v_tablero_id)
    on conflict (tablero_id, tcg, card_api_id) where estado = 'tengo' do update set
      cantidad = coleccion_usuario.cantidad + excluded.cantidad, estado = 'tengo';
  end if;
  return true;
end;
$$;

create or replace function coleccion_registrar_salida(
  p_historial_id uuid, p_tcg text, p_card_api_id text, p_carta text, p_imagen_url text,
  p_cantidad int, p_motivo text, p_monto numeric, p_grupo_id uuid, p_ajuste_efectivo numeric, p_nota text,
  p_tablero_id uuid default null
) returns boolean language plpgsql security invoker as $$
declare v_actual int; v_tablero_id uuid;
begin
  insert into coleccion_historial (id, perfil_id, tipo, motivo, tcg, card_api_id, carta, imagen_url, cantidad, monto, grupo_id, ajuste_efectivo, nota)
  values (p_historial_id, auth.uid(), 'salida', p_motivo, p_tcg, p_card_api_id, p_carta, p_imagen_url, p_cantidad, p_monto, p_grupo_id, p_ajuste_efectivo, p_nota)
  on conflict (id) do nothing;
  if not found then return true; end if;

  if p_card_api_id is not null then
    v_tablero_id := coalesce(p_tablero_id, coleccion_resolver_tablero_principal());
    select cantidad into v_actual from coleccion_usuario where tablero_id = v_tablero_id and tcg = p_tcg and card_api_id = p_card_api_id and estado = 'tengo';
    if v_actual is not null then
      if v_actual <= p_cantidad then
        delete from coleccion_usuario where tablero_id = v_tablero_id and tcg = p_tcg and card_api_id = p_card_api_id and estado = 'tengo';
      else
        update coleccion_usuario set cantidad = cantidad - p_cantidad where tablero_id = v_tablero_id and tcg = p_tcg and card_api_id = p_card_api_id and estado = 'tengo';
      end if;
    end if;
  end if;
  return true;
end;
$$;
