-- ============================================================
-- Panel de Admin → "Estadísticas": registro de métricas de crecimiento
-- (usuarios por plan, publicaciones activas, ventas, ingresos, etc.) con
-- gráficas de progreso en el tiempo.
--
-- Dos cambios chicos que hacen falta para que las cifras sean exactas:
--
-- 1. ventas.tipo: antes no se guardaba si lo vendido era una carta o
--    producto sellado (solo la tabla de origen) — se agrega para poder
--    mostrar "cartas vendidas" y "sellado vendido" por separado. Las
--    filas ya existentes se marcan como 'carta' (la mayoría lo eran).
-- 2. pagos/boosts: antes solo el dueño podía leer su propio historial de
--    pagos — se agrega una política para que el admin pueda leer todos y
--    calcular ingresos totales.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table ventas add column if not exists tipo text check (tipo in ('carta', 'sellado'));
update ventas set tipo = 'carta' where tipo is null;

drop policy if exists "pagos: admin lee todos" on pagos;
create policy "pagos: admin lee todos" on pagos
  for select using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "boosts: admin lee todos" on boosts;
create policy "boosts: admin lee todos" on boosts
  for select using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
