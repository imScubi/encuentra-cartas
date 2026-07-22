-- ============================================================
-- Link propio por perfil y por tienda: en vez de que todos compartan la
-- misma URL genérica, cada quien tiene su propio "slug" legible basado en
-- su nombre (ej. "carta-magica-monterrey"), para compartir en su Google
-- Business Profile, redes sociales, tarjetas, etc.
--
-- Si dos nombres generan el mismo slug, se le agrega "-2", "-3"... al
-- segundo/tercero en vez de bloquear el nombre — así nadie se queda sin
-- poder registrarse solo porque alguien más ya se llama parecido.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

create extension if not exists unaccent;

create or replace function slugify(texto text) returns text as $$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(lower(unaccent(coalesce(texto, ''))), '[^a-z0-9]+', '-', 'g'),
        '-+', '-', 'g'
      )
    ),
  '')
$$ language sql immutable;

alter table perfiles add column if not exists slug text;
alter table tiendas add column if not exists slug text;

-- Slug base a partir del nombre; si queda vacío (nombre sin letras/números
-- reconocibles), usa un identificador corto en vez de dejarlo en blanco.
update perfiles set slug = coalesce(slugify(nombre), 'usuario-' || substr(id::text, 1, 8)) where slug is null;
update tiendas set slug = coalesce(slugify(nombre), 'tienda-' || substr(id::text, 1, 8)) where slug is null;

-- Deduplicar: al segundo, tercero, etc. con el mismo slug se le agrega "-2", "-3"...
with numerados as (
  select id, row_number() over (partition by slug order by id) as rn
  from perfiles
)
update perfiles p set slug = p.slug || '-' || numerados.rn
from numerados
where p.id = numerados.id and numerados.rn > 1;

with numerados as (
  select id, row_number() over (partition by slug order by id) as rn
  from tiendas
)
update tiendas t set slug = t.slug || '-' || numerados.rn
from numerados
where t.id = numerados.id and numerados.rn > 1;

alter table perfiles alter column slug set not null;
alter table tiendas alter column slug set not null;

do $$ begin
  alter table perfiles add constraint perfiles_slug_key unique (slug);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table tiendas add constraint tiendas_slug_key unique (slug);
exception when duplicate_object then null;
end $$;
