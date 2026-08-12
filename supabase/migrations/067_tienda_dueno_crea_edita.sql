-- ============================================================
-- Hasta ahora solo el Admin podía crear o editar filas de `tiendas`
-- (INSERT/UPDATE en RLS requerían es_admin=true) -- cualquier cuenta de
-- tipo "tienda" quedaba "sin vincular" hasta que un admin la diera de
-- alta a mano. Esto permite que el dueño cree y edite su propia tienda.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "tiendas: dueño crea la suya" on tiendas;
create policy "tiendas: dueño crea la suya" on tiendas
  for insert with check (perfil_id = auth.uid());

drop policy if exists "tiendas: dueño edita la suya" on tiendas;
create policy "tiendas: dueño edita la suya" on tiendas
  for update using (perfil_id = auth.uid());
