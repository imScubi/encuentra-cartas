-- ============================================================
-- Guarda desde cuándo un perfil alcanzó el rango Diamante (Master
-- Ball), para mostrar el emblema "Diamante desde <fecha>" en su
-- perfil público. Se llena solo la primera vez que llega a Diamante
-- (no se pisa si baja de rango y vuelve a subir después).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists diamante_desde timestamptz;
