import { USD_TO_MXN, EUR_TO_MXN } from "../theme.js";

// ---- Reintentos para llamadas a APIs externas (pokemontcg.io, Scryfall,
// YGOPRODeck, lorcana-api) ----
// Ninguna de estas APIs usa llave (para no pedirle una cuenta al usuario),
// así que están sujetas a límites de tasa (429) o caídas breves (5xx) más
// seguido que una API con llave paga. Antes, cualquier error en una de
// estas llamadas se atrapaba y devolvía silenciosamente una lista vacía —
// eso se veía, del lado del usuario, como "no se encontraron cartas" o
// "no hay resultados" de forma intermitente, aunque la carta/set sí
// existiera. Con reintento + espera creciente, la enorme mayoría de esos
// fallos transitorios se resuelven solos sin que el usuario note nada.
async function fetchConReintento(url, intentos = 3, esperaBaseMs = 500) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      // Un 429 (límite de tasa) o 5xx vale la pena reintentar; un 4xx normal
      // (ej. 404 de "sin resultados") no va a cambiar si lo repetimos.
      if (res.status !== 429 && res.status < 500) return res;
      ultimoError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      ultimoError = e;
    }
    if (i < intentos - 1) await new Promise((r) => setTimeout(r, esperaBaseMs * (i + 1)));
  }
  throw ultimoError || new Error("No se pudo conectar");
}

// ---- Foto de perfil: Pokémon (PokeAPI, pública) o foto propia (Supabase Storage) ----
export const POKEMON_MAX_ID = 1025;
export const pokemonSpriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
export const randomPokemonAvatar = () => pokemonSpriteUrl(1 + Math.floor(Math.random() * POKEMON_MAX_ID));

let _pokemonListCache = null;
export async function obtenerListaPokemon() {
  if (_pokemonListCache) return _pokemonListCache;
  const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000");
  const data = await res.json();
  _pokemonListCache = (data.results || [])
    .map((p) => {
      const match = p.url.match(/\/pokemon\/(\d+)\/?$/);
      return match ? { name: p.name, id: Number(match[1]) } : null;
    })
    .filter(Boolean);
  return _pokemonListCache;
}

// Extrae el número exacto y el nombre del set desde un texto tipo
// "Crown Zenith GG56/GG70" (formato que usa set_nombre en la app).
export function parseNumeroYSet(setNombre) {
  if (!setNombre) return { set: null, numero: null };
  const limpio = setNombre.trim();
  const conSet = limpio.match(/^(.+?)\s+([A-Za-z]*\d+[A-Za-z]*)(?:\/[A-Za-z0-9]*)?$/);
  if (conSet) return { set: conSet[1].trim(), numero: conSet[2] };
  const soloNumero = limpio.match(/^([A-Za-z]*\d+[A-Za-z]*)(?:\/[A-Za-z0-9]*)?$/);
  if (soloNumero) return { set: null, numero: soloNumero[1] };
  return { set: limpio, numero: null };
}

