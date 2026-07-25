-- ============================================================
-- Carpetas: modo manual (sin foto/IA) + vitrina pública tipo álbum.
--
-- Hasta ahora una carpeta era solo una etiqueta interna usada durante la
-- creación (foto de página + detección por IA); una vez publicadas, esas
-- cartas se veían mezcladas con el resto del inventario, sin ninguna forma
-- de que un comprador las viera organizadas "como el álbum físico" del
-- vendedor. Esto agrega:
--   1) columnas/filas: el tamaño de página del álbum (ej. 4x3 = 12
--      cartas por página), para poder paginar la vitrina pública igual
--      que se hojea un álbum de verdad.
--   2) Lectura pública de carpetas (antes solo el dueño podía verla) --
--      son solo metadatos (nombre, tamaño de página), no fotos privadas
--      (carpeta_fotos sigue siendo solo del dueño).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table carpetas add column if not exists columnas integer not null default 4;
alter table carpetas add column if not exists filas integer not null default 3;

alter table carpetas drop constraint if exists carpetas_columnas_check;
alter table carpetas add constraint carpetas_columnas_check check (columnas between 2 and 6);
alter table carpetas drop constraint if exists carpetas_filas_check;
alter table carpetas add constraint carpetas_filas_check check (filas between 2 and 6);

drop policy if exists "carpetas: lectura publica" on carpetas;
create policy "carpetas: lectura publica" on carpetas for select using (true);
