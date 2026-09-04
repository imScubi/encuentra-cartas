// Función de servidor: le pide los datos a TCGCSV (catálogo de producto sellado)
// y se los pasa a la app. Esto es necesario porque TCGCSV no permite
// que el navegador le pregunte directamente (política de seguridad de ellos, no nuestra).
//
// También atiende `fuente=shopify` (importar el catálogo de la tienda
// Shopify PROPIA de un vendedor, ver ImportadorShopify en App.jsx) y
// `fuente=apitcg` (ver más abajo) -- todo vive en el mismo archivo por el
// límite de 12 funciones serverless del plan Hobby de Vercel (ya estaba al
// tope, igual que la moderación de fotos de la sección 74). El servidor
// arma la URL final a partir de un origen y una colección por separado
// (nunca una ruta libre que mande el cliente) para no abrir un proxy
// genérico hacia cualquier URL.
import sharp from "sharp";

const HOSTNAMES_BLOQUEADOS = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i;

function origenValido(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return null;
    if (HOSTNAMES_BLOQUEADOS.test(u.hostname)) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) return null; // IP literal
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

// Experimento aislado (ver public/experimento-wikidex.html): probar si Wikidex
// sirve como fuente de datos extra para cartas Pokémon (ataques, habilidades,
// ilustrador) usando la API de MediaWiki (la misma que usa cualquier wiki de
// Fandom/Wikipedia), NO scraping de HTML. No podemos verificar desde este
// entorno si la URL base es exactamente esta ni si los nombres de plantilla
// que espera `titulo=` coinciden con los que usa Wikidex de verdad, así que
// este proxy no interpreta nada: devuelve la respuesta cruda de MediaWiki tal
// cual, con su status real, para que se pueda evaluar en producción antes de
// construir cualquier lógica que dependa de su formato.
async function wikidexProxy(req, res) {
  const { q, titulo } = req.query;
  const base = "https://www.wikidex.net/api.php";
  try {
    if (titulo) {
      const upstream = await fetch(
        `${base}?action=parse&page=${encodeURIComponent(String(titulo))}&prop=wikitext&format=json&formatversion=2`,
        { headers: { "User-Agent": "EncuentraCartas/1.0 (experimento, app de tiendas de TCG Monterrey)" } }
      );
      const texto = await upstream.text();
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
      return res.status(200).json({ upstreamStatus: upstream.status, cruda: texto });
    }
    if (!q) return res.status(400).json({ error: "Falta 'q' (búsqueda) o 'titulo' (página exacta)." });
    const upstream = await fetch(
      `${base}?action=query&list=search&srsearch=${encodeURIComponent(String(q))}&format=json&formatversion=2`,
      { headers: { "User-Agent": "EncuentraCartas/1.0 (experimento, app de tiendas de TCG Monterrey)" } }
    );
    const texto = await upstream.text();
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ upstreamStatus: upstream.status, cruda: texto });
  } catch (e) {
    res.status(200).json({ error: "No se pudo conectar con Wikidex.", detalle: String(e) });
  }
}

