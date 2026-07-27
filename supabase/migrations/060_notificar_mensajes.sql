-- ============================================================
-- Avisa por push y correo cuando te llega un mensaje nuevo (chat 1 a 1, o
-- el mensaje masivo desde el Carrito). Reutiliza la MISMA función de
-- trigger genérica que ya usa la Wishlist Premium (notificar_alerta_wishlist,
-- ver 003_webhooks.sql): solo arma {type, table: TG_TABLE_NAME, record} y lo
-- manda por pg_net a /api/alertas/verificar, que ahora también sabe atender
-- table = 'mensajes' (ver ese archivo). No hace falta ninguna función nueva,
-- solo un trigger más colgado de la tabla mensajes.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop trigger if exists alerta_mensajes on public.mensajes;
create trigger alerta_mensajes
after insert on public.mensajes
for each row execute function public.notificar_alerta_wishlist();
