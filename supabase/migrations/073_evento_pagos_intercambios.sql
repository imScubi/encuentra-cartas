-- ============================================================
-- Modo Evento: método de pago, intercambios (con o sin dinero extra en
-- cualquier dirección), y cartas que ENTRAN (compradas o recibidas en un
-- intercambio) -- hasta ahora evento_ventas solo modelaba lo que sale.
--
-- evento_ventas gana:
--   metodo_pago: efectivo/transferencia/tarjeta -- de la venta en sí, o
--     del dinero extra de un intercambio (si lo hubo).
--   tipo_operacion: 'venta' (default, comportamiento de siempre) o
--     'intercambio'.
--   intercambio_ajuste: dinero extra que cambió de manos en un
--     intercambio -- positivo si el vendedor lo recibió, negativo si el
--     vendedor lo dio, null/0 si fue trueque puro sin dinero de por medio.
--
-- evento_adquisiciones es nueva: cada fila es una pieza que ENTRÓ al
-- inventario del vendedor durante el evento -- ya sea una compra directa
-- (origen_venta_id null, costo = lo que pagó) o la carta que recibió como
-- parte de un intercambio ligado a una fila de evento_ventas
-- (origen_venta_id apunta a ella; el dinero de ese intercambio, si hubo,
-- ya se cuenta en intercambio_ajuste de esa venta, así que aquí costo
-- normalmente queda en 0 para no contarlo doble).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table evento_ventas add column if not exists metodo_pago text check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta'));
alter table evento_ventas add column if not exists tipo_operacion text not null default 'venta' check (tipo_operacion in ('venta', 'intercambio'));
alter table evento_ventas add column if not exists intercambio_ajuste numeric;

create table if not exists evento_adquisiciones (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  dia date not null default current_date,
  nombre text not null,
  imagen_url text,
  costo numeric not null default 0,
  metodo_pago text check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta')),
  origen_venta_id uuid references evento_ventas(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists evento_adquisiciones_evento_id_idx on evento_adquisiciones(evento_id);

alter table evento_adquisiciones enable row level security;

drop policy if exists "evento_adquisiciones: dueño del evento" on evento_adquisiciones;
create policy "evento_adquisiciones: dueño del evento" on evento_adquisiciones
  for all using (evento_id in (select id from eventos where perfil_id = auth.uid()))
  with check (evento_id in (select id from eventos where perfil_id = auth.uid()));