// Proxy de imágenes para poder dibujar el arte de una carta dentro de un
// <canvas> (ver src/lib/wishlistImagen.js -- la imagen descargable de la
// Wishlist) sin "manchar" el canvas: un <img> cross-origin sin headers
// CORS permisivos bloquea canvas.toBlob(), y las cartas vienen de +6 CDNs
// de terceros distintos que no controlamos. Sirviendo la imagen desde
// nuestro propio origen, el <img> deja de ser cross-origin para el canvas.
//
// A diferencia de origenValido (pensada para que el SERVIDOR arme la ruta
// final a partir de un origen + colección, nunca una ruta libre que mande
// el cliente -- ver el comentario de arriba), aquí el cliente SÍ manda una
// URL completa (la imagen exacta de una carta), así que se usa una lista
// blanca de hosts conocidos en vez de solo validar que no sea IP privada,
// y se bloquean redirecciones (fetch con redirect:"manual") -- esta ruta
// la puede llamar cualquier visitante sin sesión (la Wishlist pública no
// pide login), así que el hueco de SSRF-vía-redirección sí aplica aquí de
// lleno, a diferencia de importarShopify (gateado a un dueño de tienda
// nombrando su propio dominio).
//
// Honesto: algunos de estos hostnames se infieren del uso conocido de
// cada API (no se pudieron confirmar en vivo desde este entorno, ver
// SUSCRIPCIONES.md) -- si una carta se queda sin imagen en producción,
// agregar su host real aquí es un cambio de una línea.
const HOSTS_IMAGENES_PERMITIDOS = new Set([
  "images.pokemontcg.io", "cards.scryfall.io", "assets.tcgdex.net", "api.tcgdex.net",
  "api.apitcg.com", "product-images.tcgplayer.com", "tcgplayer-cdn.tcgplayer.com",
  "r2.limitlesstcg.net", "limitless3.nyc3.cdn.digitaloceanspaces.com",
  "images.ygoprodeck.com", "nulypgaaekexlbxbxdwq.supabase.co",
  // Avatares: el avatar "Pokémon" default/elegido (randomPokemonAvatar,
  // ver pokemonApi.js) sale de GitHub, no de Supabase Storage -- sin este
  // host, la imagen generada de la Wishlist se quedaba sin foto de perfil
  // para cualquiera con un avatar Pokémon (el default de toda cuenta
  // nueva). lh3.googleusercontent.com cubre la foto de perfil de quien
  // se registró con Google (user_metadata.picture).
  "raw.githubusercontent.com", "lh3.googleusercontent.com",
]);
const TAMANO_MAX_IMAGEN_BYTES = 3 * 1024 * 1024;
// Miniatura opcional (?w=): las tarjetas de Mercado/tienda solo muestran la
// imagen a tamaño de miniatura, pero sin esto se descargaba el archivo
// original completo (a veces cientos de KB) por cada una -- ver comentarios
// de Eduardo Vivar sobre >100MB/788 requests solo al entrar al sitio
// (sección 166 de SUSCRIPCIONES.md). Sin `w`, el comportamiento es EXACTO
// al de antes (passthrough del archivo original) -- lo sigue necesitando
// tal cual la generación de imagen de Wishlist/Tablón de venta en canvas
// (imagenCartasCanvas.js), que no manda `w`.
const ANCHO_MINIATURA_MAX = 800;
const CALIDAD_MINIATURA_DEFAULT = 75;

async function imgProxy(req, res) {
  const { url, w, q } = req.query;
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return res.status(400).json({ error: "URL de imagen inválida." });
  }
  if (parsed.protocol !== "https:" || !HOSTS_IMAGENES_PERMITIDOS.has(parsed.hostname)) {
    return res.status(400).json({ error: "Host de imagen no permitido." });
  }
  try {
    const upstream = await fetch(parsed.href, {
      redirect: "manual",
      headers: { "User-Agent": "EncuentraCartas/1.0 (app de tiendas de TCG Monterrey)" },
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return res.status(400).json({ error: "Esa imagen no se puede cargar (redirección no permitida)." });
    }
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return res.status(415).json({ error: "La URL no apunta a una imagen." });
    }
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength > TAMANO_MAX_IMAGEN_BYTES) {
      return res.status(413).json({ error: "Imagen demasiado grande." });
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > TAMANO_MAX_IMAGEN_BYTES) {
      return res.status(413).json({ error: "Imagen demasiado grande." });
    }

    const anchoPedido = Math.min(Math.max(Number(w) || 0, 0), ANCHO_MINIATURA_MAX);
    if (anchoPedido > 0 && !contentType.includes("svg")) {
      try {
        const calidad = Math.min(Math.max(Number(q) || CALIDAD_MINIATURA_DEFAULT, 40), 95);
        const miniatura = await sharp(buffer)
          .resize({ width: anchoPedido, withoutEnlargement: true })
          .webp({ quality: calidad })
          .toBuffer();
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
        return res.status(200).send(miniatura);
      } catch {
        // Formato que sharp no pudo procesar (raro) -- seguimos al passthrough de abajo.
      }
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(buffer);
  } catch (e) {
    res.status(500).json({ error: "No se pudo cargar la imagen." });
  }
}