// Respaldo cuando TCGdex no tiene la imagen (pasa seguido con arte especial / secretas).
// pokemontcg.io tiene mejor cobertura de esas variantes. Exige nombre + número
// exactos (y set si lo tenemos) para no traer la imagen de una versión distinta
// de la misma carta — si no hay coincidencia exacta, no arriesga y devuelve null.
export async function buscarImagenRespaldo(nombre, numero, setNombre) {
  if (!nombre || !numero) return null;
  try {
    const buscar = async (conSet) => {
      let query = `name:"${nombre}" number:"${numero}"`;
      if (conSet && setNombre) query += ` set.name:"${setNombre}"`;
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=20`);
      if (!res.ok) return [];
      const data = await res.json();
      return data?.data || [];
    };

    let cartas = await buscar(true);
    if (!cartas.length) cartas = await buscar(false);
    if (!cartas.length) return null;

    const exacta = cartas.find((c) => String(c.number).toLowerCase() === String(numero).toLowerCase());
    if (!exacta) return null;
    return exacta.images?.large || exacta.images?.small || null;
  } catch {
    return null;
  }
}

// Busca una carta por nombre (y opcionalmente número) en TCGdex, con el
// mismo respaldo de imagen que usa CardPicker. Se usa para prellenar las
// cartas que la IA detectó en una foto de carpeta.
export async function buscarCartaTCGdex(nombre, numeroHint) {
  if (!nombre) return null;
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(nombre)}&pagination:itemsPerPage=10`);
    const lista = await res.json();
    if (!Array.isArray(lista) || !lista.length) return null;
    // El número puede venir como "054/198" (con el total) — solo la primera parte
    // es el localId real de TCGdex, si comparamos el texto completo nunca coincide.
    const numeroLimpio = numeroHint ? String(numeroHint).split("/")[0].trim() : null;
    const candidato = (numeroLimpio && lista.find((c) => c.localId === numeroLimpio)) || lista[0];
    const detalleRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${candidato.id}`);
    const full = await detalleRes.json();
    const total = full.set?.cardCount?.official || full.set?.cardCount?.total || "";
    let imagen = full.image ? `${full.image}/high.webp` : "";
    if (!imagen) imagen = (await buscarImagenRespaldo(full.name, full.localId, full.set?.name)) || "";
    return {
      name: full.name,
      set_nombre: `${full.set?.name || ""} ${full.localId}${total ? "/" + total : ""}`,
      card_api_id: full.id,
      imagen_url: imagen,
    };
  } catch {
    return null;
  }
}

// ---- Búsqueda visual de cartas (estilo Pokellector) ----
// Deja escribir libremente "Sprigatito 016", "Sprigatito #016" o
// "Sprigatito Journey Together" sin exigir un formato fijo: separa el
// número de carta (con o sin "#") del resto del texto, y si lo que queda
// tiene más de una palabra, prueba varias formas de partirlo entre
// "nombre de la carta" y "nombre del set" (ej. "Sprigatito" + "Journey
// Together"). Cada combinación se manda como filtro en paralelo; las que
// no existen en el catálogo simplemente no traen resultados, así que no
// hace falta saber de antemano cuáles palabras son el set.
//
// Usa pokemontcg.io (no TCGdex) porque ya era el respaldo que usa esta
// misma app cuando TCGdex se queda sin imagen — tiene mejor cobertura de
// cartas de galería/ilustración especial y sets viejos, y cada resultado
// ya trae imagen + set + precio en el mismo objeto (no hace falta una
// segunda llamada al seleccionar una carta, a diferencia de TCGdex).
function extraerNumeroDeTexto(texto) {
  const t = (texto || "").trim();
  const conAlmohadilla = t.match(/^(.*?)\s*#\s*([A-Za-z]{0,5}\d{1,4}[A-Za-z]?)\s*$/);
  if (conAlmohadilla) return { restante: conAlmohadilla[1].trim(), numero: conAlmohadilla[2] };

  const palabras = t.split(/\s+/).filter(Boolean);
  const ultima = palabras[palabras.length - 1] || "";
  const pareceNumeroDeCarta = /^[A-Za-z]{0,5}\d{1,4}[A-Za-z]?$/.test(ultima);
  if (pareceNumeroDeCarta) {
    return { restante: palabras.slice(0, -1).join(" "), numero: ultima };
  }
  return { restante: t, numero: null };
}

function generarCombinacionesNombreSet(restante) {
  const palabras = restante.split(/\s+/).filter(Boolean);
  if (palabras.length <= 1) return [{ nombre: restante || null, set: null }];
  const combos = [{ nombre: restante, set: null }]; // todo el texto como nombre (comportamiento de siempre)
  const maxCombos = 5;
  for (let k = 1; k < palabras.length && combos.length < maxCombos; k++) {
    combos.push({ nombre: palabras.slice(0, k).join(" "), set: palabras.slice(k).join(" ") });
  }
  return combos;
}

// Una sola palabra: coincidencia parcial con comodín (útil mientras se
// sigue escribiendo). Varias palabras: frase exacta entre comillas (ya
// se asume completa, como cuando se termina de escribir el set/nombre).
function terminoDeCampo(frase) {
  if (!frase) return null;
  const palabras = frase.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 1) return `${palabras[0]}*`;
  return `"${frase.trim()}"`;
}

function construirQueryPokemonTCG({ nombre, set, numero }) {
  const partes = [];
  const nombreTerm = terminoDeCampo(nombre);
  if (nombreTerm) partes.push(`name:${nombreTerm}`);
  const setTerm = terminoDeCampo(set);
  if (setTerm) partes.push(`set.name:${setTerm}`);
  if (numero) partes.push(`number:${numero}`);
  return partes.join(" ");
}

function precioRefDeCartaPokemonTCG(c) {
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const variante = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || tp["1stEditionHolofoil"];
    if (variante?.market) return Math.round(variante.market * USD_TO_MXN);
  }
  if (c.cardmarket?.prices?.trendPrice) return Math.round(c.cardmarket.prices.trendPrice * EUR_TO_MXN);
  return null;
}

export async function buscarCartasVisual(texto, itemsPorCombo = 8) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const { restante, numero } = extraerNumeroDeTexto(q);
  const combos = generarCombinacionesNombreSet(restante);

  // Promise.allSettled (no Promise.all): cada combinación se reintenta sola
  // (fetchConReintento) si falla por red/límite de tasa, pero si UNA
  // combinación de verdad no existe (404 normal), no debe tirar abajo a las
  // demás que sí encontraron algo. Solo se avisa error real si TODAS
  // fallaron por conexión — así "sin resultados" de verdad no se confunde
  // con una falla transitoria de la API.
  const resultados = await Promise.allSettled(combos.map(async ({ nombre, set }) => {
    const query = construirQueryPokemonTCG({ nombre, set, numero });
    if (!query) return [];
    const res = await fetchConReintento(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${itemsPorCombo}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data || [];
  }));

  const listas = resultados.map((r) => (r.status === "fulfilled" ? r.value : null));
  if (listas.length > 0 && listas.every((l) => l === null)) {
    throw resultados[0].reason instanceof Error ? resultados[0].reason : new Error("No se pudo conectar con el catálogo de Pokémon.");
  }
  const vistos = new Set();
  const combinado = [];
  for (const lista of listas) {
    if (!lista) continue;
    for (const c of lista) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      combinado.push(c);
    }
  }
  if (numero) {
    combinado.sort((a, b) => {
      const aExacta = String(a.number).toLowerCase() === String(numero).toLowerCase();
      const bExacta = String(b.number).toLowerCase() === String(numero).toLowerCase();
      return bExacta - aExacta;
    });
  }
  return combinado.slice(0, 24).map((c) => ({
    id: c.id,
    name: c.name,
    localId: c.number,
    setName: c.set?.name || "",
    setTotal: c.set?.printedTotal || c.set?.total || "",
    image: c.images?.large || c.images?.small || null,
    precioRefMxn: precioRefDeCartaPokemonTCG(c),
  }));
}

// ---- Magic: The Gathering (segundo TCG con catálogo real, después de
// Pokémon) — usa Scryfall, gratis y sin necesitar llave. A diferencia de
// pokemontcg.io, la búsqueda de texto de Scryfall ya es difusa por nombre/
// set/número por sí sola, así que no hace falta la lógica de separar
// nombre+set+número que sí necesita construirQueryPokemonTCG. ----
function imagenDeCartaScryfall(c) {
  return c.image_uris?.normal || c.image_uris?.large
    || c.card_faces?.[0]?.image_uris?.normal || c.card_faces?.[0]?.image_uris?.large || null;
}

function precioRefDeCartaScryfall(c) {
  const usd = c.prices?.usd || c.prices?.usd_foil;
  if (usd) return Math.round(Number(usd) * USD_TO_MXN);
  const eur = c.prices?.eur || c.prices?.eur_foil;
  if (eur) return Math.round(Number(eur) * EUR_TO_MXN);
  return null;
}

export async function buscarCartasMagic(texto, limite = 24) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const res = await fetchConReintento(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=name&unique=cards`);
  if (!res.ok) return []; // incluye el 404 de "sin resultados" de Scryfall, no es un error real
  const data = await res.json();
  return (data?.data || []).slice(0, limite).map((c) => ({
    id: c.id,
    name: c.name,
    localId: c.collector_number,
    setName: c.set_name || "",
    setTotal: "",
    image: imagenDeCartaScryfall(c),
    precioRefMxn: precioRefDeCartaScryfall(c),
  }));
}

