-- ============================================================
-- Mensajes sin leer -- para el botón flotante de chats (numerito con
-- cuántos mensajes tienes sin leer). Nunca había existido el concepto de
-- "leído" en mensajes, solo se listaban todos.
--
-- default false: todo mensaje nuevo nace sin leer; se marca leído cuando
-- el destinatario abre esa conversación (ChatModal).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mensajes add column if not exists leido boolean not null default false;

create index if not exists mensajes_para_perfil_no_leido_idx on mensajes(para_perfil_id) where leido = false;