async function importarShopify(req, res) {
  const { origin, coleccion, page } = req.query;
  const origenLimpio = origenValido(origin || "");
  if (!origenLimpio) return res.status(400).json({ error: "La URL de tu tienda no es válida (debe empezar con https://)." });
  const handle = String(coleccion || "").trim();
  if (!/^[a-z0-9-]+$/i.test(handle)) return res.status(400).json({ error: "El nombre de la colección no es válido." });
  const pagina = Math.max(1, parseInt(page, 10) || 1);

  try {
    const upstream = await fetch(`${origenLimpio}/collections/${handle}/products.json?limit=100&page=${pagina}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EncuentraCartasBot/1.0; +https://encuentracartasmx.com)" },
    });
    if (!upstream.ok) {
      return res.status(200).json({ productos: [], bloqueado: true, status: upstream.status });
    }
    const data = await upstream.json().catch(() => null);
    if (!data || !Array.isArray(data.products)) {
      return res.status(200).json({ productos: [], bloqueado: true });
    }
    const productos = data.products.flatMap((p) =>
      (p.variants && p.variants.length ? p.variants : [{ id: p.id, title: null, price: null }]).map((v) => ({
        titulo: v.title && v.title !== "Default Title" ? `${p.title} - ${v.title}` : p.title,
        precio: v.price ? Number(v.price) : null,
        imagen: p.images?.[0]?.src || p.image?.src || null,
      }))
    );
    res.status(200).json({ productos, hayMas: data.products.length === 100 });
  } catch (e) {
    res.status(200).json({ productos: [], bloqueado: true });
  }
}

// Respaldo experimental para el catálogo de cartas (ver sección 129 de
// SUSCRIPCIONES.md): apitcg.com cubre los mismos TCG que ya tenemos (y
// varios más, incluido Riftbound) con un solo esquema consistente, imagen +
// precio real de TCGplayer en la misma respuesta. A diferencia de
// pokemontcg.io/TCGdex (llamadas directas desde el navegador, sin llave
// secreta), esta sí es una llave de verdad que hay que mantener en secreto
// -- por eso pasa por aquí (el server la manda en `x-api-key`) en vez de
// llamarse directo desde pokemonApi.js como las demás. La llave vive en la
// variable de entorno APITCG_API_KEY (Vercel → Settings → Environment
// Variables), nunca en el código ni en una variable VITE_ (esas sí quedan
// visibles en el bundle que le llega al navegador).
async function apitcgProxy(req, res) {
  const { path } = req.query;
  if (!path || !/^api\//.test(String(path))) {
    return res.status(400).json({ error: "Ruta inválida para API TCG." });
  }
  const apiKey = process.env.APITCG_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "API TCG todavía no está configurada en el servidor." });
  }
  try {
    const upstream = await fetch(`https://api.apitcg.com/${path}`, {
      headers: { "x-api-key": apiKey, "User-Agent": "EncuentraCartas/1.0 (app de tiendas de TCG Monterrey)" },
    });
    const data = await upstream.json().catch(() => null);
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
    res.status(upstream.status).json(data ?? { error: "Respuesta inválida de API TCG." });
  } catch (e) {
    res.status(500).json({ error: "No se pudo conectar con API TCG." });
  }
}

// apitcg.com da attributes.Description con HTML ligero (<em>, <strong>,
// <br>) -- se limpia a texto plano igual que en el cliente
// (limpiarHtmlLigero de src/lib/pokemonApi.js) antes de guardarlo, para no
// tener que confiar en un sanitizador de HTML que este repo no tiene.
function limpiarHtml(texto) {
  if (!texto) return null;
  const limpio = String(texto).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
  return limpio || null;
}

