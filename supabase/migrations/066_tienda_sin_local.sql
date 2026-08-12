-- ============================================================
-- Tiendas sin local físico: vendedores que operan solo en línea (envíos,
-- redes sociales, etc.) y no tienen una dirección real que mostrar en el
-- mapa. Marcando esta bandera, la dirección deja de ser obligatoria.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table tiendas add column if not exists sin_local boolean not null default false;
