import { reportarError } from "./errorReporting.jsx";
import { Capacitor } from "@capacitor/core";

// ---- App nativa (Capacitor, Google Play) vs. la web normal ----
// Se usa en dos lugares: (1) el botón de Google se oculta en la app nativa
// -- Google bloquea el login OAuth dentro de un WebView embebido
// ("disallowed_useragent"), y arreglarlo bien requiere un flujo de
// navegador del sistema + deep link que no se pudo construir ni probar
// sin un dispositivo/emulador real; (2) suscribirse a un plan de pago
// dentro de la app de Android mandaría a Mercado Pago dentro del WebView
// -- Google Play exige usar Google Play Billing para vender contenido
// digital dentro de la app, así que en vez de eso se manda a la persona a
// la página web (mismo patrón que usa Netflix en su app).
export const esNativo = () => Capacitor.isNativePlatform();

// ---- Conexión a Supabase (usa la anon key, es segura para el navegador) ----
export const SUPABASE_URL = "https://nulypgaaekexlbxbxdwq.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bHlwZ2FhZWtleGxieGJ4ZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk3OTcsImV4cCI6MjA5OTk3NTc5N30.9qxfcmUx5k1br1CH3DIFI2EplFJWYeRyg6HFeZNN7og";

// ---- Llave pública VAPID para notificaciones push (la privada vive solo en el servidor) ----
export const VAPID_PUBLIC_KEY = "BLPUA-CAQihRVApIBjAaOg6Sb83z1j2uLTL-irKRiZ0JW6XlpJ2u9S4pFCqbC15VBOsL4MmlCHUe-_LsychJOs0";

// PostgREST trata , . : ( ) como caracteres reservados de su propia gramática
// de filtros (columna=operador.valor, y sobre todo dentro de or()/and()) --
// como el servidor decodifica la URL ANTES de parsear el filtro,
// encodeURIComponent() por sí solo no protege: un "," que el usuario escribió
// en un nombre/búsqueda vuelve a ser un "," literal justo cuando PostgREST
// decide dónde termina una condición y empieza la siguiente, dejando que el
// resto del texto se cuele como si fuera otra condición del filtro. Envolver
// el valor en comillas dobles (escapando \ y " adentro) es la forma que
// documenta PostgREST para que siempre se trate como texto literal, sin
// importar en qué filtro se use. Se le aplica encodeURIComponent por fuera,
// ya para que la URL en sí sea válida.
// https://postgrest.org/en/stable/references/api/tables_views.html#reserved-characters
export function pgValor(v) {
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Para armar un patrón de ilike/like (ej. "*texto*"): el "*" es el comodín
// que PostgREST convierte a "%" del lado del servidor -- pero pgValor() de
// arriba lo rompe, porque envolver el valor en comillas para protegerlo de
// la gramática de filtros TAMBIÉN le apaga a PostgREST esa sustitución
// automática (las comillas dejan el valor como texto 100% literal), así que
// el patrón termina buscando el texto "*algo*" tal cual -- que ninguna fila
// tiene -- y da CERO resultados siempre, sin importar qué se busque. En vez
// de comillas, se quitan del texto los caracteres que sí son reservados en
// la gramática de filtros (`,` `.` `(` `)`): perder alguno de esos de una
// búsqueda de texto libre es aceptable, y así el patrón sigue siendo un
// ilike real. (Ver bug real: BuscadorComprador nunca encontraba a nadie.)
export function pgLikeValor(texto) {
  const limpio = String(texto || "").replace(/[,.()]/g, " ").trim();
  return `*${limpio}*`;
}

// El token de sesión de Supabase expira solo (~1 hora). Si una consulta falla
// por eso, la renovamos con el refresh_token y reintentamos una sola vez.
// onSesionRefrescada lo registra la app principal (vía setOnSesionRefrescada) para
// enterarse del cambio (y así no perder la renovación en el siguiente render).
let onSesionRefrescada = null;
let refrescandoPromesa = null;

export function setOnSesionRefrescada(fn) {
  onSesionRefrescada = fn;
}

export function pareceSesionExpirada(status, data) {
  return status === 401 || /jwt expired|invalid jwt|claim.*expired|expired.*claim|"exp"\s*claim/i.test(JSON.stringify(data || {}));
}

export async function refrescarSesion(session) {
  if (!session?.refresh_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  if (!refrescandoPromesa) {
    refrescandoPromesa = fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.msg || "Tu sesión expiró. Vuelve a iniciar sesión.");
        const nueva = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user || session.user };
        localStorage.setItem("ec_session", JSON.stringify(nueva));
        onSesionRefrescada?.(nueva);
        return nueva;
      })
      .finally(() => { refrescandoPromesa = null; });
  }
  return refrescandoPromesa;
}

