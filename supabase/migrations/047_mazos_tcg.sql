-- ============================================================
-- Separar los mazos (Deck Builder) por TCG. Antes todos los mazos eran
-- implícitamente de Pokémon; se agrega la columna con default 'pokemon'
-- para no romper los mazos que ya existen.
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table mazos add column if not exists tcg text not null default 'pokemon';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.mazos'::regclass and conname = 'mazos_tcg_check'
  ) then
    alter table mazos add constraint mazos_tcg_check check (tcg in ('pokemon', 'yugioh', 'lorcana', 'magic', 'onepiece'));
  end if;
end $$;
