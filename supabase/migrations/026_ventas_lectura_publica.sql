-- ============================================================
-- Corrige un bug: el contador de "ventas completadas" en el perfil
-- público siempre mostraba 0 para cualquiera que no fuera el vendedor
-- o comprador de esa venta, porque la única política de lectura de
-- `ventas` era "solo los participantes" (migración 024).
--
-- Ahora: las ventas ya CONFIRMADAS son de lectura pública (es un
-- registro de que el trato sí ocurrió, mismo criterio que las
-- reseñas), y el admin puede ver todas — incluidas pendientes y
-- rechazadas — para poder revisar el historial de un vendedor.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "ventas: confirmadas son publicas" on ventas;
create policy "ventas: confirmadas son publicas" on ventas
  for select using (estado = 'confirmada');

drop policy if exists "ventas: admin ve todas" on ventas;
create policy "ventas: admin ve todas" on ventas
  for select using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));
