-- ============================================================
-- Estado (condición) de la carta: hasta ahora "condicion" era texto libre
-- (el vendedor escribía lo que quisiera). Se vuelve un selector obligatorio
-- de 6 valores fijos (escala estándar de condición de cartas coleccionables):
-- GM (Gem Mint), NM (Near Mint), LP (Lightly Played), MP (Moderately Played),
-- HP (Heavily Played), DMG (Damaged).
--
-- También se agrega foto_real_url: una foto de la carta física que sube el
-- vendedor (distinta de imagen_url, que es la imagen de referencia del
-- catálogo), para que el comprador vea el desgaste real antes de contactar.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

-- Normalizamos los valores que ya existan en la base a uno de los 6 códigos
-- válidos antes de exigir el CHECK, para no romper filas ya publicadas.
update mercado_listings set condicion = upper(trim(condicion)) where condicion is not null;
update mercado_listings set condicion = 'GM' where condicion ~* 'GEM ?MINT';
update mercado_listings set condicion = 'DMG' where condicion ~* 'DAMAGED|DAÑAD';
update mercado_listings set condicion = 'HP' where condicion ~* 'HEAVILY';
update mercado_listings set condicion = 'MP' where condicion ~* 'MODERATELY';
update mercado_listings set condicion = 'LP' where condicion ~* 'LIGHTLY';
update mercado_listings set condicion = 'NM' where condicion ~* 'NEAR ?MINT';
update mercado_listings set condicion = 'NM' where tipo = 'carta' and (condicion is null or condicion not in ('GM','NM','LP','MP','HP','DMG'));

update inventario_tienda set condicion = upper(trim(condicion)) where condicion is not null;
update inventario_tienda set condicion = 'GM' where condicion ~* 'GEM ?MINT';
update inventario_tienda set condicion = 'DMG' where condicion ~* 'DAMAGED|DAÑAD';
update inventario_tienda set condicion = 'HP' where condicion ~* 'HEAVILY';
update inventario_tienda set condicion = 'MP' where condicion ~* 'MODERATELY';
update inventario_tienda set condicion = 'LP' where condicion ~* 'LIGHTLY';
update inventario_tienda set condicion = 'NM' where condicion ~* 'NEAR ?MINT';
update inventario_tienda set condicion = 'NM' where condicion is null or condicion not in ('GM','NM','LP','MP','HP','DMG');

do $$ begin
  alter table mercado_listings add constraint mercado_listings_condicion_check check (tipo <> 'carta' or condicion in ('GM','NM','LP','MP','HP','DMG'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table inventario_tienda add constraint inventario_tienda_condicion_check check (condicion in ('GM','NM','LP','MP','HP','DMG'));
exception when duplicate_object then null;
end $$;

alter table mercado_listings add column if not exists foto_real_url text;
alter table inventario_tienda add column if not exists foto_real_url text;
