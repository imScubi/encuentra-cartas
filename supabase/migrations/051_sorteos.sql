-- ============================================================
-- Sorteos: Admin y tiendas con plan Aurora (enteball) pueden organizar un
-- sorteo con premio. Cualquier usuario con sesión puede "Participar"
-- (1 boleto). Gana más boletos (más probabilidad, no garantía) por:
--   - Compartir el link del sorteo (+1 boleto, una sola vez).
--   - Que un usuario NUEVO se registre a través de su link de referido
--     (+2 boletos al que refirió, y el nuevo usuario entra automático
--     con 1 boleto propio).
-- El "elegir ganador" es un sorteo aleatorio ponderado por boletos, hecho
-- del lado del cliente por quien organiza (o Admin) al cerrar el sorteo.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create table if not exists sorteos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles(id) on delete cascade, -- quien lo organiza (Admin o dueño de la tienda Aurora)
  tienda_id uuid references tiendas(id) on delete set null, -- opcional: si lo organiza una tienda, para mostrar "Sorteo de X"
  titulo text not null,
  descripcion text,
  premio text not null,
  imagen_url text,
  fecha_fin timestamptz not null,
  estado text not null default 'activo' check (estado in ('activo', 'cerrado', 'cancelado')),
  ganador_perfil_id uuid references perfiles(id) on delete set null,
  elegido_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sorteos_estado_idx on sorteos (estado, fecha_fin);

create table if not exists sorteo_participantes (
  id uuid primary key default gen_random_uuid(),
  sorteo_id uuid not null references sorteos(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  boletos integer not null default 1,
  compartido boolean not null default false, -- ya reclamó el bono de compartir, para no poder reclamarlo varias veces
  created_at timestamptz not null default now(),
  unique (sorteo_id, perfil_id)
);

create index if not exists sorteo_participantes_sorteo_idx on sorteo_participantes (sorteo_id);

-- Un renglón por cada usuario NUEVO que se registró vía el link de
-- referido de otro participante. nuevo_perfil_id es unique a propósito:
-- cada usuario nuevo solo puede disparar el bono de su referente UNA vez
-- en toda su vida (sin importar cuántas veces se reintente el insert desde
-- el cliente después de registrarse).
create table if not exists sorteo_referidos (
  id uuid primary key default gen_random_uuid(),
  sorteo_id uuid not null references sorteos(id) on delete cascade,
  referente_perfil_id uuid not null references perfiles(id) on delete cascade,
  nuevo_perfil_id uuid not null unique references perfiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Al insertarse un referido: +2 boletos a quien refirió (si ya
-- participaba -- si no, no hay a quién sumarle) y entra automáticamente
-- el nuevo usuario al sorteo con 1 boleto propio (si no estaba ya).
-- security definer porque el nuevo usuario, con su propia sesión, no
-- tendría permiso de RLS para modificar el renglón de OTRO participante
-- (el referente) directamente.
create or replace function sorteo_procesar_referido() returns trigger as $$
begin
  update sorteo_participantes set boletos = boletos + 2
    where sorteo_id = new.sorteo_id and perfil_id = new.referente_perfil_id;
  insert into sorteo_participantes (sorteo_id, perfil_id, boletos)
    values (new.sorteo_id, new.nuevo_perfil_id, 1)
    on conflict (sorteo_id, perfil_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists sorteo_referido_trigger on sorteo_referidos;
create trigger sorteo_referido_trigger after insert on sorteo_referidos
  for each row execute function sorteo_procesar_referido();

-- Bono de compartir (+1 boleto, una sola vez): una función security
-- definer en vez de dejar que el cliente actualice "boletos" directamente
-- por RLS (si no, cualquiera podría mandarse boletos infinitos a mano).
create or replace function sorteo_reclamar_bono_compartir(p_sorteo_id uuid) returns void as $$
begin
  update sorteo_participantes
    set boletos = boletos + 1, compartido = true
    where sorteo_id = p_sorteo_id and perfil_id = auth.uid() and compartido = false;
end;
$$ language plpgsql security definer;

alter table sorteos enable row level security;
alter table sorteo_participantes enable row level security;
alter table sorteo_referidos enable row level security;

drop policy if exists "sorteos: lectura publica" on sorteos;
create policy "sorteos: lectura publica" on sorteos for select using (true);

drop policy if exists "sorteos: admin o tienda aurora puede crear" on sorteos;
create policy "sorteos: admin o tienda aurora puede crear" on sorteos
  for insert with check (
    perfil_id = auth.uid()
    and exists (
      select 1 from perfiles where id = auth.uid()
        and (es_admin = true or plan = 'enteball')
    )
  );

drop policy if exists "sorteos: el organizador o admin actualiza" on sorteos;
create policy "sorteos: el organizador o admin actualiza" on sorteos
  for update using (
    perfil_id = auth.uid()
    or exists (select 1 from perfiles where id = auth.uid() and es_admin = true)
  );

drop policy if exists "sorteos: el organizador o admin borra" on sorteos;
create policy "sorteos: el organizador o admin borra" on sorteos
  for delete using (
    perfil_id = auth.uid()
    or exists (select 1 from perfiles where id = auth.uid() and es_admin = true)
  );

drop policy if exists "sorteo_participantes: lectura publica" on sorteo_participantes;
create policy "sorteo_participantes: lectura publica" on sorteo_participantes for select using (true);

drop policy if exists "sorteo_participantes: cualquiera con sesion se une" on sorteo_participantes;
create policy "sorteo_participantes: cualquiera con sesion se une" on sorteo_participantes
  for insert with check (perfil_id = auth.uid());

drop policy if exists "sorteo_referidos: lectura publica" on sorteo_referidos;
create policy "sorteo_referidos: lectura publica" on sorteo_referidos for select using (true);

drop policy if exists "sorteo_referidos: el nuevo usuario registra su referido" on sorteo_referidos;
create policy "sorteo_referidos: el nuevo usuario registra su referido" on sorteo_referidos
  for insert with check (nuevo_perfil_id = auth.uid());

-- Bucket para la imagen del sorteo (portada del premio).
insert into storage.buckets (id, name, public)
values ('sorteos', 'sorteos', true)
on conflict (id) do nothing;

drop policy if exists "sorteos-storage: lectura publica" on storage.objects;
create policy "sorteos-storage: lectura publica" on storage.objects
  for select using (bucket_id = 'sorteos');

drop policy if exists "sorteos-storage: usuario sube a su carpeta" on storage.objects;
create policy "sorteos-storage: usuario sube a su carpeta" on storage.objects
  for insert with check (bucket_id = 'sorteos' and (storage.foldername(name))[1] = auth.uid()::text);
