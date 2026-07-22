-- ============================================================
-- Papelera de chats: cada quien puede "borrar" (ocultar de su bandeja) una
-- conversación sin afectar la copia de la otra persona. Se guarda una fila
-- por (mi perfil, la otra persona, contexto de la conversación). Mientras
-- "definitivo" sea falso, se puede restaurar y aparece en la papelera con
-- cuenta regresiva de 7 días. Pasados los 7 días, un cron diario
-- (api/cron/limpiar-papelera-chats.js) marca la fila como definitiva (ya
-- no se puede restaurar ni vuelve a aparecer en la bandeja); si AMBAS
-- personas de la conversación ya la marcaron como definitiva, ese mismo
-- cron borra físicamente los mensajes de esa conversación.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists mensajes_papelera (
  perfil_id uuid not null references perfiles(id) on delete cascade,
  otro_perfil_id uuid not null references perfiles(id) on delete cascade,
  contexto text not null,
  eliminado_en timestamptz not null default now(),
  definitivo boolean not null default false,
  primary key (perfil_id, otro_perfil_id, contexto)
);

alter table mensajes_papelera enable row level security;

drop policy if exists "mensajes_papelera: cada quien ve la suya" on mensajes_papelera;
create policy "mensajes_papelera: cada quien ve la suya" on mensajes_papelera
  for select using (perfil_id = auth.uid());

drop policy if exists "mensajes_papelera: cada quien la crea" on mensajes_papelera;
create policy "mensajes_papelera: cada quien la crea" on mensajes_papelera
  for insert with check (perfil_id = auth.uid());

drop policy if exists "mensajes_papelera: cada quien la restaura (borra su fila)" on mensajes_papelera;
create policy "mensajes_papelera: cada quien la restaura (borra su fila)" on mensajes_papelera
  for delete using (perfil_id = auth.uid());
