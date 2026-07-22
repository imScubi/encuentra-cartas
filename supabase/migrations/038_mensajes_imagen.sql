-- ============================================================
-- Adjuntar una imagen a un mensaje de chat (ej. una foto de la carta que se
-- está negociando, un comprobante, etc.). texto puede quedar vacío si el
-- mensaje es solo una imagen.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mensajes add column if not exists imagen_url text;
alter table mensajes alter column texto drop not null;

insert into storage.buckets (id, name, public)
values ('mensajes', 'mensajes', true)
on conflict (id) do nothing;

drop policy if exists "mensajes: lectura publica" on storage.objects;
create policy "mensajes: lectura publica" on storage.objects
  for select using (bucket_id = 'mensajes');

drop policy if exists "mensajes: usuario sube a su carpeta" on storage.objects;
create policy "mensajes: usuario sube a su carpeta" on storage.objects
  for insert with check (bucket_id = 'mensajes' and (storage.foldername(name))[1] = auth.uid()::text);
