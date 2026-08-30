import { sbWrite } from "./supabase.js";
import { reportarError } from "./errorReporting.jsx";

// ---- Modo Evento sin internet: cola de sincronización ----
//
// Las 4 tablas de Modo Evento (eventos/evento_ventas/evento_gastos/
// evento_adquisiciones, ver 070_modo_evento.sql) usan
// `id uuid primary key default gen_random_uuid()` -- ese default solo
// aplica si la columna se omite del INSERT. Si el cliente manda su propio
// `id` (nuevoId() de aquí abajo), Postgres lo usa tal cual, así que un
// registro nuevo tiene su ID final desde que se crea en el navegador, sin
// importar si llega a Supabase al toque o minutos después. Por eso nunca
// hace falta "reemplazar un ID temporal por el real" en ningún lado -- ni
// en la propia fila ni en sus FK (evento_id, origen_venta_id).
//
// Las policies RLS de las 3 tablas hijas exigen que la fila padre
// (eventos) ya exista en la base al insertar una hija -- por eso la cola
// de abajo SIEMPRE reproduce las operaciones en el mismo orden en que se
// encolaron (nunca en paralelo, nunca reordenada): si se crea un evento y
// se le agregan ventas offline, el insert del evento tiene que llegar a
// Supabase antes que el de sus ventas, y el único jeito de garantizar eso
// es respetar el orden de la cola al pie de la letra.

export function nuevoId() {
  return crypto.randomUUID();
}

export function nuevoTimestamp() {
  return new Date().toISOString();
}

// TypeError cubre "Failed to fetch" (Chrome), "NetworkError..." (Firefox)
// y "Load failed" (Safari) de forma uniforme, sin parsear mensajes -- y
// excluye AbortError (es un DOMException, no un TypeError). ambiguoDeRed
// lo marca sbWrite (supabase.js) cuando la respuesta fue 2xx pero el body
// no se pudo leer completo (conexión cortada justo después de que el
// servidor sí guardó) -- no sabemos si de verdad se guardó o no, así que
// se trata igual que un error de red: se reintenta más tarde y se confía
// en el choque de llave única (23505) para notar que ya se había guardado.
export function esErrorDeRed(e) {
  return e instanceof TypeError || e?.ambiguoDeRed === true;
}

const CLAVE_COLA = "ec_evento_queue";

function leerLS(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : porDefecto;
  } catch {
    return porDefecto;
  }
}

// Una cuota de localStorage llena (o modo privado sin storage) nunca debe
// tronar la UI -- mismo criterio que ya usa wishlistImagen.js con
// imágenes rotas: se pierde el guardado local, no la función.
function guardarLS(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {}
}

export function leerCola() {
  return leerLS(CLAVE_COLA, []);
}

export function contarCola() {
  return leerCola().length;
}

export function colaTieneAlgo() {
  return contarCola() > 0;
}

// Lectura + escritura del array SIN ningún await en medio -- dos
// guardados que fallan por red "al mismo tiempo" en la práctica nunca
// corren de verdad en paralelo en JS de un solo hilo, pero esta función
// solo se llama desde dentro de un catch ya resuelto, así que hace falta
// que el push sea atómico respecto a cualquier otra llamada a
// agregarACola en el mismo tick para que el orden de la cola sea
// exactamente el orden en que se intentaron los guardados.
function agregarACola(entrada) {
  const cola = leerCola();
  cola.push({ id: nuevoId(), ts: nuevoTimestamp(), ...entrada });
  guardarLS(CLAVE_COLA, cola);
}

function quitarDeCola(id) {
  guardarLS(CLAVE_COLA, leerCola().filter((e) => e.id !== id));
}

// Reemplazo de sbWrite para los guardados de Modo Evento: si sbWrite tira
// por una razón de red, encola la operación para reintentarla después y
// devuelve una fila "de mentiras" marcada _pendiente para que el llamador
// (que ya hace `const [fila] = await sbWriteConCola(...)`) siga
// funcionando igual que si hubiera guardado de verdad. Si tira por
// cualquier otra razón (validación, permisos, etc.), la deja pasar tal
// cual -- eso sí es un error real, nunca debe encolarse.
export async function sbWriteConCola(method, path, body, session, { label } = {}) {
  try {
    return await sbWrite(method, path, body, session);
  } catch (e) {
    if (!esErrorDeRed(e)) throw e;
    agregarACola({ method, path, body, label: label || null });
    return [{ ...body, _pendiente: true }];
  }
}

// Reintenta la cola en orden estricto contra Supabase. Nunca la
// reordena ni la procesa en paralelo -- ver el comentario del principio
// de este archivo sobre por qué el orden es un invariante duro, no una
// optimización.
export async function sincronizarCola(session) {
  const cola = leerCola();
  const fallos = [];
  let sincronizados = 0;
  for (const entrada of cola) {
    try {
      await sbWrite(entrada.method, entrada.path, entrada.body, session);
      quitarDeCola(entrada.id);
      sincronizados++;
    } catch (e) {
      if (esErrorDeRed(e)) {
        // Seguimos sin señal (o volvió a cortarse a medias) -- paramos aquí
        // mismo, sin tocar el resto de la cola, y lo volvemos a intentar la
        // próxima vez que se dispare la sincronización.
        break;
      }
      if (e?.code === "23505") {
        // No es una falla real: el insert anterior sí había llegado a
        // Supabase (por eso choca la llave única al reintentarlo con el
        // mismo id generado en el cliente) y solo se perdió la respuesta
        // en el camino -- se quita de la cola como si hubiera
        // sincronizado bien, sin avisar nada.
        quitarDeCola(entrada.id);
        sincronizados++;
        continue;
      }
      // Falla real (ej. RLS rechazó porque el evento padre se borró desde
      // otro dispositivo mientras este estaba offline): se quita esa
      // entrada para no bloquear el resto de la cola para siempre, y se
      // reporta -- puede haber varias seguidas si un evento borrado tumba
      // a todas sus ventas/gastos/compras hijas de un jalón.
      quitarDeCola(entrada.id);
      fallos.push({ ...entrada, error: e.message });
      reportarError(`Modo Evento offline: no se pudo sincronizar ${entrada.method} ${entrada.path}: ${e.message}`);
    }
  }
  return { sincronizados, fallos };
}

// ---- Caché local de lo último visto, para poder seguir viendo (y
// agregando) sin señal una vez que ya cargó al menos una vez. ----
const claveCacheEvento = (eventoId) => `ec_evento_cache_${eventoId}`;
const CLAVE_CACHE_EVENTOS = "ec_eventos_cache";

export function guardarCacheEvento(eventoId, { ventas, gastos, adquisiciones }) {
  guardarLS(claveCacheEvento(eventoId), { ventas, gastos, adquisiciones, guardadoEn: nuevoTimestamp() });
}

export function leerCacheEvento(eventoId) {
  return leerLS(claveCacheEvento(eventoId), null);
}

export function guardarCacheEventos(eventos) {
  guardarLS(CLAVE_CACHE_EVENTOS, { eventos, guardadoEn: nuevoTimestamp() });
}

export function leerCacheEventos() {
  const c = leerLS(CLAVE_CACHE_EVENTOS, null);
  return c?.eventos || null;
}
