-- ============================================================
-- La columna tiendas.direccion tenía NOT NULL desde el diseño original
-- de la tabla (toda tienda tenía local físico). Las secciones 120/121
-- agregaron el concepto de tienda "sin local" y ya dejaban la dirección
-- opcional en el frontend, pero la base de datos seguía rechazando el
-- insert/update con "null value in column direccion violates not-null
-- constraint" -- por eso fallaba tanto crear una tienda sin local desde
-- AdminPanel como el alta automática al registrar una cuenta de tienda.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table tiendas alter column direccion drop not null;
