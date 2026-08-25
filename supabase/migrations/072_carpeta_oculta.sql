-- ============================================================
-- "Ocultar" una carta dentro de una carpeta: distinto de "en_venta"
-- (que ya existe para carpetas de exhibición -- sigue siendo visible,
-- solo no vendible). Una carta oculta no debe aparecer en ningún lado
-- público: ni en el link público de la carpeta (ver CarpetaPublicaView
-- en App.jsx) ni en la vitrina embebida del perfil/tienda
-- (CarpetasStorefront) -- el dueño sí la sigue viendo en su propio
-- panel, atenuada, para poder mostrarla de nuevo cuando quiera.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table inventario_tienda add column if not exists oculta boolean not null default false;
alter table mercado_listings add column if not exists oculta boolean not null default false;
