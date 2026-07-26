-- ============================================================
-- Deja que un Admin quite la participación de un usuario en un sorteo
-- (ej. alguien hizo trampa con los boletos, o pidió que lo sacaran).
-- Hasta ahora sorteo_participantes no tenía ninguna policy de DELETE --
-- ni siquiera el propio organizador podía quitar a nadie -- así que
-- estaba totalmente bloqueado.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "sorteo_participantes: admin quita participantes" on sorteo_participantes;
create policy "sorteo_participantes: admin quita participantes" on sorteo_participantes
  for delete using (
    exists (select 1 from perfiles where id = auth.uid() and es_admin = true)
  );
