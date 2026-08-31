-- ============================================================
-- Colección/Portafolio personal (Zafiro+) + intercambios: extiende
-- coleccion_usuario (ya usada por Wishlist/"Tengo esta carta") con
-- cantidad y precio de referencia, y agrega un historial de
-- movimientos (entradas/salidas) más dos funciones RPC que hacen el
-- upsert/decremento de forma atómica e idempotente -- necesario para
-- que la cola offline de Modo Evento (src/lib/offlineEventos.js) pueda
-- reintentar un intercambio sin duplicar cantidades si la respuesta se
-- perdió a medio camino (mismo criterio que ya resuelve el choque
-- 23505 para inserts simples, ver sincronizarCola).
--
-- Deliberadamente NO se agrega ninguna política de lectura pública
-- aquí: a diferencia de la Wishlist (migración 078), exponer
-- estado='tengo' -- ahora con cantidad y precio -- revelaría qué
-- cartas valiosas tiene alguien. La Colección se queda 100% privada.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table coleccion_usuario
  add column if not exists cantidad integer not null default 1,
  add column if not exists precio_ref_mxn numeric,
  add column if not exists precio_ref_actualizado_en timestamptz,
  add column if not exists costo_adquisicion numeric;

create table if not exists coleccion_historial (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'salida')),
  motivo text not null check (motivo in ('compra', 'venta', 'intercambio', 'ajuste_manual')),
  tcg text not null,
  card_api_id text,
  carta text not null,
  imagen_url text,
  cantidad integer not null default 1,
  monto numeric,
  grupo_id uuid, -- agrupa las filas de un mismo intercambio (null si no aplica)
  ajuste_efectivo numeric,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists coleccion_historial_perfil_id_idx on coleccion_historial(perfil_id);

alter table coleccion_historial enable row level security;

drop policy if exists "coleccion_historial: dueño administra" on coleccion_historial;
create policy "coleccion_historial: dueño administra" on coleccion_historial
  for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- Upsert atómico: suma cantidad a coleccion_usuario (nunca la
-- sobreescribe) y registra el movimiento en un solo paso, idempotente
-- por p_historial_id (generado en el cliente) -- un reintento con el
-- mismo id no vuelve a sumar. security invoker + auth.uid(): nunca se
-- confía en un perfil_id que mande el cliente.
create or replace function coleccion_registrar_entrada(
  p_historial_id uuid, p_tcg text, p_card_api_id text, p_carta text,
  p_set_nombre text, p_imagen_url text, p_cantidad int, p_precio_ref_mxn numeric,
  p_motivo text, p_monto numeric, p_grupo_id uuid, p_ajuste_efectivo numeric, p_nota text
) returns boolean language plpgsql security invoker as $$
begin
  insert into coleccion_historial (id, perfil_id, tipo, motivo, tcg, card_api_id, carta, imagen_url, cantidad, monto, grupo_id, ajuste_efectivo, nota)
  values (p_historial_id, auth.uid(), 'entrada', p_motivo, p_tcg, p_card_api_id, p_carta, p_imagen_url, p_cantidad, p_monto, p_grupo_id, p_ajuste_efectivo, p_nota)
  on conflict (id) do nothing;
  if not found then return true; end if; -- ya se había aplicado (reintento offline)

  if p_card_api_id is not null then
    insert into coleccion_usuario (perfil_id, tcg, card_api_id, carta, set_nombre, imagen_url, estado, cantidad, precio_ref_mxn, precio_ref_actualizado_en)
    values (auth.uid(), p_tcg, p_card_api_id, p_carta, p_set_nombre, p_imagen_url, 'tengo', p_cantidad, p_precio_ref_mxn, case when p_precio_ref_mxn is not null then now() end)
    on conflict (perfil_id, tcg, card_api_id) do update set
      cantidad = coleccion_usuario.cantidad + excluded.cantidad, estado = 'tengo';
  end if;
  return true;
end;
$$;

-- Simétrica a la de arriba: descuenta cantidad (borra la fila si llega
-- a 0) y registra la salida, mismo criterio de idempotencia.
create or replace function coleccion_registrar_salida(
  p_historial_id uuid, p_tcg text, p_card_api_id text, p_carta text, p_imagen_url text,
  p_cantidad int, p_motivo text, p_monto numeric, p_grupo_id uuid, p_ajuste_efectivo numeric, p_nota text
) returns boolean language plpgsql security invoker as $$
declare v_actual int;
begin
  insert into coleccion_historial (id, perfil_id, tipo, motivo, tcg, card_api_id, carta, imagen_url, cantidad, monto, grupo_id, ajuste_efectivo, nota)
  values (p_historial_id, auth.uid(), 'salida', p_motivo, p_tcg, p_card_api_id, p_carta, p_imagen_url, p_cantidad, p_monto, p_grupo_id, p_ajuste_efectivo, p_nota)
  on conflict (id) do nothing;
  if not found then return true; end if;

  if p_card_api_id is not null then
    select cantidad into v_actual from coleccion_usuario where perfil_id = auth.uid() and tcg = p_tcg and card_api_id = p_card_api_id;
    if v_actual is not null then
      if v_actual <= p_cantidad then
        delete from coleccion_usuario where perfil_id = auth.uid() and tcg = p_tcg and card_api_id = p_card_api_id;
      else
        update coleccion_usuario set cantidad = cantidad - p_cantidad where perfil_id = auth.uid() and tcg = p_tcg and card_api_id = p_card_api_id;
      end if;
    end if;
  end if;
  return true;
end;
$$;
