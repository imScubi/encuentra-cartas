-- La migración 080 le agregó `p_tablero_id` a coleccion_registrar_entrada/
-- salida vía "create or replace function" -- pero en Postgres, agregar un
-- parámetro NO reemplaza la función existente, crea una SEGUNDA función
-- sobrecargada (mismo nombre, distinta firma). Confirmado contra el
-- proyecto real de Supabase: las dos versiones (13/11 args sin
-- p_tablero_id, Y 14/12 args con p_tablero_id) coexistían en producción.
--
-- Esto es un bug activo, no solo deuda técnica:
--   - La versión vieja de `coleccion_registrar_entrada` todavía apunta su
--     `on conflict (perfil_id, tcg, card_api_id)` a la restricción que la
--     080 YA BORRÓ (coleccion_usuario_perfil_id_tcg_card_api_id_key) --
--     si PostgREST la llega a elegir, truena con "no unique or exclusion
--     constraint matching the ON CONFLICT specification".
--   - La versión vieja de `coleccion_registrar_salida` no filtra por
--     tablero_id -- si PostgREST la elige, puede borrar/restar de la fila
--     equivocada (de otro tablero) bajo el modelo nuevo de varios tableros.
--   - Modo Evento (App.jsx, registrarAdquisicionDeIntercambio) llama a
--     coleccion_registrar_entrada SIN mandar p_tablero_id -- exactamente
--     el caso que puede chocar con cualquiera de las dos firmas.
--
-- Se borran las firmas viejas explícitamente. Las firmas nuevas (con
-- p_tablero_id uuid default null) se quedan intactas -- funcionan igual
-- para quien no manda p_tablero_id (cae en coleccion_resolver_tablero_
-- principal()) como para quien sí lo manda.
drop function if exists public.coleccion_registrar_entrada(
  uuid, text, text, text, text, text, integer, numeric, text, numeric, uuid, numeric, text
);
drop function if exists public.coleccion_registrar_salida(
  uuid, text, text, text, text, integer, text, numeric, uuid, numeric, text
);
