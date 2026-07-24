-- ============================================================
-- Subastas: cualquier cuenta (individual o tienda) con plan Zafiro o
-- superior puede subastar una carta/producto. Cualquiera con sesión puede
-- pujar; cada puja debe superar el precio actual + el incremento mínimo,
-- y la subasta debe seguir activa y no haber pasado su fecha_fin (esto se
-- valida directo en la política de RLS, no solo en el cliente).
--
-- No hay cron para "cerrar" la subasta al llegar fecha_fin -- el plan
-- Hobby de Vercel solo permite crons de una vez al día, insuficiente para
-- esto. En vez de eso, el cierre se calcula: cualquier vista que lea una
-- subasta compara `now() > fecha_fin` del lado del cliente, y el ganador
-- es, de una vez, quien tenga la puja más alta (no se guarda aparte).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists subastas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tcg text not null default 'pokemon',
  tipo text not null default 'carta' check (tipo in ('carta', 'sellado', 'accesorio')),
  producto text not null,
  set_nombre text,
  condicion text check (condicion is null or condicion in ('GM', 'NM', 'LP', 'MP', 'HP', 'DMG')),
  idioma text check (idioma is null or idioma in ('EN', 'ES', 'JP')),
  card_api_id text,
  imagen_url text,
  foto_real_url text,
  foto_real_reverso_url text,
  descripcion text,
  zona text,
  precio_inicial numeric not null,
  incremento_minimo numeric not null default 10,
  precio_actual numeric not null,
  fecha_fin timestamptz not null,
  estado text not null default 'activa' check (estado in ('activa', 'cerrada', 'cancelada')),
  created_at timestamptz not null default now()
);

create index if not exists subastas_estado_idx on subastas (estado, fecha_fin);

create table if not exists subasta_pujas (
  id uuid primary key default gen_random_uuid(),
  subasta_id uuid not null references subastas(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  monto numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists subasta_pujas_subasta_idx on subasta_pujas (subasta_id, monto desc);

-- Cada puja válida (la política de RLS ya solo deja pasar pujas que
-- superan precio_actual + incremento_minimo) actualiza el precio_actual
-- de la subasta -- security definer porque quien puja no es dueño de la
-- fila de subastas y por RLS normal no podría actualizarla.
create or replace function subasta_actualizar_precio() returns trigger as $$
begin
  update subastas set precio_actual = new.monto where id = new.subasta_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists subasta_puja_trigger on subasta_pujas;
create trigger subasta_puja_trigger after insert on subasta_pujas
  for each row execute function subasta_actualizar_precio();

alter table subastas enable row level security;
alter table subasta_pujas enable row level security;

drop policy if exists "subastas: lectura publica" on subastas;
create policy "subastas: lectura publica" on subastas for select using (true);

drop policy if exists "subastas: zafiro o superior puede crear" on subastas;
create policy "subastas: zafiro o superior puede crear" on subastas
  for insert with check (
    perfil_id = auth.uid()
    and exists (
      select 1 from perfiles where id = auth.uid()
        and plan in ('superball', 'ultraball', 'masterball', 'enteball')
    )
  );

drop policy if exists "subastas: el vendedor o admin actualiza" on subastas;
create policy "subastas: el vendedor o admin actualiza" on subastas
  for update using (
    perfil_id = auth.uid()
    or exists (select 1 from perfiles where id = auth.uid() and es_admin = true)
  );

drop policy if exists "subastas: el vendedor o admin borra" on subastas;
create policy "subastas: el vendedor o admin borra" on subastas
  for delete using (
    perfil_id = auth.uid()
    or exists (select 1 from perfiles where id = auth.uid() and es_admin = true)
  );

drop policy if exists "subasta_pujas: lectura publica" on subasta_pujas;
create policy "subasta_pujas: lectura publica" on subasta_pujas for select using (true);

drop policy if exists "subasta_pujas: puja valida de cualquiera con sesion" on subasta_pujas;
create policy "subasta_pujas: puja valida de cualquiera con sesion" on subasta_pujas
  for insert with check (
    perfil_id = auth.uid()
    and exists (
      select 1 from subastas s
      where s.id = subasta_pujas.subasta_id
        and s.estado = 'activa'
        and s.fecha_fin > now()
        and s.perfil_id <> auth.uid()
        and subasta_pujas.monto >= s.precio_actual + s.incremento_minimo
    )
  );
