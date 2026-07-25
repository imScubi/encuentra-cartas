-- ============================================================
-- Carpetas de exhibición: una carpeta ahora puede ser "de venta" (como
-- hasta ahora, default) o "de exhibición" -- las cartas dentro de una
-- carpeta de exhibición se muestran en la vitrina pública (sección 85)
-- pero NO salen a la venta: no aparecen en el Mercado, en Buscar, en
-- Armar mazo, en el feed de Siguiendo, ni tienen botón de Contactar/
-- Carrito en su ficha de detalle.
--
-- en_venta vive en mercado_listings/inventario_tienda (no en carpetas)
-- porque una carta puede quedar suelta después de borrar su carpeta y el
-- valor debe conservarse; se sincroniza con el tipo de la carpeta al
-- agregar una carta o al cambiar el tipo de una carpeta ya existente
-- (ambos casos los maneja el cliente, ver CarpetasPanel).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table carpetas add column if not exists tipo text not null default 'venta';
alter table carpetas drop constraint if exists carpetas_tipo_check;
alter table carpetas add constraint carpetas_tipo_check check (tipo in ('venta', 'exhibicion'));

alter table mercado_listings add column if not exists en_venta boolean not null default true;
alter table inventario_tienda add column if not exists en_venta boolean not null default true;
