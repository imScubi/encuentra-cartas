-- ============================================================
-- Gradeo de la carta (opcional): el vendedor puede indicar que su carta
-- fue gradeada por una empresa profesional (PSA, CGC, BGS, TAG, Value UP,
-- u "otro" con el nombre a mano) y su calificación. Para BGS, el 10 se
-- divide en "10 Gem Mint", "10 Pristine" y "10 Black Label" en vez de un
-- simple "10" (la UI ya se encarga de mostrar esas opciones solo cuando
-- se elige BGS).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mercado_listings add column if not exists gradeada boolean not null default false;
alter table mercado_listings add column if not exists grado_empresa text;
alter table mercado_listings add column if not exists grado_empresa_otro text;
alter table mercado_listings add column if not exists grado_calificacion text;

alter table inventario_tienda add column if not exists gradeada boolean not null default false;
alter table inventario_tienda add column if not exists grado_empresa text;
alter table inventario_tienda add column if not exists grado_empresa_otro text;
alter table inventario_tienda add column if not exists grado_calificacion text;

do $$ begin
  alter table mercado_listings add constraint mercado_listings_grado_empresa_check check (grado_empresa is null or grado_empresa in ('PSA','CGC','BGS','TAG','VALUE_UP','OTRO'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table inventario_tienda add constraint inventario_tienda_grado_empresa_check check (grado_empresa is null or grado_empresa in ('PSA','CGC','BGS','TAG','VALUE_UP','OTRO'));
exception when duplicate_object then null;
end $$;
