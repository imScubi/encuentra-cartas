-- ============================================================
-- Permite al admin actualizar (no solo borrar) cualquier fila de
-- inventario_tienda -- necesario para la herramienta de "Completar fotos
-- faltantes" del panel de Admin (ver AdminPanel → Tiendas en App.jsx),
-- que arregla en bloque cartas subidas sin imagen (ej. importaciones
-- masivas de Magic vía ManaBox, ver sección 112 del historial) sin que
-- el admin tenga que iniciar sesión como cada tienda una por una.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "inventario_tienda: admin actualiza cualquiera" on inventario_tienda;
create policy "inventario_tienda: admin actualiza cualquiera" on inventario_tienda
  for update
  using (exists (select 1 from perfiles where perfiles.id = auth.uid() and perfiles.es_admin = true));
