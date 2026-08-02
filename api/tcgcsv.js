// Función de servidor: le pide los datos a TCGCSV (catálogo de producto sellado)
// y se los pasa a la app. Esto es necesario porque TCGCSV no permite
// que el navegador le pregunte directamente (política de seguridad de ellos, no nuestra).
//
// También atiende `fuente=shopify` (importar el catálogo de la tienda
// Shopify PROPIA de un vendedor, ver ImportadorShopify en App.jsx) y
// `fuente=justtcg` (experimento aislado, ver comentario de justTcgProxy
// más abajo y public/experimento-justtcg.html) -- viven en el mismo
// archivo por el límite de 12 funciones serverless del plan Hobby de
// Vercel (ya estaba al tope, igual que la moderación de fotos de la
// sección 74). El servidor arma la URL final a partir de un origen y una
// colección por separado (nunca una ruta libre que mande el cliente) para
// no abrir un proxy genérico hacia cualquier URL.
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

// ---- Experimento: JustTCG como posible reemplazo de las APIs de precio
// actuales (pokemontcg.io/Scryfall/YGOPRODeck) -- ver sección 103 de
// SUSCRIPCIONES.md. Vive completamente aislado de la app principal: solo
// lo usa public/experimento-justtcg.html (una página suelta, sin liga
// desde el nav ni el resto del código), para poder probar sin arriesgar
// nada de lo que ya funciona. La llave vive solo aquí en el servidor
// (JUSTTCG_API_KEY en Vercel), nunca en el navegador.
//
// No se pudo confirmar en vivo desde este entorno (proxy de red
// restringido, igual que con las demás fuentes de precio) la forma exacta
// del endpoint/parámetros/respuesta de JustTCG -- por eso este proxy
// regresa el cuerpo Y el status code de JustTCG tal cual al navegador
// (incluyendo errores), en vez de interpretarlos: así la página del
// experimento puede mostrar el error real de su API para ajustar el
// endpoint/parámetros con datos reales en vez de adivinar dos veces.
async function justTcgProxy(req, res) {
  const apiKey = process.env.JUSTTCG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar JUSTTCG_API_KEY como variable de entorno en Vercel." });

  // Modo "detalle/historial": se le pasa el id que regresó una búsqueda
  // anterior, para la parte del experimento que intenta graficar el
  // historial de precio de una carta ya publicada (ver sección 104 de
  // SUSCRIPCIONES.md). No se pudo confirmar en vivo si este es el
  // endpoint/forma correcta -- mismo criterio que el resto del proxy:
  // se regresa la respuesta cruda para diagnosticar con datos reales.
  const cardId = String(req.query.cardId || "").trim();
  const url = cardId
    ? `https://api.justtcg.com/v1/cards/${encodeURIComponent(cardId)}`
    : (() => {
        const texto = String(req.query.q || "").trim();
        const juego = String(req.query.game || "pokemon").trim();
        return texto.length >= 2 ? `https://api.justtcg.com/v1/cards?game=${encodeURIComponent(juego)}&q=${encodeURIComponent(texto)}` : null;
      })();
  if (!url) return res.status(400).json({ error: "Escribe al menos 2 letras para buscar (o manda cardId)." });

  try {
    const upstream = await fetch(url, { headers: { "x-api-key": apiKey } });
    const crudo = await upstream.text();
    let data;
    try { data = JSON.parse(crudo); } catch { data = { crudo }; }
    res.status(200).json({ statusJustTcg: upstream.status, urlConsultada: url, data });
  } catch (e) {
    res.status(502).json({ error: "No se pudo conectar con JustTCG.", detalle: e.message });
  }
}

export default async function handler(req, res) {
  if (req.query.fuente === "shopify") {
    return importarShopify(req, res);
  }
  if (req.query.fuente === "justtcg") {
    return justTcgProxy(req, res);
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
