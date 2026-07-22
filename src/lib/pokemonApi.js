import { USD_TO_MXN, EUR_TO_MXN } from "../theme.js";

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

  const peticiones = combos.map(async ({ nombre, set }) => {
    const query = construirQueryPokemonTCG({ nombre, set, numero });
    if (!query) return [];
    try {
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${itemsPorCombo}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data?.data || [];
    } catch {
      return [];
    }
  });

  const listas = await Promise.all(peticiones);
  const vistos = new Set();
  const combinado = [];
  for (const lista of listas) {
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
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=name&unique=cards`);
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
  } catch {
    return [];
  }
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

// Elige el catálogo correcto según el TCG de la publicación. Hoy solo
// Pokémon y Magic tienen buscador visual con imagen/precio (TCG_CON_CATALOGO
// en theme.js) — Yu-Gi-Oh, Lorcana y One Piece siguen en texto libre hasta
// que se conecte su propia fuente, con este mismo patrón.
export async function buscarCartasCatalogo(tcg, texto) {
  if (tcg === "magic") return buscarCartasMagic(texto);
  if (tcg === "pokemon") return buscarCartasVisual(texto);
  return [];
}

export async function obtenerPrecioRefActualPorTcg(tcg, cardApiId) {
  if (tcg === "magic") return obtenerPrecioRefActualMagic(cardApiId);
  return obtenerPrecioRefActual(cardApiId);
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