export async function obtenerPrecioRefActualMagic(cardApiId) {
  if (!cardApiId) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(cardApiId)}`);
    if (!res.ok) return null;
    const c = await res.json();
    return {
      precioRefMxn: precioRefDeCartaScryfall(c),
      tcgplayerUrl: c.purchase_uris?.tcgplayer || null,
      cardmarketUrl: c.purchase_uris?.cardmarket || null,
    };
  } catch {
    return null;
  }
}

// ---- Yu-Gi-Oh! — YGOPRODeck, gratis y sin llave. A diferencia de Scryfall,
// el precio viene ya calculado por carta (varias fuentes) en la misma
// respuesta, no hay que pedirlo aparte. ----
function precioRefDeCartaYgoprodeck(c) {
  const precios = c.card_prices?.[0];
  if (!precios) return null;
  const usd = Number(precios.tcgplayer_price || precios.ebay_price || precios.amazon_price || 0);
  if (usd > 0) return Math.round(usd * USD_TO_MXN);
  const eur = Number(precios.cardmarket_price || 0);
  if (eur > 0) return Math.round(eur * EUR_TO_MXN);
  return null;
}

export async function buscarCartasYugioh(texto, limite = 24) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const res = await fetchConReintento(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(q)}`);
  if (!res.ok) return []; // YGOPRODeck responde 400 cuando no hay ninguna coincidencia, no es un error real
  const data = await res.json();
  return (data?.data || []).slice(0, limite).map((c) => ({
    id: String(c.id),
    name: c.name,
    localId: c.card_sets?.[0]?.set_code || "",
    setName: c.card_sets?.[0]?.set_name || c.type || "",
    setTotal: "",
    image: c.card_images?.[0]?.image_url || null,
    precioRefMxn: precioRefDeCartaYgoprodeck(c),
  }));
}

