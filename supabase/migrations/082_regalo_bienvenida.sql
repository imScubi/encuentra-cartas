-- Regalo de bienvenida automático: hasta ahora se asignaba a mano, por
-- cuenta nueva, un mes gratis del plan tope de su tipo de cuenta (Diamante
-- para individual, Aurora para tienda) -- sin fecha de vencimiento real
-- (plan_vence quedaba NULL), lo que en la práctica les daba el plan PARA
-- SIEMPRE (planDe() solo revierte a Cuarzo cuando plan_vence está puesto Y
-- ya pasó -- con NULL esa condición nunca se cumple). Esta migración
-- automatiza el regalo (ahora de 1 día, no un mes) y lo hace expirar de
-- verdad.
--
-- De paso, revisando cómo proteger este regalo, se encontró que hoy
-- CUALQUIER usuario autenticado puede hacer un PATCH directo a su propia
-- fila de `perfiles` y ponerse plan='enteball' + plan_vence lejano él
-- mismo -- la política RLS "Usuarios actualizan su propio perfil" (UPDATE,
-- qual: id = auth.uid()) no restringe qué columnas se pueden cambiar, solo
-- qué fila. Un trigger cierra ese hueco sin tocar los flujos legítimos que
-- sí necesitan escribir estas columnas: el webhook de Mercado Pago (usa la
-- Service Role Key, auth.role() = 'service_role'), el panel de Admin (ya
-- tiene su propia política RLS "perfiles: admin actualiza cualquiera" para
-- cambiarle el plan a cualquiera a mano -- se sigue permitiendo igual que
-- antes), y esta función nueva (se anuncia a sí misma con un flag de
-- sesión de un solo uso).

alter table perfiles add column if not exists regalo_bienvenida_otorgado boolean not null default false;

create or replace function perfiles_otorgar_regalo_bienvenida()
returns table(plan text, plan_vence timestamptz)
language plpgsql security definer as $$
declare
  v_tipo text;
  v_ya boolean;
  v_plan text;
  v_vence timestamptz;
begin
  select p.tipo, p.regalo_bienvenida_otorgado into v_tipo, v_ya from perfiles p where p.id = auth.uid();
  if v_tipo is null or v_ya then
    return; -- perfil no encontrado, o ya se le dio su regalo antes -- no se repite
  end if;

  v_plan := case when v_tipo = 'tienda' then 'enteball' else 'masterball' end;
  v_vence := now() + interval '1 day';

  -- Le avisa al trigger de abajo que este UPDATE sí puede tocar las
  -- columnas protegidas -- set_config(..., true) lo deja local a esta
  -- transacción (un solo request), nunca se filtra a otras conexiones.
  perform set_config('encuentracartas.bypass_perfil_protegido', 'on', true);
  update perfiles set plan = v_plan, plan_vence = v_vence, regalo_bienvenida_otorgado = true where id = auth.uid();

  return query select v_plan, v_vence;
end;
$$;

create or replace function perfiles_proteger_columnas_sensibles() returns trigger
language plpgsql security definer as $$
declare
  v_es_admin boolean;
begin
  if auth.role() = 'service_role' then
    return NEW; -- servidor (webhook de pagos, endpoints de Admin con Service Role Key)
  end if;
  if coalesce(current_setting('encuentracartas.bypass_perfil_protegido', true), '') = 'on' then
    return NEW; -- perfiles_otorgar_regalo_bienvenida(), justo arriba
  end if;
  select p.es_admin into v_es_admin from perfiles p where p.id = auth.uid();
  if v_es_admin then
    return NEW; -- un admin real gestionando cuentas a mano -- mismo permiso que ya tenía por su propia política RLS
  end if;

  -- Cualquier otro caso (un usuario normal intentando mandarle estas
  -- columnas a su propia fila): se ignoran, se quedan como estaban.
  NEW.plan := OLD.plan;
  NEW.plan_vence := OLD.plan_vence;
  NEW.es_admin := OLD.es_admin;
  NEW.mp_preapproval_id := OLD.mp_preapproval_id;
  NEW.aprobado := OLD.aprobado;
  NEW.gestionado_por := OLD.gestionado_por;
  NEW.diamante_desde := OLD.diamante_desde;
  NEW.regalo_bienvenida_otorgado := OLD.regalo_bienvenida_otorgado;
  return NEW;
end;
$$;

drop trigger if exists trg_perfiles_proteger_columnas_sensibles on perfiles;
create trigger trg_perfiles_proteger_columnas_sensibles
before update on perfiles
for each row execute function perfiles_proteger_columnas_sensibles();