export async function sb(path, session) {
  const pedir = (s) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}` },
    });

  let res = await pedir(session);
  if (!res.ok && session) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await pedir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    // El detalle completo (ruta, status, mensaje/hint crudo de PostgREST) solo
    // se manda al reporte de errores para el equipo -- nunca se le muestra al
    // usuario, para no filtrarle nombres de tablas/columnas ni la consulta.
    reportarError(`Error consultando (${res.status}) en ${path}: ${data?.message || data?.hint || JSON.stringify(data) || "sin detalle"}`);
    const error = new Error("No se pudo cargar la información. Intenta de nuevo en un momento.");
    error.code = data?.code || null;
    throw error;
  }
  return res.json();
}

export async function sbWrite(method, path, body, session) {
  const pedir = (s) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });

  let res = await pedir(session);
  let data = await res.clone().json().catch(() => null);
  if (!res.ok && session && pareceSesionExpirada(res.status, data)) {
    const nueva = await refrescarSesion(session);
    res = await pedir(nueva);
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    reportarError(`Error en ${method} ${path} (${res.status}): ${data?.message || data?.hint || JSON.stringify(data) || "sin detalle"}`);
    // "23505" (unique_violation de Postgres) es el único caso donde el resto de
    // la app necesita distinguir el tipo de error (ver crearConSlugUnico y el
    // registro de push_subscriptions) -- por eso se guarda en error.code en vez
    // de tener que volver a exponer el mensaje crudo de la base de datos.
    const esDuplicado = data?.code === "23505";
    const error = new Error(esDuplicado ? "Ya existe un registro con ese mismo valor único." : "No se pudo guardar. Intenta de nuevo en un momento.");
    error.code = data?.code || null;
    throw error;
  }
  // Pedimos siempre Prefer: return=representation, así que un 2xx sin body
  // parseable (conexión cortada justo después de que el servidor sí guardó,
  // muy común en wifi de eventos/expos) no es un guardado exitoso con datos
  // vacíos -- es una respuesta incompleta. POST/PATCH siempre esperan poder
  // leer la fila de vuelta (varios sitios hacen `const [fila] = await
  // sbWrite(...)`, que truena feo si data es null); dejamos DELETE fuera de
  // este chequeo porque nada llama a sbWrite("DELETE", ...) para leer el
  // resultado. Tirar aquí en vez de devolver null deja que quien llama (o la
  // cola de reintentos offline de Modo Evento) decida qué hacer.
  if (data === null && method !== "DELETE") {
    reportarError(`Respuesta sin datos en ${method} ${path} (status ${res.status} ok)`);
    const error = new Error("No se pudo confirmar el guardado. Intenta de nuevo en un momento.");
    // No sabemos si el servidor sí guardó (guardó y se cortó la respuesta) o
    // no -- ec_evento_queue (Modo Evento offline) trata esto igual que un
    // error de red: lo reintenta más tarde y confía en el choque de llave
    // única (23505) para notar que ya se había guardado, en vez de asumir
    // que se perdió.
    error.ambiguoDeRed = true;
    throw error;
  }
  return data;
}

export async function authSignUp(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "No se pudo crear la cuenta");
  return data; // incluye access_token si la confirmación por correo está desactivada
}

// ---- Confirmar correo con un token_hash (ver ConfirmarCorreoModal en App.jsx) ----
// El link "de siempre" que manda Supabase apunta directo a su endpoint
// GET /auth/v1/verify, que consume el token de un solo uso con el simple
// hecho de que alguien (o algo) le haga un GET -- y muchos clientes de
// correo (Gmail, Outlook/Safe Links, antivirus corporativos) le hacen ese
// GET automáticamente para "escanear" el link ANTES de que el usuario lo
// toque, dejando el token ya quemado cuando la persona sí da clic ("Email
// link is invalid or has expired" aunque el link sea el correcto y
// recién llegado). Por eso la plantilla de correo en Supabase debe
// apuntar aquí (?confirmar=1&token_hash=...&type=signup) en vez de al
// link de Supabase directo: cargar esta página no gasta el token, solo
// lo gasta este POST, que solo se dispara cuando la persona de verdad le
// da clic al botón de confirmar.
export async function authVerifyOtp(tokenHash, type) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type, token_hash: tokenHash }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "Ese enlace de confirmación ya no es válido. Pide que te reenviemos uno nuevo e intenta de nuevo.");
  return data; // incluye access_token/refresh_token/user
}

// ---- Login social (Google/Facebook) ----
// La app no usa el SDK de supabase-js, así que hacemos el flujo "implícito" a
// mano: redirigimos a /auth/v1/authorize, Supabase habla con el proveedor y
// nos regresa aquí con los tokens en el fragmento de la URL (#access_token=...).
export function urlLoginSocial(provider) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  return `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;
}

// Si venimos de vuelta de un login social, el navegador trae los tokens en
// el hash (#access_token=...&refresh_token=...). Los leemos una sola vez y
// limpiamos la URL para no dejarlos visibles ni que se reprocesen al recargar.
export function leerSesionDeUrl() {
  if (!window.location.hash.includes("access_token")) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token) return null;
  window.history.replaceState({}, "", window.location.pathname + window.location.search);
  return { access_token, refresh_token };
}

export async function obtenerUsuarioDeToken(access_token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || "No se pudo leer la sesión");
  return data;
}

export async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "Correo o contraseña incorrectos");
  return data;
}

export async function subirAvatar(file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/avatar.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s.access_token}`,
        "Content-Type": file.type || "image/jpeg",
        "x-upsert": "true",
      },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    reportarError(`Error subiendo avatar (${res.status}): ${data?.message || JSON.stringify(data) || "sin detalle"}`);
    throw new Error("No se pudo subir la foto. Intenta de nuevo en un momento.");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
}

export async function subirImagenAnuncio(file, session, indice = 0) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/${Date.now()}-${indice}.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/anuncios/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    reportarError(`Error subiendo imagen de anuncio (${res.status}): ${data?.message || JSON.stringify(data) || "sin detalle"}`);
    throw new Error("No se pudo subir la imagen. Intenta de nuevo en un momento.");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/anuncios/${path}`;
}

export async function subirImagenABucket(bucket, file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/${Date.now()}.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    reportarError(`Error subiendo imagen a ${bucket} (${res.status}): ${data?.message || JSON.stringify(data) || "sin detalle"}`);
    throw new Error("No se pudo subir la imagen. Intenta de nuevo en un momento.");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export async function subirImagenCarta(file, session) {
  return subirImagenABucket("cartas", file, session);
}

export async function subirImagenMensaje(file, session) {
  return subirImagenABucket("mensajes", file, session);
}
