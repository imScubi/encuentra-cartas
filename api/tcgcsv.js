// Función de servidor: le pide los datos a TCGCSV (catálogo de producto sellado)
// y se los pasa a la app. Esto es necesario porque TCGCSV no permite
// que el navegador le pregunte directamente (política de seguridad de ellos, no nuestra).
//
// También atiende `fuente=shopify` (importar el catálogo de la tienda
// Shopify PROPIA de un vendedor, ver ImportadorShopify en App.jsx) -- vive
// en el mismo archivo por el límite de 12 funciones serverless del plan
// Hobby de Vercel (ya estaba al tope, igual que la moderación de fotos de
// la sección 74). El servidor arma la URL final a partir de un origen y
// una colección por separado (nunca una ruta libre que mande el cliente)
// para no abrir un proxy genérico hacia cualquier URL.
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

export default async function handler(req, res) {
  if (req.query.fuente === "shopify") {
    return importarShopify(req, res);
  }
  if (req.query.fuente === "wikidex") {
    return wikidexProxy(req, res);
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