// Resuelve el id del usuario dueño del token (o null si el token no es
// válido) -- mismo patrón que api/admin/usuarios.js.
async function resolverUsuario(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return null;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
  const caller = await userRes.json().catch(() => null);
  return userRes.ok && caller?.id ? caller : null;
}

// Traduce la descripción de una carta/producto (apitcg.com solo la da en
// inglés) con el endpoint gratuito de Google Translate, sin API key --
// se llama desde el servidor para no depender de CORS del navegador. Si
// vienen tabla+id (uno de los 3 catálogos), cachea la traducción en
// descripcion_api_es con el service role key (server-side, sin RLS) para
// que cualquier otro visitante ya no tenga que volver a traducirla --
// esto es lo único por lo que este endpoint necesita el service role: la
// caché es pública (útil para cualquiera que vea esa publicación), no un
// cambio del dueño, así que no puede depender de los permisos de quien
// pidió la traducción.
const TABLAS_DESCRIPCION_VALIDAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];
async function traducirProxy(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const caller = await resolverUsuario(req);
  if (!caller) return res.status(401).json({ error: "Sesión inválida" });

  const { texto, tabla, id } = req.body || {};
  const textoLimpio = String(texto || "").trim();
  if (!textoLimpio) return res.status(400).json({ error: "Falta el texto a traducir." });
  if (textoLimpio.length > 3000) return res.status(400).json({ error: "El texto es demasiado largo para traducir." });

  try {
    const upstream = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(textoLimpio)}`
    );
    const data = await upstream.json().catch(() => null);
    const traducido = Array.isArray(data?.[0]) ? data[0].map((seg) => seg?.[0] || "").join("") : "";
    if (!traducido) return res.status(502).json({ error: "No se pudo traducir en este momento." });

    const idEsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
    if (tabla && idEsUuid && TABLAS_DESCRIPCION_VALIDAS.includes(tabla)) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      fetch(`${supabaseUrl}/rest/v1/${tabla}?id=eq.${id}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ descripcion_api_es: traducido }),
      }).catch(() => {}); // de mejor esfuerzo -- si falla el cacheo, la traducción ya se entregó igual
    }

    res.status(200).json({ traducido });
  } catch (e) {
    res.status(500).json({ error: "No se pudo traducir en este momento." });
  }
}

