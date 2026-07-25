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
