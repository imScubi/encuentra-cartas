// Traduce mensajes de error técnicos (Postgres/PostgREST, fetch, JS) a una
// explicación breve en español para quien no programa -- pensado para el
// correo/push que le llega al admin cuando algo falla (ver
// api/errores/reportar.js). El mensaje técnico completo se sigue mandando
// también, para quien necesite depurarlo de verdad.
export function explicarError(mensaje) {
  const m = String(mensaje || "");

  if (/invalid input syntax for type uuid/i.test(m)) {
    return "Una parte de la app mandó un identificador vacío o inválido a una consulta que esperaba uno real (por ejemplo, buscar seguidores de una tienda sin cuenta vinculada). Nadie debería haber visto un error en pantalla, pero conviene revisar esa consulta.";
  }
  if (/duplicate key value violates unique constraint|\b23505\b/i.test(m)) {
    return "Se intentó guardar algo que ya existía y debía ser único (por ejemplo, un mismo enlace/slug, o registrar la misma suscripción de notificaciones dos veces).";
  }
  if (/violates foreign key constraint/i.test(m)) {
    return "Se intentó guardar o borrar algo que todavía está conectado a otro dato (por ejemplo, borrar una tienda o un perfil que aún tiene publicaciones o ventas relacionadas).";
  }
  if (/violates row-level security policy|permission denied for/i.test(m)) {
    return "Algo intentó leer o modificar datos sin el permiso necesario -- conviene revisar las políticas de seguridad (RLS) de esa tabla.";
  }
  if (/JWT|token is expired|invalid token|invalid claim/i.test(m)) {
    return "La sesión de quien usaba la app expiró o el token de acceso no era válido -- lo más probable es que solo necesitara volver a iniciar sesión.";
  }
  if (/Error consultando \(400\)|Error guardando \(400\)/i.test(m)) {
    return "Una consulta a la base de datos estaba mal formada (por ejemplo, un filtro con un valor vacío o de un tipo incorrecto) y el servidor la rechazó antes de ejecutarla.";
  }
  if (/Error consultando \((401|403)\)|Error guardando \((401|403)\)/i.test(m)) {
    return "Una consulta fue rechazada por falta de permisos.";
  }
  if (/Error consultando \(404\)|Error guardando \(404\)/i.test(m)) {
    return "Se buscó o intentó modificar algo que ya no existe (un registro borrado, o una liga vieja).";
  }
  if (/Error consultando \(5\d\d\)|Error guardando \(5\d\d\)/i.test(m)) {
    return "El servidor de la base de datos falló al procesar la consulta -- normalmente es algo temporal.";
  }
  if (/Failed to fetch|NetworkError|network request failed|ERR_INTERNET_DISCONNECTED/i.test(m)) {
    return "El navegador de quien lo vivió no pudo conectarse a internet o al servidor en ese momento (señal débil, o el sitio tardó demasiado en responder).";
  }
  if (/Cannot read propert(y|ies) of (undefined|null)/i.test(m)) {
    return "El programa intentó usar un dato que todavía no estaba listo (por ejemplo, la pantalla se dibujó antes de que terminara de cargar la información).";
  }
  if (/is not a function/i.test(m)) {
    return "El código intentó llamar algo que no era una función en ese momento -- normalmente porque un dato llegó con una forma distinta a la esperada.";
  }
  if (/Gemini|generativelanguage/i.test(m)) {
    return "Falló una llamada a la IA (Gemini) que se usa para detectar cartas o moderar fotos -- normalmente es temporal, del lado de Google. El sistema está diseñado para dejar pasar la acción del usuario en vez de bloquearla cuando esto pasa.";
  }
  if (/timeout|timed out|ETIMEDOUT/i.test(m)) {
    return "Una operación tardó demasiado y se canceló sola.";
  }
  if (/quota|rate limit|too many requests|\b429\b/i.test(m)) {
    return "Se alcanzó un límite de uso de algún servicio externo (la IA, o una API de precios/catálogo) -- normalmente se resuelve solo después de un rato.";
  }

  return null; // Patrón no reconocido -- se manda solo el mensaje técnico, sin explicación inventada.
}
