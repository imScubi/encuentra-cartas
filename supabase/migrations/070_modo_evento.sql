-- ============================================================
-- "Modo Evento" (Amatista+): herramienta para vendedores que venden en
-- eventos/expos presenciales. Permite registrar un evento (fechas, lugar),
-- cargar ahí el inventario que se llevan (a mano o importado de su perfil,
-- organizado en "carpetas" -- cajas/categorías del evento), marcar cada
-- pieza como vendida (con costo y precio real de venta, que puede diferir
-- del precio de lista por regateo), y registrar gastos operativos (cede,
-- comida, transporte, etc). Todo lo demás (cálculo en vivo, desglose por
-- día, reporte en PDF) se hace en el cliente con estos datos -- no hace
-- falta ninguna función serverless nueva.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tienda_id uuid references tiendas(id) on delete set null,
  nombre text not null,
  lugar text,
  fecha_inicio date not null,
  fecha_fin date,
  estado text not null default 'activo' check (estado in ('activo', 'cerrado')),
  created_at timestamptz not null default now()
);

-- Cada fila es una pieza (o un lote con "cantidad") que el vendedor se llevó
-- al evento. vendida=false mientras sigue en la mesa; al venderse se llena
-- precio_venta y dia. precio_lista es solo referencia (lo que traía puesto
-- de precio, para comparar contra lo que realmente se cerró).
create table if not exists evento_ventas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  dia date not null default current_date,
  nombre text not null,
  imagen_url text,
  carta_ref jsonb,
  origen_tabla text,
  origen_id uuid,
  carpeta text,
  costo numeric not null default 0,
  precio_lista numeric,
  precio_venta numeric,
  cantidad integer not null default 1 check (cantidad > 0),
  vendida boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists evento_gastos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  dia date,
  tipo text not null default 'otro' check (tipo in ('cede', 'comida', 'transporte', 'otro')),
  descripcion text,
  monto numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists evento_ventas_evento_id_idx on evento_ventas(evento_id);
create index if not exists evento_gastos_evento_id_idx on evento_gastos(evento_id);

alter table eventos enable row level security;
alter table evento_ventas enable row level security;
alter table evento_gastos enable row level security;

drop policy if exists "eventos: dueño ve/crea/edita/borra los suyos" on eventos;
create policy "eventos: dueño ve/crea/edita/borra los suyos" on eventos
  for all using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

drop policy if exists "evento_ventas: dueño del evento" on evento_ventas;
create policy "evento_ventas: dueño del evento" on evento_ventas
  for all using (evento_id in (select id from eventos where perfil_id = auth.uid()))
  with check (evento_id in (select id from eventos where perfil_id = auth.uid()));

drop policy if exists "evento_gastos: dueño del evento" on evento_gastos;
create policy "evento_gastos: dueño del evento" on evento_gastos
  for all using (evento_id in (select id from eventos where perfil_id = auth.uid()))
  with check (evento_id in (select id from eventos where perfil_id = auth.uid()));
