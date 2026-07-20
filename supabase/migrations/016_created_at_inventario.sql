-- ============================================================
-- Asegura que inventario_tienda y sellado_tienda tengan created_at
-- (la vitrina de inicio ordena por fecha de publicación y puede fallar
-- si la columna no existe en tu base de datos).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table inventario_tienda add column if not exists created_at timestamptz not null default now();
alter table sellado_tienda add column if not exists created_at timestamptz not null default now();
