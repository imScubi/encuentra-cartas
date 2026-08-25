-- ============================================================
-- Carpetas: portada (color) y ubicación a nivel carpeta en vez de por
-- carta. Antes, cada carta agregada a una carpeta del Mercado (venta
-- entre coleccionistas) pedía su municipio por separado, aunque todas
-- las cartas de una misma carpeta comparten ubicación -- ahora la
-- carpeta guarda su propio municipio (+ si hay envío disponible o se
-- puede acordar otro lugar) y ese valor baja a las cartas que agrega.
-- `color` es el acento visual de la portada generada (una silueta con
-- el nombre en una cintilla), elegido una sola vez al crear la carpeta.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table carpetas
  add column if not exists color text,
  add column if not exists zona text,
  add column if not exists envio_disponible boolean not null default false,
  add column if not exists punto_encuentro boolean not null default false;
