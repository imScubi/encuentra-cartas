// Precio actual de una carta por TCG, para usar desde el cron (Node,
// api/cron/recordatorios.js) -- reimplementa a propósito (en vez de
// importar) la misma lógica de precio que ya usa src/lib/pokemonApi.js
// del lado del cliente: ese archivo se empaqueta con Vite para el
// navegador, y cruzar esa frontera hacia una función serverless es fácil
// de romper sin avisar. Aquí solo vive lo mínimo que hace falta: precio
// actual de Pokémon (pokemontcg.io), Magic (Scryfall) y Yu-Gi-Oh
// (YGOPRODeck) -- los únicos tres TCG con una fuente de precio real ya
// confirmada (Lorcana/One Piece quedan fuera del boletín semanal hasta
// que haya una fuente confiable para ellos).
const USD_TO_MXN = 18.5;
const EUR_TO_MXN = 20;

async function precioPokemon(cardApiId) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardApiId)}`);
  if (!res.ok) return null;
  const c = (await res.json())?.data;
  if (!c) return null;
  let precioMxn = null;
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const variante = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || tp["1stEditionHolofoil"];
    if (variante?.market) precioMxn = Math.round(variante.market * USD_TO_MXN);
  }
  if (!precioMxn && c.cardmarket?.prices?.trendPrice) precioMxn = Math.round(c.cardmarket.prices.trendPrice * EUR_TO_MXN);
  if (!precioMxn) return null;
  return { precioMxn, nombre: c.name, setNombre: c.set?.name || null, imagenUrl: c.images?.large || c.images?.small || null };
}

async function precioMagic(cardApiId) {
  const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(cardApiId)}`);
  if (!res.ok) return null;
  const c = await res.json();
  let precioMxn = null;
  const usd = c.prices?.usd || c.prices?.usd_foil;
  if (usd) precioMxn = Math.round(Number(usd) * USD_TO_MXN);
  else if (c.prices?.eur || c.prices?.eur_foil) precioMxn = Math.round(Number(c.prices.eur || c.prices.eur_foil) * EUR_TO_MXN);
  if (!precioMxn) return null;
  return { precioMxn, nombre: c.name, setNombre: c.set_name || null, imagenUrl: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null };
}

async function precioYugioh(cardApiId) {
  const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(cardApiId)}`);
  if (!res.ok) return null;
  const c = (await res.json())?.data?.[0];
  if (!c) return null;
  const precios = c.card_prices?.[0];
  let precioMxn = null;
  if (precios) {
    const usd = Number(precios.tcgplayer_price || precios.ebay_price || precios.amazon_price || 0);
    if (usd > 0) precioMxn = Math.round(usd * USD_TO_MXN);
    else if (Number(precios.cardmarket_price || 0) > 0) precioMxn = Math.round(Number(precios.cardmarket_price) * EUR_TO_MXN);
  }
  if (!precioMxn) return null;
  return { precioMxn, nombre: c.name, setNombre: c.card_sets?.[0]?.set_name || c.type || null, imagenUrl: c.card_images?.[0]?.image_url || null };
}

const OBTENEDORES = { pokemon: precioPokemon, magic: precioMagic, yugioh: precioYugioh };

// TCG con fuente de precio real ya integrada (ver comentario arriba).
export const TCGS_CON_BOLETIN = ["pokemon", "magic", "yugioh"];

// "Best effort": si falla (rate limit, carta no encontrada, red caída),
// regresa null en vez de tronar -- una carta que no se pudo cotizar esta
// semana simplemente no entra a la comparación, no bloquea el resto del
// boletín.
export async function precioActualPorTcg(tcg, cardApiId) {
  const obtener = OBTENEDORES[tcg];
  if (!obtener || !cardApiId) return null;
  try {
    return await obtener(cardApiId);
  } catch {
    return null;
  }
}

// ---- Universo GLOBAL de cartas por TCG, para el boletín semanal ----
// El boletín es sobre el mercado del TCG en general (lo que le importa a
// cualquier coleccionista, no solo a quien vende en esta plataforma) -- así
// que en vez de mirar qué hay publicado en el Mercado/tiendas, se le
// pregunta directo a la fuente de cada juego por sus cartas más recientes,
// que es donde de verdad se mueven los precios semana a semana (una carta
// clásica de hace 20 años casi no cambia de precio en una semana). El
// ordenar por precio se hace aquí mismo (no todas las APIs documentan
// hacerlo del lado del servidor de forma confiable) y se recorta a un tope
// razonable para no tardar una eternidad ni pasarse del límite de tiempo
// de la función.
function conPrecioMxn(c) {
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const variante = tp.holofoil || tp.reverseHolofoil || tp.normal || tp.unlimited || tp["1stEditionHolofoil"];
    if (variante?.market) return Math.round(variante.market * USD_TO_MXN);
  }
  if (c.cardmarket?.prices?.trendPrice) return Math.round(c.cardmarket.prices.trendPrice * EUR_TO_MXN);
  return null;
}

async function universoPokemon(tope) {
  const setsRes = await fetch("https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=6");
  if (!setsRes.ok) return [];
  const sets = (await setsRes.json())?.data || [];
  const cartas = [];
  for (const s of sets) {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(s.id)}&pageSize=250`);
    if (!res.ok) continue;
    const data = (await res.json())?.data || [];
    cartas.push(...data);
  }
  return cartas
    .map((c) => {
      const precioMxn = conPrecioMxn(c);
      if (!precioMxn) return null;
      return { cardApiId: c.id, nombre: c.name, setNombre: c.set?.name || null, imagenUrl: c.images?.large || c.images?.small || null, precioMxn };
    })
    .filter(Boolean)
    .sort((a, b) => b.precioMxn - a.precioMxn)
    .slice(0, tope);
}

