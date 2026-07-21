-- ============================================================
-- Permite leer la Wishlist y las Carpetas de un perfil ajeno desde su
-- perfil público, solo cuando el dueño no lo haya ocultado
-- (perfiles.visibilidad.wishlist / .carpetas). Antes solo el dueño
-- podía leer sus propias alertas/carpetas.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "alertas: lectura publica si el dueno lo permite" on alertas;
create policy "alertas: lectura publica si el dueno lo permite" on alertas
  for select using (
    exists (
      select 1 from perfiles
      where perfiles.id = alertas.perfil_id
        and coalesce((perfiles.visibilidad->>'wishlist')::boolean, true) = true
    )
  );

drop policy if exists "carpetas: lectura publica si el dueno lo permite" on carpetas;
create policy "carpetas: lectura publica si el dueno lo permite" on carpetas
  for select using (
    exists (
      select 1 from perfiles
      where perfiles.id = carpetas.perfil_id
        and coalesce((perfiles.visibilidad->>'carpetas')::boolean, true) = true
    )
  );

drop policy if exists "carpeta_fotos: lectura publica si el dueno lo permite" on carpeta_fotos;
create policy "carpeta_fotos: lectura publica si el dueno lo permite" on carpeta_fotos
  for select using (
    carpeta_id in (
      select c.id from carpetas c
      join perfiles p on p.id = c.perfil_id
      where coalesce((p.visibilidad->>'carpetas')::boolean, true) = true
    )
  );