// Migra artista/descripción para publicaciones ya existentes que se
// buscaron con apitcg.com (card_api_id empieza con "apitcg:", así que se
// pueden volver a consultar directo por id) -- ver sección de
// SUSCRIPCIONES.md sobre esto. Solo el admin la puede disparar, y solo
// procesa un lote chico por llamada (el panel de admin la llama en bucle
// pasando el cursor) para no gastar de golpe la cuota mensual de
// apitcg.com. Idempotente: si una fila ya tiene artista/descripcion_api
// (de una corrida anterior) se salta sin volver a gastar cuota en ella --
// el cursor siempre avanza sobre TODAS las filas con prefijo apitcg:, así
// que una corrida completa nunca vuelve a intentar la misma fila dos veces
// en la misma pasada, tenga o no tenga apitcg.com esos datos para ella.
async function migrarDescripcionesProxy(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const caller = await resolverUsuario(req);
  if (!caller) return res.status(401).json({ error: "Sesión inválida" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  const adminRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,es_admin&id=eq.${caller.id}`, { headers });
  const adminRows = await adminRes.json().catch(() => []);
  if (!adminRows?.[0]?.es_admin) return res.status(403).json({ error: "Solo un admin puede hacer esto" });

  const { tabla, cursor } = req.body || {};
  if (!TABLAS_DESCRIPCION_VALIDAS.includes(tabla)) return res.status(400).json({ error: "Tabla inválida." });

  const apiKey = process.env.APITCG_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "API TCG todavía no está configurada en el servidor." });

  try {
    const LOTE = 25;
    const filtroCursor = cursor ? `&id=gt.${cursor}` : "";
    const filasRes = await fetch(
      `${supabaseUrl}/rest/v1/${tabla}?select=id,card_api_id,artista,descripcion_api&card_api_id=like.apitcg:*&order=id.asc&limit=${LOTE}${filtroCursor}`,
      { headers }
    );
    const filas = await filasRes.json().catch(() => []);
    if (!Array.isArray(filas)) throw new Error("No se pudo leer la tabla.");

    let migradas = 0;
    for (const fila of filas) {
      // Ya tiene artista/descripción (de una corrida anterior) -- se
      // salta sin gastar cuota de apitcg.com en volver a pedirla.
      if (fila.artista || fila.descripcion_api) continue;
      const numericId = String(fila.card_api_id).replace(/^apitcg:/, "");
      try {
        const productoRes = await fetch(`https://api.apitcg.com/api/products/${numericId}`, {
          headers: { "x-api-key": apiKey, "User-Agent": "EncuentraCartas/1.0 (app de tiendas de TCG Monterrey)" },
        });
        const producto = await productoRes.json().catch(() => null);
        const attrs = producto?.data?.attributes;
        if (!attrs) continue;
        const artista = attrs.Artist || null;
        const descripcionApi = limpiarHtml(attrs.Description);
        if (!artista && !descripcionApi) continue;
        await fetch(`${supabaseUrl}/rest/v1/${tabla}?id=eq.${fila.id}`, {
          method: "PATCH", headers, body: JSON.stringify({ artista, descripcion_api: descripcionApi }),
        });
        migradas++;
      } catch { /* una fila fallida no debe tumbar todo el lote */ }
    }

    const siguienteCursor = filas.length === LOTE ? filas[filas.length - 1].id : null;
    res.status(200).json({ procesadas: filas.length, migradas, siguienteCursor });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo migrar este lote." });
  }
}

// Torneos/decklists/resultados competitivos de Pokémon TCG (ver sección
// de SUSCRIPCIONES.md sobre "Armar Mazo" + Competitivo). A diferencia de
// apitcg.com, la API de Limitless es pública -- no pide API key para
// nada de lo que usamos aquí (torneos, standings, games) -- así que este
// proxy no manda ningún secreto, solo evita abrir un proxy genérico
// (lista blanca de rutas) y aprovecha para cachear la respuesta.
async function limitlessProxy(req, res) {
  const { path } = req.query;
  if (!path || !/^(tournaments|games)/.test(String(path))) {
    return res.status(400).json({ error: "Ruta inválida para Limitless TCG." });
  }
  try {
    const upstream = await fetch(`https://play.limitlesstcg.com/api/${path}`, {
      headers: { "User-Agent": "EncuentraCartas/1.0 (app de tiendas de TCG Monterrey)" },
    });
    const data = await upstream.json().catch(() => null);
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    res.status(upstream.status).json(data ?? { error: "Respuesta inválida de Limitless TCG." });
  } catch (e) {
    res.status(500).json({ error: "No se pudo conectar con Limitless TCG." });
  }
}

export default async function handler(req, res) {
  if (req.query.fuente === "shopify") {
    return importarShopify(req, res);
  }
  if (req.query.fuente === "wikidex") {
    return wikidexProxy(req, res);
  }
  if (req.query.fuente === "imgproxy") {
    return imgProxy(req, res);
  }
  if (req.query.fuente === "apitcg") {
    return apitcgProxy(req, res);
  }
  if (req.query.fuente === "traducir") {
    return traducirProxy(req, res);
  }
  if (req.query.fuente === "migrar-descripciones") {
    return migrarDescripcionesProxy(req, res);
  }
  if (req.query.fuente === "limitless") {
    return limitlessProxy(req, res);
  }

  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ error: "Falta el parámetro 'path'" });
  }
  try {
    const upstream = await fetch(`https://tcgcsv.com/${path}`, {
      headers: { "User-Agent": "EncuentraCartas/1.0 (app de tiendas de TCG Monterrey)" },
    });
    const data = await upstream.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "No se pudo conectar al catálogo de producto sellado" });
  }
}
