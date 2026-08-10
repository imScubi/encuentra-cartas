-- ============================================================
-- Indicador de "tiempo de respuesta" del vendedor (ej. "Responde rápido"
-- en el detalle de una publicación) -- para que quien está por comprar
-- sepa qué tan probable es recibir respuesta pronto antes de contactar.
--
-- Se calcula con un promedio corrido guardado directo en perfiles, NO
-- consultando el contenido de la tabla mensajes desde el navegador: los
-- mensajes son privados (RLS solo deja leer los tuyos), así que exponer
-- "cuánto tardó X en responder" a cualquier visitante requeriría abrir
-- esos mensajes o construir una vista que los cuente -- ambas cosas
-- filtran más de lo necesario. En cambio, un trigger en el servidor
-- actualiza dos columnas agregadas en perfiles cada vez que alguien
-- responde a un mensaje, y esas sí son públicas (mismo perímetro que el
-- resto de perfiles: nombre, plan, etc.).
--
-- Cómo aplicar: copia y pega en Supabase → SQL Editor → Run.
-- ============================================================

alter table perfiles add column if not exists tiempo_respuesta_promedio_minutos numeric;
alter table perfiles add column if not exists tiempo_respuesta_conteo integer not null default 0;

create or replace function public.actualizar_tiempo_respuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  anterior record;
  delta_minutos numeric;
  cnt integer;
  avg_actual numeric;
begin
  -- Busca el mensaje inmediatamente anterior entre estas dos personas
  -- (cualquier contexto/publicación, es la misma conversación humana).
  select de_perfil_id, created_at
  into anterior
  from public.mensajes
  where id <> new.id
    and ((de_perfil_id = new.de_perfil_id and para_perfil_id = new.para_perfil_id)
      or (de_perfil_id = new.para_perfil_id and para_perfil_id = new.de_perfil_id))
    and created_at < new.created_at
  order by created_at desc
  limit 1;

  -- Solo cuenta como "respuesta" si el mensaje anterior lo mandó la OTRA
  -- persona -- si el anterior ya era de new.de_perfil_id, esto es un
  -- mensaje seguido (aclarando algo, mandando otra foto, etc.), no una
  -- respuesta nueva.
  if anterior.de_perfil_id = new.para_perfil_id then
    delta_minutos := extract(epoch from (new.created_at - anterior.created_at)) / 60.0;

    -- Se ignoran respuestas de más de 7 días: seguramente es una
    -- conversación retomada después de mucho tiempo, no algo que refleje
    -- qué tan rápido responde la persona en general.
    if delta_minutos >= 0 and delta_minutos <= 10080 then
      select tiempo_respuesta_conteo, tiempo_respuesta_promedio_minutos
      into cnt, avg_actual
      from public.perfiles where id = new.de_perfil_id;

      cnt := coalesce(cnt, 0);
      avg_actual := coalesce(avg_actual, 0);

      update public.perfiles
      set tiempo_respuesta_conteo = cnt + 1,
          tiempo_respuesta_promedio_minutos = ((avg_actual * cnt) + delta_minutos) / (cnt + 1)
      where id = new.de_perfil_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tiempo_respuesta on public.mensajes;
create trigger trg_tiempo_respuesta
after insert on public.mensajes
for each row execute function public.actualizar_tiempo_respuesta();

-- Backfill de una sola vez: recalcula el promedio con el historial de
-- mensajes que ya existía ANTES de que el trigger de arriba empezara a
-- correr, para que el indicador no arranque en blanco para todos y
-- tarde semanas en llenarse con mensajes nuevos. Es seguro volver a
-- correr esta parte sola más adelante: recalcula desde cero, no suma
-- encima de lo que ya había (evita duplicar el conteo).
with ordenados as (
  select
    id, de_perfil_id, para_perfil_id, created_at,
    lag(de_perfil_id) over (
      partition by least(de_perfil_id, para_perfil_id), greatest(de_perfil_id, para_perfil_id)
      order by created_at
    ) as anterior_de,
    lag(created_at) over (
      partition by least(de_perfil_id, para_perfil_id), greatest(de_perfil_id, para_perfil_id)
      order by created_at
    ) as anterior_creado
  from public.mensajes
),
respuestas as (
  select
    de_perfil_id,
    extract(epoch from (created_at - anterior_creado)) / 60.0 as delta_minutos
  from ordenados
  where anterior_de = para_perfil_id
    and anterior_creado is not null
    and extract(epoch from (created_at - anterior_creado)) / 60.0 between 0 and 10080
),
agregado as (
  select de_perfil_id, count(*) as cnt, avg(delta_minutos) as promedio
  from respuestas
  group by de_perfil_id
)
update public.perfiles p
set tiempo_respuesta_conteo = a.cnt,
    tiempo_respuesta_promedio_minutos = a.promedio
from agregado a
where p.id = a.de_perfil_id;
