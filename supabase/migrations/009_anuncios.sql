-- ============================================================
-- Sistema de Anuncios: el admin puede publicar uno de inmediato
-- o programarlo para más tarde; las tiendas pueden proponer uno,
-- pero queda "pendiente" hasta que el admin lo apruebe. Cuando un
-- anuncio se publica (de inmediato o al llegar su fecha programada)
-- se manda una notificación push a TODOS los usuarios (no correo).
--
-- Reutiliza la tabla "noticias" que ya existías (tipo, titulo,
-- contenido, created_at) y le agrega las columnas que faltan.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table noticias add column if not exists tienda_id uuid references tiendas(id) on delete set null;
alter table noticias add column if not exists creado_por uuid references auth.users(id) on delete set null;
alter table noticias add column if not exists aprobado_por uuid references auth.users(id) on delete set null;
alter table noticias add column if not exists estado text not null default 'publicado';
alter table noticias add column if not exists fecha_publicacion timestamptz not null default now();
alter table noticias add column if not exists publicado boolean not null default true;
alter table noticias add column if not exists notificado boolean not null default false;

do $$ begin
  alter table noticias add constraint noticias_estado_check check (estado in ('pendiente','programado','publicado','rechazado'));
exception when duplicate_object then null;
end $$;

-- Los anuncios que ya existían (subidos a mano antes de este cambio)
-- se consideran ya publicados y ya notificados (para no re-enviar push viejos).
update noticias set publicado = true, estado = 'publicado', notificado = true where notificado = false and estado = 'publicado';

alter table noticias enable row level security;

drop policy if exists "noticias: lectura publica de publicados" on noticias;
create policy "noticias: lectura publica de publicados" on noticias
  for select using (publicado = true);

drop policy if exists "noticias: tienda ve las suyas" on noticias;
create policy "noticias: tienda ve las suyas" on noticias
  for select using (tienda_id in (select id from tiendas where perfil_id = auth.uid()));

drop policy if exists "noticias: admin ve todas" on noticias;
create policy "noticias: admin ve todas" on noticias
  for select using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "noticias: tienda propone pendiente" on noticias;
create policy "noticias: tienda propone pendiente" on noticias
  for insert with check (
    estado = 'pendiente'
    and publicado = false
    and creado_por = auth.uid()
    and tienda_id in (select id from tiendas where perfil_id = auth.uid())
  );

drop policy if exists "noticias: admin crea cualquiera" on noticias;
create policy "noticias: admin crea cualquiera" on noticias
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

drop policy if exists "noticias: admin actualiza" on noticias;
create policy "noticias: admin actualiza" on noticias
  for update using (exists (select 1 from perfiles where id = auth.uid() and es_admin = true));

-- ============================================================
-- Opcional pero recomendado: para que los anuncios PROGRAMADOS se
-- publiquen solos a su hora (no solo cuando alguien crea uno nuevo),
-- Supabase puede llamar nuestro endpoint cada pocos minutos con
-- pg_cron + pg_net (Vercel Hobby no permite crons tan seguidos).
--
-- IMPORTANTE: antes de correr este bloque, reemplaza TU-DOMINIO y
-- TU_CRON_SECRET (el mismo valor que pusiste en Vercel como variable
-- de entorno CRON_SECRET) más abajo.
-- ============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$ begin
  perform cron.unschedule('publicar-anuncios-programados');
exception when others then null;
end $$;

select cron.schedule(
  'publicar-anuncios-programados',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-DOMINIO.vercel.app/api/cron/publicar-anuncios',
    headers := jsonb_build_object('Authorization', 'Bearer TU_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
