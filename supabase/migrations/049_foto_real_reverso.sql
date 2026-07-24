-- ============================================================
-- Foto real obligatoria de frente Y de atrás al publicar en el
-- Mercado (vendedor individual: carta/sellado/accesorio) o al
-- agregar una carta suelta al inventario de una tienda. Ya
-- existía foto_real_url (frente); esta migración agrega el
-- reverso. Exenta a propósito: sellado_tienda (producto sellado
-- de tienda) y el importador masivo, que no tocan esta columna.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mercado_listings add column if not exists foto_real_reverso_url text;
alter table inventario_tienda add column if not exists foto_real_reverso_url text;
