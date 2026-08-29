-- ============================================================
-- Wishlist rediseñada (carpeta visual de cartas deseadas, compartible por
-- link): permite lectura PÚBLICA de las filas de coleccion_usuario con
-- estado='quiero' -- nunca 'tengo' (eso sí sería un problema real de
-- privacidad, revelar qué cartas valiosas tiene alguien y dónde vive).
--
-- El chequeo de visibilidad va EMBEBIDO en la propia policy (mismo
-- patrón que ya usan alertas/carpetas en 021_visibilidad_publica.sql) en
-- vez de dejarlo solo del lado de la app: cualquiera puede pegarle a
-- PostgREST directo con la anon key (que ya está pública en el bundle de
-- JS), así que la app sola no basta para respetar el toggle
-- "Mi lista de deseos" de Mi cuenta.
--
-- No choca con la policy existente "coleccion_usuario: dueño administra"
-- (for all using perfil_id = auth.uid()) -- ambas son PERMISSIVE, se
-- combinan con OR: el dueño sigue viendo/editando sus "tengo" Y "quiero"
-- como siempre: el público solo ve "quiero", y solo si visibilidad.wishlist
-- lo permite.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "coleccion_usuario: lectura publica de quiero" on coleccion_usuario;
create policy "coleccion_usuario: lectura publica de quiero" on coleccion_usuario
  for select using (
    estado = 'quiero'
    and exists (
      select 1 from perfiles
      where perfiles.id = coleccion_usuario.perfil_id
        and coalesce((perfiles.visibilidad->>'wishlist')::boolean, true) = true
    )
  );