export async function obtenerPrecioRefActualYugioh(cardApiId) {
  if (!cardApiId) return null;
  try {
    const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(cardApiId)}`);
    if (!res.ok) return null;
    const c = (await res.json())?.data?.[0];
    if (!c) return null;
    return { precioRefMxn: precioRefDeCartaYgoprodeck(c), tcgplayerUrl: null, cardmarketUrl: null };
  } catch {
    return null;
  }
}

// ---- Lorcana — lorcana-api.com, gratis y sin llave. Esta API no ofrece
// una búsqueda parcial documentada de forma confiable, así que en vez de
// arriesgar la sintaxis exacta del query se trae el catálogo completo UNA
// vez (son pocos cientos de cartas, cabe bien en memoria) y se filtra por
// nombre en el navegador — mismo patrón que ya usa obtenerListaPokemon()
// para el buscador de avatar. Aviso de honestidad: no pudimos confirmar en
// vivo los nombres exactos de los campos del JSON de esta API desde este
// entorno (proxy de red restringido) — el código intenta varias
// variantes (may­úscula/minúscula) por si acaso; si algo sale con nombre o
// imagen en blanco, avisa para ajustar el mapeo.
let _lorcanaCache = null;
async function obtenerTodasLasCartasLorcana() {
  if (_lorcanaCache) return _lorcanaCache;
  // Ojo: no se cachea un [] por error de red — si se cacheara, un fallo
  // transitorio dejaría el catálogo de Lorcana "vacío" para el resto de la
  // sesión sin volver a intentarlo nunca. Solo se guarda en cache un
  // resultado que sí llegó bien.
  const res = await fetchConReintento("https://api.lorcana-api.com/cards/all");
  const data = await res.json();
  _lorcanaCache = Array.isArray(data) ? data : (data?.cards || data?.results || []);
  return _lorcanaCache;
}

export async function buscarCartasLorcana(texto, limite = 24) {
  const q = (texto || "").trim().toLowerCase();
  if (q.length < 3) return [];
  const todas = await obtenerTodasLasCartasLorcana();
  return todas
    .filter((c) => (c.Name || c.name || "").toLowerCase().includes(q))
    .slice(0, limite)
    .map((c) => ({
      id: String(c.Unique_ID || c.id || c.Name || c.name),
      name: c.Name || c.name || "",
      localId: c.Card_Num || c.card_num || c.number || "",
      setName: c.Set_Name || c.set_name || c.set || "",
      setTotal: "",
      image: c.Image || c.image || c.Image_URL || null,
      precioRefMxn: null, // esta API no trae precio de referencia
    }));
}

// ---- Catálogo por era > set > cartas (para la vista "Catálogo", Amatista+) ----
// Cada TCG organiza sus sets de forma distinta (o de plano no tiene el
// concepto de "era" en su API), así que cada función agrupa como mejor
// corresponde a su propia fuente en vez de forzar una sola forma:
// - Pokémon: pokemontcg.io ya trae "series" (Scarlet & Violet, Sword &
//   Shield, etc.) — eso es la era.
// - Magic: Scryfall no tiene "era" como tal — se usa "set_type" (expansión,
//   commander, master, etc.) como agrupador equivalente.
// - Yu-Gi-Oh: YGOPRODeck tampoco tiene "era" oficial — se agrupa por año de
//   lanzamiento (tcg_date), que es un dato real de la API, en vez de
//   inventar nombres de era no oficiales.
// - Lorcana: son pocos sets (menos de una decena) — no hace falta agrupar
//   por era, se listan todos directo.
// Todas devuelven la misma forma [{ era, sets: [{ id, nombre, cardCount,
// imagen }] }] para que la pantalla de Catálogo use un solo componente sin
// importar el TCG (si era es null, la pantalla no dibuja encabezado de era).

let _setsPokemonCache = null;
export async function obtenerErasYSetsPokemon() {
  if (_setsPokemonCache) return _setsPokemonCache;
  // No se cachea un [] por error — si el fetch de verdad falla, se deja
  // _setsPokemonCache sin tocar para que el siguiente intento vuelva a
  // pedirlo, en vez de quedar "vacío" para siempre en esta sesión.
  const res = await fetchConReintento("https://api.pokemontcg.io/v2/sets?pageSize=250&orderBy=-releaseDate");
  const data = await res.json();
  const sets = data?.data || [];
  const porEra = new Map();
  for (const s of sets) {
    const era = s.series || "Otros";
    if (!porEra.has(era)) porEra.set(era, []);
    porEra.get(era).push({ id: s.id, nombre: s.name, cardCount: s.printedTotal, imagen: s.images?.logo || s.images?.symbol || null });
  }
  // Logo representativo de la era: el de su set más antiguo (el "set base"
  // de esa generación) — como los sets llegan ordenados por -releaseDate,
  // el último empujado a cada era es el más viejo. pokemontcg.io no tiene
  // un logo separado "de la era", así que se usa este como el más cercano.
  // Ojo: los sets de promos ("SWSH Black Star Promos", "Scarlet & Violet
  // Black Star Promos", etc.) a veces salen desde el día 1 de la era, así
  // que si no se excluyen terminan "ganando" como si fueran el set base —
  // se descartan explícitamente para esto.
  _setsPokemonCache = Array.from(porEra, ([era, sets]) => {
    const noPromo = sets.filter((s) => !/promo/i.test(s.nombre));
    const candidatos = noPromo.length ? noPromo : sets;
    const base = candidatos[candidatos.length - 1];
    return { era, sets, imagen: base?.imagen || candidatos.find((s) => s.imagen)?.imagen || null };
  });
  return _setsPokemonCache;
}

export async function obtenerCartasDeSetPokemon(setId) {
  const cartas = [];
  for (let page = 1; page <= 2; page++) {
    const res = await fetchConReintento(`https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&orderBy=number`);
    if (!res.ok) break;
    const data = await res.json();
    const lote = data?.data || [];
    cartas.push(...lote);
    if (lote.length < 250) break;
  }
  return cartas.map((c) => ({
    id: c.id, name: c.name, localId: c.number,
    image: c.images?.small || c.images?.large || null,
    precioRefMxn: precioRefDeCartaPokemonTCG(c),
  }));
}

// Nombres de set_type de Scryfall en español, para que la agrupación por
// "era" de Magic no se vea en inglés crudo. Los que no están en esta lista
// simplemente se muestran tal cual los manda Scryfall.
const SET_TYPE_LABEL_MAGIC = {
  core: "Set núcleo", expansion: "Expansión", masters: "Masters", commander: "Commander",
  draft_innovation: "Draft especial", funny: "Un-sets", starter: "Iniciación",
  duel_deck: "Duel Decks", premium_deck: "Premium Deck", from_the_vault: "From the Vault",
  archenemy: "Archenemy", planechase: "Planechase", vanguard: "Vanguard", box: "Caja especial",
  promo: "Promocionales", token: "Tokens", memorabilia: "Memorabilia", arsenal: "Arsenal",
  spellbook: "Spellbook", treasure_chest: "Treasure Chest", minigame: "Minijuego", alchemy: "Alchemy",
};

let _setsMagicCache = null;
export async function obtenerErasYSetsMagic() {
  if (_setsMagicCache) return _setsMagicCache;
  // No se cachea un [] por error — mismo criterio que obtenerErasYSetsPokemon.
  const res = await fetchConReintento("https://api.scryfall.com/sets");
  const data = await res.json();
  const sets = (data?.data || []).filter((s) => !s.digital && s.card_count > 0);
  const porEra = new Map();
  for (const s of sets) {
    const era = SET_TYPE_LABEL_MAGIC[s.set_type] || s.set_type || "Otros";
    if (!porEra.has(era)) porEra.set(era, []);
    porEra.get(era).push({ id: s.code, nombre: s.name, cardCount: s.card_count, imagen: s.icon_svg_uri || null });
  }
  _setsMagicCache = Array.from(porEra, ([era, sets]) => ({ era, sets }));
  return _setsMagicCache;
}

export async function obtenerCartasDeSetMagic(code) {
  const cartas = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${code}`)}&order=set&unique=prints`;
  for (let page = 1; page <= 3 && url; page++) {
    const res = await fetchConReintento(url);
    if (!res.ok) break;
    const data = await res.json();
    cartas.push(...(data?.data || []));
    url = data?.has_more ? data.next_page : null;
  }
  return cartas.map((c) => ({
    id: c.id, name: c.name, localId: c.collector_number,
    image: imagenDeCartaScryfall(c),
    precioRefMxn: precioRefDeCartaScryfall(c),
  }));
}

let _setsYugiohCache = null;
export async function obtenerErasYSetsYugioh() {
  if (_setsYugiohCache) return _setsYugiohCache;
  // No se cachea un [] por error — mismo criterio que obtenerErasYSetsPokemon.
  const res = await fetchConReintento("https://db.ygoprodeck.com/api/v7/cardsets.php");
  const sets = await res.json();
  const porAno = new Map();
  for (const s of Array.isArray(sets) ? sets : []) {
    const ano = (s.tcg_date || "").slice(0, 4) || "Sin fecha";
    if (!porAno.has(ano)) porAno.set(ano, []);
    porAno.get(ano).push({ id: s.set_name, nombre: s.set_name, cardCount: Number(s.num_of_cards) || null, imagen: null });
  }
  _setsYugiohCache = Array.from(porAno, ([era, sets]) => ({ era, sets }))
    .sort((a, b) => (a.era === "Sin fecha" ? 1 : b.era === "Sin fecha" ? -1 : b.era.localeCompare(a.era)));
  return _setsYugiohCache;
}

export async function obtenerCartasDeSetYugioh(setName) {
  const res = await fetchConReintento(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(setName)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.data || []).map((c) => ({
    id: String(c.id), name: c.name,
    localId: c.card_sets?.find((s) => s.set_name === setName)?.set_code || "",
    image: c.card_images?.[0]?.image_url_small || c.card_images?.[0]?.image_url || null,
    precioRefMxn: precioRefDeCartaYgoprodeck(c),
  }));
}

export async function obtenerSetsLorcana() {
  const todas = await obtenerTodasLasCartasLorcana();
  const nombres = [];
  const vistos = new Set();
  for (const c of todas) {
    const set = c.Set_Name || c.set_name || c.set;
    if (!set || vistos.has(set)) continue;
    vistos.add(set);
    nombres.push(set);
  }
  const sets = nombres.map((nombre) => ({
    id: nombre, nombre, cardCount: todas.filter((c) => (c.Set_Name || c.set_name || c.set) === nombre).length, imagen: null,
  }));
  return [{ era: null, sets }];
}

export async function obtenerCartasDeSetLorcana(setNombre) {
  const todas = await obtenerTodasLasCartasLorcana();
  return todas
    .filter((c) => (c.Set_Name || c.set_name || c.set) === setNombre)
    .map((c) => ({
      id: String(c.Unique_ID || c.id || c.Name || c.name),
      name: c.Name || c.name || "",
      localId: c.Card_Num || c.card_num || c.number || "",
      image: c.Image || c.image || c.Image_URL || null,
      precioRefMxn: null,
    }));
}

// Despachador único para las 4 TCG con catálogo (ver TCG_CON_CATALOGO en
// theme.js). One Piece no entra aquí — su catálogo de "sets" sale de
// TCGCSV (categoriaIdTCGplayer + /groups), igual que TCGplayerPicker, ver
// App.jsx.
export async function obtenerErasYSetsCatalogo(tcg) {
  if (tcg === "pokemon") return obtenerErasYSetsPokemon();
  if (tcg === "magic") return obtenerErasYSetsMagic();
  if (tcg === "yugioh") return obtenerErasYSetsYugioh();
  if (tcg === "lorcana") return obtenerSetsLorcana();
  return [];
}

export async function obtenerCartasDeSetCatalogo(tcg, setId) {
  if (tcg === "pokemon") return obtenerCartasDeSetPokemon(setId);
  if (tcg === "magic") return obtenerCartasDeSetMagic(setId);
  if (tcg === "yugioh") return obtenerCartasDeSetYugioh(setId);
  if (tcg === "lorcana") return obtenerCartasDeSetLorcana(setId);
  return [];
}

// Elige el catálogo correcto según el TCG de la publicación (ver
// TCG_CON_CATALOGO en theme.js: qué TCG ya tienen buscador de texto libre).
// One Piece todavía no tiene una fuente gratis confiable de texto libre —
// usa TCGplayerPicker (elegir set, luego buscar dentro de ese set) en vez
// de este despachador; ver App.jsx.
export async function buscarCartasCatalogo(tcg, texto) {
  if (tcg === "magic") return buscarCartasMagic(texto);
  if (tcg === "pokemon") return buscarCartasVisual(texto);
  if (tcg === "yugioh") return buscarCartasYugioh(texto);
  if (tcg === "lorcana") return buscarCartasLorcana(texto);
  return [];
}

export async function obtenerPrecioRefActualPorTcg(tcg, cardApiId) {
  if (tcg === "magic") return obtenerPrecioRefActualMagic(cardApiId);
  if (tcg === "yugioh") return obtenerPrecioRefActualYugioh(cardApiId);
  // Pokémon usa pokemontcg.io; Lorcana/One Piece no tienen precio en vivo
  // propio todavía, así que caen aquí también (esta llamada falla en
  // silencio si el id no es de pokemontcg.io, sin romper la pantalla).
  return obtenerPrecioRefActual(cardApiId);
}

// ---- Categorías de TCGplayer (vía TCGCSV, api/tcgcsv.js) ----
// TCGplayer usa un "categoryId" numérico para cada juego (Pokémon, Magic,
// etc.), pero esos números no están documentados públicamente y no son
// adivinables con confianza (sobre todo para juegos que TCGplayer agregó
// hace poco, como Lorcana o One Piece). En vez de arriesgarnos a
// hardcodear un ID equivocado (fallaría en silencio, sin resultados, para
// siempre), se busca el ID real por nombre contra el catálogo en vivo de
// categorías — se cachea en memoria porque casi no cambia.
const PATRON_NOMBRE_CATEGORIA_TCGPLAYER = {
  pokemon: /pok[eé]mon/i,
  magic: /magic/i,
  yugioh: /yu-?gi-?oh/i,
  lorcana: /lorcana/i,
  onepiece: /one piece/i,
};

let _categoriasTCGplayerCache = null;
async function obtenerCategoriasTCGplayer() {
  if (_categoriasTCGplayerCache) return _categoriasTCGplayerCache;
  // No se cachea un [] por error — mismo criterio que obtenerErasYSetsPokemon.
  const res = await fetchConReintento("/api/tcgcsv?path=tcgplayer/categories");
  const data = await res.json();
  _categoriasTCGplayerCache = data?.results || [];
  return _categoriasTCGplayerCache;
}

export async function categoriaIdTCGplayer(tcg) {
  const patron = PATRON_NOMBRE_CATEGORIA_TCGPLAYER[tcg];
  if (!patron) return null;
  const categorias = await obtenerCategoriasTCGplayer();
  const encontrada = categorias.find((c) => patron.test(c.name || ""));
  return encontrada?.categoryId ?? null;
}

// Precio de referencia "en vivo" para la ficha de detalle de una publicación:
// se consulta pokemontcg.io por el id exacto de la carta (en vez de usar el
// precio_ref_mxn guardado al momento de publicar, que puede quedar viejo).
// pokemontcg.io ya trae los precios de TCGplayer y Cardmarket en la misma
// respuesta, así que no hace falta integrar otro proveedor (Pricecharting,
// Collectr, etc.) por separado.
export async function obtenerPrecioRefActual(cardApiId) {
  if (!cardApiId) return null;
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${encodeURIComponent(cardApiId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.data;
    if (!c) return null;
    return {
      precioRefMxn: precioRefDeCartaPokemonTCG(c),
      tcgplayerUrl: c.tcgplayer?.url || null,
      cardmarketUrl: c.cardmarket?.url || null,
    };
  } catch {
    return null;
  }
}