async function universoMagic(tope) {
  // Scryfall sí soporta ordenar por precio del lado del servidor (order=usd) --
  // así se toman directo las cartas más valiosas de TODO Magic, no solo de lo reciente.
  const res = await fetch("https://api.scryfall.com/cards/search?q=usd%3E%3D1&order=usd&dir=desc&unique=cards");
  if (!res.ok) return [];
  const data = (await res.json())?.data || [];
  return data
    .map((c) => {
      const usd = Number(c.prices?.usd || c.prices?.usd_foil || 0);
      if (!usd) return null;
      return {
        cardApiId: c.id, nombre: c.name, setNombre: c.set_name || null,
        imagenUrl: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || null,
        precioMxn: Math.round(usd * USD_TO_MXN),
      };
    })
    .filter(Boolean)
    .slice(0, tope);
}

async function universoYugioh(tope) {
  const setsRes = await fetch("https://db.ygoprodeck.com/api/v7/cardsets.php");
  if (!setsRes.ok) return [];
  const sets = (await setsRes.json()) || [];
  const recientes = (Array.isArray(sets) ? sets : [])
    .filter((s) => s.tcg_date)
    .sort((a, b) => new Date(b.tcg_date) - new Date(a.tcg_date))
    .slice(0, 6);
  const cartas = [];
  for (const s of recientes) {
    const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(s.set_name)}`);
    if (!res.ok) continue;
    const data = (await res.json())?.data || [];
    cartas.push(...data);
  }
  return cartas
    .map((c) => {
      const precios = c.card_prices?.[0];
      if (!precios) return null;
      const usd = Number(precios.tcgplayer_price || precios.ebay_price || 0);
      let precioMxn = usd > 0 ? Math.round(usd * USD_TO_MXN) : null;
      if (!precioMxn && Number(precios.cardmarket_price || 0) > 0) precioMxn = Math.round(Number(precios.cardmarket_price) * EUR_TO_MXN);
      if (!precioMxn) return null;
      return { cardApiId: String(c.id), nombre: c.name, setNombre: c.card_sets?.[0]?.set_name || null, imagenUrl: c.card_images?.[0]?.image_url || null, precioMxn };
    })
    .filter(Boolean)
    .sort((a, b) => b.precioMxn - a.precioMxn)
    .slice(0, tope);
}

const UNIVERSOS = { pokemon: universoPokemon, magic: universoMagic, yugioh: universoYugioh };

// "Best effort": si la fuente de un tcg falla completo (red caída, API
// caída), regresa un arreglo vacío -- ese tcg simplemente no tiene boletín
// esta semana, no tumba el resto del cron.
export async function universoGlobalPorTcg(tcg, tope = 60) {
  const fn = UNIVERSOS[tcg];
  if (!fn) return [];
  try {
    return await fn(tope);
  } catch {
    return [];
  }
}
