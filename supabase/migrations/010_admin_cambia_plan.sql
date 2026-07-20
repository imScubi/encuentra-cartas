-- ============================================================
-- Permite que un admin (perfiles.es_admin = true) cambie el plan
-- de CUALQUIER perfil a mano desde el Panel de administración
-- (útil, por ejemplo, para revertir un plan si se reembolsó un pago).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

drop policy if exists "perfiles: admin actualiza cualquiera" on perfiles;
create policy "perfiles: admin actualiza cualquiera" on perfiles
  for update using (
    exists (select 1 from perfiles admin_row where admin_row.id = auth.uid() and admin_row.es_admin = true)
  );
