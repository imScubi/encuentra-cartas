-- ============================================================
-- Guarda el correo de cada perfil (lo necesitamos para poder
-- mandar avisos por correo, no solo por push). Se rellena solo
-- para las cuentas que ya existen, copiándolo desde auth.users.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists email text;

update perfiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;
