-- ============================================================
-- Sub-perfiles administrados por un admin: cuentas de verdad (tienen
-- su propio usuario de Supabase Auth, creado con la Admin API desde
-- api/admin/crear-subperfil.js), pero marcadas con quién las administra,
-- para poder listarlas y para poder "entrar como" ellas sin necesitar
-- su contraseña.
--
-- No se necesita ninguna política nueva de RLS: la lectura de perfiles
-- ya es pública, y "perfiles: admin actualiza cualquiera" (migración 010)
-- ya deja que un admin edite cualquier perfil, incluido su plan.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists gestionado_por uuid references perfiles(id) on delete set null;
