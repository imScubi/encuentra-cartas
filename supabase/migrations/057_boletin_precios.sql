-- ============================================================
-- Boletín semanal de precios: cada lunes se calculan las 20 cartas que
-- más subieron y las 20 que más bajaron de precio esa semana, por TCG
-- (arranca con Pokémon/Magic/Yu-Gi-Oh -- los únicos con una fuente de
-- precio real ya integrada; Lorcana/One Piece se agregan el día que haya
-- una fuente de precio confiable para ellos, ver comentario en
-- api/cron/recordatorios.js). El cálculo lo hace el cron diario existente
-- (api/cron/recordatorios.js), sin sumar cron ni función serverless
-- nueva (Vercel Hobby: 2 crons y 12 funciones, ya al tope).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

-- Una fila por carta rastreada, por semana -- para comparar el precio de
-- esta semana contra el de la semana pasada y sacar el % de cambio.
create table if not exists precio_historial_semanal (
  id uuid primary key default gen_random_uuid(),
  tcg text not null,
  card_api_id text not null,
  nombre text not null,
  set_nombre text,
  imagen_url text,
  precio_mxn numeric not null,
  semana date not null, -- el lunes de esa semana
  created_at timestamptz not null default now(),
  unique (tcg, card_api_id, semana)
);

create index if not exists precio_historial_semanal_tcg_semana_idx on precio_historial_semanal (tcg, semana);

-- El boletín ya armado (top subieron/bajaron + análisis en palabras
-- simples generado por IA) -- uno por tcg por semana, lectura pública
-- para que cualquiera pueda verlo sin sesión.
create table if not exists boletines (
  id uuid primary key default gen_random_uuid(),
  tcg text not null,
  semana date not null,
  top_suben jsonb not null default '[]',
  top_bajan jsonb not null default '[]',
  analisis text,
  created_at timestamptz not null default now(),
  unique (tcg, semana)
);

alter table boletines enable row level security;
drop policy if exists "boletines: lectura publica" on boletines;
create policy "boletines: lectura publica" on boletines for select using (true);

-- "Me interesa": quién quiere que le llegue el boletín de qué tcg por correo.
create table if not exists boletin_subscripciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tcg text not null,
  created_at timestamptz not null default now(),
  unique (perfil_id, tcg)
);

alter table boletin_subscripciones enable row level security;

drop policy if exists "boletin_subscripciones: dueno ve las suyas" on boletin_subscripciones;
create policy "boletin_subscripciones: dueno ve las suyas" on boletin_subscripciones
  for select using (perfil_id = auth.uid());

drop policy if exists "boletin_subscripciones: dueno se suscribe" on boletin_subscripciones;
create policy "boletin_subscripciones: dueno se suscribe" on boletin_subscripciones
  for insert with check (perfil_id = auth.uid());

drop policy if exists "boletin_subscripciones: dueno se da de baja" on boletin_subscripciones;
create policy "boletin_subscripciones: dueno se da de baja" on boletin_subscripciones
  for delete using (perfil_id = auth.uid());

-- precio_historial_semanal no necesita RLS de lectura pública -- solo lo
-- usa el cron (con la llave de servicio, que ignora RLS); no se consulta
-- desde el cliente.
alter table precio_historial_semanal enable row level security;
