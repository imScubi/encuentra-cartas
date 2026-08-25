import { USD_TO_MXN, EUR_TO_MXN } from "../theme.js";

// ---- Llave gratuita opcional de pokemontcg.io ----
// pokemontcg.io es, con mucho, la fuente más castigada por su propio límite
// de tasa sin llave (Pokémon es el TCG con más tráfico de búsqueda de la
// app) -- registrarse es gratis e instantáneo en https://pokemontcg.io/ y
// sube ese límite bastante. Se lee de una variable de entorno de Vite para
// no depender de que alguien la escriba directo en el código; si no está
// puesta, todo sigue funcionando exactamente igual que antes (sin llave).
const POKEMONTCG_API_KEY = import.meta.env?.VITE_POKEMONTCG_API_KEY || null;
const HEADERS_POKEMONTCG = POKEMONTCG_API_KEY ? { "X-Api-Key": POKEMONTCG_API_KEY } : undefined;

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
// "signal" (opcional) es un AbortSignal: cuando quien busca ya escribió la
// siguiente letra o cerró el buscador, CardPicker cancela la petición
// anterior en vez de dejarla viva compitiendo por ancho de banda/cupo de
// tasa con la petición nueva (antes se seguía esperando su respuesta aunque
// a nadie ya le importara, lo que hacía más lenta a la búsqueda vigente y
// gastaba peticiones del límite gratuito de la API sin necesidad).
// "headers" (opcional) se usa solo para mandar la llave de pokemontcg.io
// cuando existe (ver POKEMONTCG_API_KEY más abajo).
async function fetchConReintento(url, intentos = 3, esperaBaseMs = 500, signal, headers) {
  let ultimoError;
  const opciones = {};
  if (signal) opciones.signal = signal;
  if (headers) opciones.headers = headers;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, opciones);
      if (res.ok) return res;
      // Un 429 (límite de tasa) o 5xx vale la pena reintentar; un 4xx normal
      // (ej. 404 de "sin resultados") no va a cambiar si lo repetimos.
      if (res.status !== 429 && res.status < 500) return res;
      ultimoError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Cancelado a propósito (búsqueda nueva o se cerró el buscador) --
      // no tiene caso reintentar algo que ya nadie espera.
      if (e?.name === "AbortError") throw e;
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
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=20`, HEADERS_POKEMONTCG ? { headers: HEADERS_POKEMONTCG } : undefined);
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

// Mismo "Buscar foto" que buscarImagenRespaldo, pero para Magic (Scryfall)
// -- antes el botón "🔄 Buscar foto" llamaba SIEMPRE a buscarImagenRespaldo
// (Pokémon/pokemontcg.io) sin importar el TCG real de la carta, así que
// para Magic, Yu-Gi-Oh y Lorcana nunca podía encontrar nada -- "No se
// encontró la versión exacta" en el 100% de los casos, ni siquiera lo
// intentaba con la API correcta. Ver buscarImagenRespaldoPorTcg más abajo,
// el despachador que ahora usa ReintentarImagen en App.jsx.
// `!"nombre"` en la sintaxis de Scryfall es coincidencia EXACTA de nombre
// (no difusa), a propósito: mismo criterio que la versión de Pokémon, mejor
// no traer nada que traer la imagen de una carta distinta con nombre parecido.
async function buscarImagenRespaldoMagic(nombre, numero, setNombre) {
  if (!nombre) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${nombre}"`)}`);
    if (!res.ok) return null;
    const data = await res.json();
    let cartas = data?.data || [];
    if (!cartas.length) return null;
    if (numero) {
      const exactas = cartas.filter((c) => String(c.collector_number).toLowerCase() === String(numero).toLowerCase());
      if (exactas.length) cartas = exactas;
    }
    if (setNombre && cartas.length > 1) {
      const porSet = cartas.filter((c) => (c.set_name || "").toLowerCase() === setNombre.toLowerCase());
      if (porSet.length) cartas = porSet;
    }
    return imagenDeCartaScryfall(cartas[0]) || null;
  } catch {
    return null;
  }
}

// Mismo criterio para Yu-Gi-Oh (YGOPRODeck) -- "fname" ya es fuzzy por
// nombre; se filtra por set_code/set_name después para no arriesgar la
// imagen de una versión distinta si hay varias impresiones con ese nombre.
async function buscarImagenRespaldoYugioh(nombre, numero, setNombre) {
  if (!nombre) return null;
  try {
    const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(nombre)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const cartas = data?.data || [];
    if (!cartas.length) return null;
    const exacta = cartas.find((c) => (c.name || "").toLowerCase() === nombre.toLowerCase())
      || cartas.find((c) => (c.card_sets || []).some((s) => s.set_code === numero || s.set_name === setNombre))
      || cartas[0];
    return exacta.card_images?.[0]?.image_url || null;
  } catch {
    return null;
  }
}

// Mismo criterio para Lorcana -- ya trae todas las cartas cacheadas
// (obtenerTodasLasCartasLorcana), así que aquí solo se filtra en memoria.
async function buscarImagenRespaldoLorcana(nombre, numero, setNombre) {
  if (!nombre) return null;
  try {
    const todas = await obtenerTodasLasCartasLorcana();
    const candidatas = todas.filter((c) => (c.Name || c.name || "").toLowerCase() === nombre.toLowerCase());
    if (!candidatas.length) return null;
    const exacta = candidatas.find((c) => String(c.Card_Num || c.card_num || c.number || "") === String(numero || ""))
      || candidatas.find((c) => (c.Set_Name || c.set_name || c.set || "") === setNombre)
      || candidatas[0];
    return exacta.Image || exacta.image || exacta.Image_URL || null;
  } catch {
    return null;
  }
}

// Despachador único de "Buscar foto" (ReintentarImagen en App.jsx) según el
// TCG real de la publicación -- One Piece no tiene todavía una fuente
// gratis de texto libre (ver TCG_CON_CATALOGO en theme.js), así que no
// intenta nada y regresa null directo, igual que si no encontrara nada.
export async function buscarImagenRespaldoPorTcg(tcg, nombre, numero, setNombre) {
  if (tcg === "magic") return buscarImagenRespaldoMagic(nombre, numero, setNombre);
  if (tcg === "yugioh") return buscarImagenRespaldoYugioh(nombre, numero, setNombre);
  if (tcg === "lorcana") return buscarImagenRespaldoLorcana(nombre, numero, setNombre);
  return buscarImagenRespaldo(nombre, numero, setNombre);
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

// Coincidencia parcial con comodín en cada palabra por separado (en vez de
// exigir la frase completa entre comillas cuando hay más de una palabra).
// Antes, un nombre o set de dos o más palabras ("Pikachu VMAX", "Journey
// Together") solo encontraba algo si coincidía EXACTO -- mientras alguien
// seguía escribiendo ("Pikachu V", "Journey Toge...") no salía nada, como si
// el buscador estuviera roto. Con un comodín por palabra, cada una se busca
// por separado (con AND implícito entre ellas) y ya no hace falta terminar
// de escribir la frase completa para empezar a ver resultados.
function terminoDeCampo(campo, frase) {
  if (!frase) return null;
  const palabras = frase.trim().split(/\s+/).filter(Boolean);
  return palabras.map((p) => `${campo}:${p}*`).join(" ");
}

function construirQueryPokemonTCG({ nombre, set, numero }) {
  const partes = [];
  const nombreTerm = terminoDeCampo("name", nombre);
  if (nombreTerm) partes.push(nombreTerm);
  const setTerm = terminoDeCampo("set.name", set);
  if (setTerm) partes.push(setTerm);
  if (numero) partes.push(`number:${numero}`);
  return partes.join(" ");
}

// "market" (precio basado en ventas reales) es el más confiable, pero una
// carta recién salida todavía no acumula ventas suficientes para tenerlo --
// en ese caso se usa "mid" o "low" (el rango que TCGplayer sí calcula desde
// el día 1, con base en las publicaciones activas) en vez de dejar el
// precio de referencia en blanco. Lo mismo del lado de Cardmarket: si no
// hay "trendPrice" (que también depende de ventas históricas) se prueba con
// el precio promedio de venta o el más bajo disponible.
// Regresa { precioMxn, fuente } en vez de solo el número -- "fuente" es de
// dónde salió ese precio (TCGplayer o Cardmarket), para poder mostrarlo
// junto al precio de referencia en vez de dejar que parezca un número que
// la app se inventó.
function precioRefDeCartaPokemonTCG(c) {
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const variante = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || tp["1stEditionHolofoil"];
    const precio = variante?.market ?? variante?.mid ?? variante?.low;
    if (precio) return { precioMxn: Math.round(precio * USD_TO_MXN), fuente: "TCGplayer" };
  }
  const cm = c.cardmarket?.prices;
  if (cm) {
    const precio = cm.trendPrice ?? cm.averageSellPrice ?? cm.avg1 ?? cm.lowPrice;
    if (precio) return { precioMxn: Math.round(precio * EUR_TO_MXN), fuente: "Cardmarket" };
  }
  return { precioMxn: null, fuente: null };
}

function mapearYOrdenarCartasPokemonTCG(cartas, numero) {
  const combinado = [...cartas];
  if (numero) {
    combinado.sort((a, b) => {
      const aExacta = String(a.number).toLowerCase() === String(numero).toLowerCase();
      const bExacta = String(b.number).toLowerCase() === String(numero).toLowerCase();
      return bExacta - aExacta;
    });
  }
  return combinado.slice(0, 24).map((c) => {
    const precio = precioRefDeCartaPokemonTCG(c);
    return {
      id: c.id,
      name: c.name,
      localId: c.number,
      setName: c.set?.name || "",
      setTotal: c.set?.printedTotal || c.set?.total || "",
      image: c.images?.large || c.images?.small || null,
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
    };
  });
}

// ---- Respaldo en TCGdex para cuando pokemontcg.io no encuentra nada --
// pokemontcg.io está en modo legado (su equipo movió el desarrollo activo a
// Scrydex, un producto de paga -- ver https://pokemontcg.io/) y ya no recibe
// cartas/sets nuevos, así que cualquier set reciente (promos "First Partner"
// de 2026, o cualquier expansión que salga de aquí en adelante) puede
// tardar mucho -- o no llegar nunca -- a su catálogo. TCGdex es un proyecto
// comunitario que sigue actualizándose, y también cataloga mejor las
// promos/premios de liga/staff en español (o cualquier variante regional)
// que pokemontcg.io casi nunca tiene aunque sean cartas oficiales reales.
// No hay garantía de que tenga TODO (nadie tiene un catálogo 100% completo
// de cada promo jamás impresa), pero amplía bastante las probabilidades sin
// arriesgar nada: solo se intenta si pokemontcg.io ya conectó bien y de
// verdad no trajo nada, nunca reemplaza esa búsqueda. Se prueba primero en
// inglés (el idioma en el que sale un set nuevo primero, normalmente) y
// luego en español si el inglés tampoco trajo nada -- así se cubren tanto
// sets recién anunciados en EE.UU. como promos regionales en español.
// No da precio de referencia (TCGdex no trae precio de mercado) -- se dice
// "sin precio" en vez de inventar uno.
async function buscarCartasVisualTCGdexIdioma(idioma, texto, numero, limite, signal) {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/${idioma}/cards?name=${encodeURIComponent(texto)}&pagination:itemsPerPage=${limite}`, { signal });
    if (!res.ok) return [];
    const lista = await res.json();
    if (!Array.isArray(lista) || !lista.length) return [];
    const numeroLimpio = numero ? String(numero).split("/")[0].trim().toLowerCase() : null;
    const ordenada = numeroLimpio
      ? [...lista].sort((a, b) => (b.localId?.toLowerCase() === numeroLimpio) - (a.localId?.toLowerCase() === numeroLimpio))
      : lista;
    const detalles = await Promise.all(
      ordenada.slice(0, limite).map((c) =>
        fetch(`https://api.tcgdex.net/v2/${idioma}/cards/${c.id}`, { signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      )
    );
    return detalles.filter(Boolean).map((full) => {
      const total = full.set?.cardCount?.official || full.set?.cardCount?.total || "";
      return {
        id: full.id,
        name: full.name,
        localId: full.localId,
        setName: full.set?.name || "",
        setTotal: total,
        image: full.image ? `${full.image}/high.webp` : null,
        precioRefMxn: null,
        precioRefFuente: null,
      };
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return [];
  }
}

async function buscarCartasVisualTCGdex(texto, numero, limite, signal) {
  const enIngles = await buscarCartasVisualTCGdexIdioma("en", texto, numero, limite, signal);
  if (enIngles.length > 0) return enIngles;
  return buscarCartasVisualTCGdexIdioma("es", texto, numero, limite, signal);
}

export async function buscarCartasVisual(texto, itemsPorCombo = 8, signal) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const { restante, numero } = extraerNumeroDeTexto(q);
  const combos = generarCombinacionesNombreSet(restante);

  // Antes se mandaban las hasta 5 combinaciones en paralelo en CADA
  // búsqueda -- pokemontcg.io es gratis y sin llave (para no pedirle una
  // cuenta a quien busca), así que su límite de tasa es estricto, y 5
  // peticiones simultáneas por cada pausa al escribir lo saturaba seguido.
  // Eso se sentía, del lado de quien buscaba, como "a veces no encuentra
  // nada" de forma intermitente y sin razón aparente (un 429 se veía igual
  // que "no existe esa carta"). Ahora se prueban las combinaciones EN
  // ORDEN y se para en la primera que sí trae algo -- la enorme mayoría de
  // las búsquedas se resuelven con la primera o segunda combinación, así
  // que en la práctica esto manda muchas menos peticiones por búsqueda.
  let algunaConectoBien = false;
  let ultimoError = null;
  for (const { nombre, set } of combos) {
    const query = construirQueryPokemonTCG({ nombre, set, numero });
    if (!query) continue;
    try {
      const res = await fetchConReintento(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=${itemsPorCombo}`, 3, 500, signal, HEADERS_POKEMONTCG);
      algunaConectoBien = true;
      if (!res.ok) continue; // 404 normal de "esta combinación no existe" -- se prueba la siguiente
      const data = await res.json();
      const cartas = data?.data || [];
      if (cartas.length > 0) return mapearYOrdenarCartasPokemonTCG(cartas, numero);
    } catch (e) {
      // Cancelado a propósito -- no tiene caso seguir probando más
      // combinaciones de una búsqueda que ya nadie espera.
      if (e?.name === "AbortError") throw e;
      // Falló de verdad esta combinación (agotó los reintentos) -- se
      // prueba la siguiente combinación en vez de rendirse de una vez.
      ultimoError = e;
    }
  }
  // Solo es un error real (que se le avisa a quien busca) si NINGUNA
  // combinación logró siquiera conectarse -- si alguna sí conectó pero
  // ninguna trajo resultados, de verdad no existe esa carta EN pokemontcg.io
  // (ver buscarCartasVisualTCGdex: puede que sí exista ahí -- un set nuevo
  // que pokemontcg.io (legado) todavía no tiene, o una promo/premio/liga/
  // staff en español catalogada solo en TCGdex).
  if (!algunaConectoBien) {
    throw ultimoError instanceof Error ? ultimoError : new Error("No se pudo conectar con el catálogo de Pokémon.");
  }
  const deTCGdex = await buscarCartasVisualTCGdex(restante || q, numero, itemsPorCombo, signal);
  if (deTCGdex.length > 0) return deTCGdex;
  return [];
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

// Regresa { precioMxn, fuente } -- Scryfall documenta que sus precios "usd"
// vienen de TCGplayer y los "eur" de Cardmarket, así que se le atribuye la
// fuente real y no "Scryfall" (que solo es quien lo reenvía).
function precioRefDeCartaScryfall(c) {
  // "usd_etched" (versión con acabado "etched") como último respaldo -- no
  // cubre el caso de una carta genuinamente recién salida sin ninguna venta
  // registrada todavía, pero sí ayuda con variantes de foil que a veces
  // llegan sin el precio "usd" normal pero sí con el de etched.
  const usd = c.prices?.usd || c.prices?.usd_foil || c.prices?.usd_etched;
  if (usd) return { precioMxn: Math.round(Number(usd) * USD_TO_MXN), fuente: "TCGplayer" };
  const eur = c.prices?.eur || c.prices?.eur_foil || c.prices?.eur_etched;
  if (eur) return { precioMxn: Math.round(Number(eur) * EUR_TO_MXN), fuente: "Cardmarket" };
  return { precioMxn: null, fuente: null };
}

export async function buscarCartasMagic(texto, limite = 24, signal) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const res = await fetchConReintento(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=name&unique=cards`, 3, 500, signal);
  if (!res.ok) return []; // incluye el 404 de "sin resultados" de Scryfall, no es un error real
  const data = await res.json();
  return (data?.data || []).slice(0, limite).map((c) => {
    const precio = precioRefDeCartaScryfall(c);
    return {
      id: c.id,
      name: c.name,
      localId: c.collector_number,
      setName: c.set_name || "",
      setTotal: "",
      image: imagenDeCartaScryfall(c),
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
    };
  });
}

export async function obtenerPrecioRefActualMagic(cardApiId) {
  if (!cardApiId) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(cardApiId)}`);
    if (!res.ok) return null;
    const c = await res.json();
    const precio = precioRefDeCartaScryfall(c);
    return {
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
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
// Regresa { precioMxn, fuente } -- a diferencia de Pokémon/Magic, YGOPRODeck
// junta varias fuentes de precio distintas en la misma respuesta, así que
// aquí sí importa cuál de ellas fue realmente la que trajo el número.
function precioRefDeCartaYgoprodeck(c) {
  const precios = c.card_prices?.[0];
  if (!precios) return { precioMxn: null, fuente: null };
  const candidatosUsd = [
    ["TCGplayer", precios.tcgplayer_price],
    ["eBay", precios.ebay_price],
    ["Amazon", precios.amazon_price],
    ["CoolStuffInc", precios.coolstuffinc_price],
  ];
  for (const [fuente, valor] of candidatosUsd) {
    const usd = Number(valor || 0);
    if (usd > 0) return { precioMxn: Math.round(usd * USD_TO_MXN), fuente };
  }
  const eur = Number(precios.cardmarket_price || 0);
  if (eur > 0) return { precioMxn: Math.round(eur * EUR_TO_MXN), fuente: "Cardmarket" };
  return { precioMxn: null, fuente: null };
}

export async function buscarCartasYugioh(texto, limite = 24, signal) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const res = await fetchConReintento(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(q)}`, 3, 500, signal);
  if (!res.ok) return []; // YGOPRODeck responde 400 cuando no hay ninguna coincidencia, no es un error real
  const data = await res.json();
  return (data?.data || []).slice(0, limite).map((c) => {
    const precio = precioRefDeCartaYgoprodeck(c);
    return {
      id: String(c.id),
      name: c.name,
      localId: c.card_sets?.[0]?.set_code || "",
      setName: c.card_sets?.[0]?.set_name || c.type || "",
      setTotal: "",
      image: c.card_images?.[0]?.image_url || null,
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
    };
  });
}

export async function obtenerPrecioRefActualYugioh(cardApiId) {
  if (!cardApiId) return null;
  try {
    const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(cardApiId)}`);
    if (!res.ok) return null;
    const c = (await res.json())?.data?.[0];
    if (!c) return null;
    const precio = precioRefDeCartaYgoprodeck(c);
    return { precioRefMxn: precio.precioMxn, precioRefFuente: precio.fuente, tcgplayerUrl: null, cardmarketUrl: null };
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
async function obtenerTodasLasCartasLorcana(signal) {
  if (_lorcanaCache) return _lorcanaCache;
  // Ojo: no se cachea un [] por error de red — si se cacheara, un fallo
  // transitorio dejaría el catálogo de Lorcana "vacío" para el resto de la
  // sesión sin volver a intentarlo nunca. Solo se guarda en cache un
  // resultado que sí llegó bien.
  const res = await fetchConReintento("https://api.lorcana-api.com/cards/all", 3, 500, signal);
  const data = await res.json();
  _lorcanaCache = Array.isArray(data) ? data : (data?.cards || data?.results || []);
  return _lorcanaCache;
}

export async function buscarCartasLorcana(texto, limite = 24, signal) {
  const q = (texto || "").trim().toLowerCase();
  if (q.length < 3) return [];
  const todas = await obtenerTodasLasCartasLorcana(signal);
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
  const res = await fetchConReintento("https://api.pokemontcg.io/v2/sets?pageSize=250&orderBy=-releaseDate", 3, 500, undefined, HEADERS_POKEMONTCG);
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
    const res = await fetchConReintento(`https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}&pageSize=250&page=${page}&orderBy=number`, 3, 500, undefined, HEADERS_POKEMONTCG);
    if (!res.ok) break;
    const data = await res.json();
    const lote = data?.data || [];
    cartas.push(...lote);
    if (lote.length < 250) break;
  }
  return cartas.map((c) => {
    const precio = precioRefDeCartaPokemonTCG(c);
    return {
      id: c.id, name: c.name, localId: c.number,
      image: c.images?.small || c.images?.large || null,
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
    };
  });
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
  return cartas.map((c) => {
    const precio = precioRefDeCartaScryfall(c);
    return {
      id: c.id, name: c.name, localId: c.collector_number,
      image: imagenDeCartaScryfall(c),
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
    };
  });
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
  return (data?.data || []).map((c) => {
    const precio = precioRefDeCartaYgoprodeck(c);
    return {
      id: String(c.id), name: c.name,
      localId: c.card_sets?.find((s) => s.set_name === setName)?.set_code || "",
      image: c.card_images?.[0]?.image_url_small || c.card_images?.[0]?.image_url || null,
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
    };
  });
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
// Estos 3 despachadores son el único punto por el que la pantalla de
// Catálogo y el buscador de cartas llegan a las APIs externas de cada TCG
// (ver App.jsx) -- por eso atrapan aquí cualquier falla de red/límite de
// tasa que sobreviva a los reintentos de fetchConReintento, en vez de
// dejarla reventar como promesa sin atrapar. Antes, si pokemontcg.io/
// Scryfall/YGOPRODeck fallaban las 3 veces, el error se colaba sin que
// nadie lo esperara y disparaba un aviso "🔴 Error detectado" al admin por
// cada usuario que tuvo la mala suerte de toparse con una caída momentánea
// de una API gratuita de terceros -- ruido que nadie puede arreglar del
// lado de la app. Ahora se degrada a "sin resultados" (la pantalla ya
// sabe mostrar "no pudimos cargar los sets/cartas" cuando la lista viene
// vacía), y solo se sigue avisando si es un bug de verdad de nuestro código.
export async function obtenerErasYSetsCatalogo(tcg) {
  try {
    if (tcg === "pokemon") return await obtenerErasYSetsPokemon();
    if (tcg === "magic") return await obtenerErasYSetsMagic();
    if (tcg === "yugioh") return await obtenerErasYSetsYugioh();
    if (tcg === "lorcana") return await obtenerSetsLorcana();
    return [];
  } catch {
    return [];
  }
}

export async function obtenerCartasDeSetCatalogo(tcg, setId) {
  try {
    if (tcg === "pokemon") return await obtenerCartasDeSetPokemon(setId);
    if (tcg === "magic") return await obtenerCartasDeSetMagic(setId);
    if (tcg === "yugioh") return await obtenerCartasDeSetYugioh(setId);
    if (tcg === "lorcana") return await obtenerCartasDeSetLorcana(setId);
    return [];
  } catch {
    return [];
  }
}

// Cache de resultados de búsqueda por (tcg + texto exacto), de corta
// duración -- mientras alguien escribe suele pausarse, borrar una letra y
// volver a escribirla, o reabrir el buscador para la misma carta que ya
// buscó hace un momento; sin esto cada una de esas repeticiones vuelve a
// gastar una petición completa contra la API externa (y su límite de tasa)
// por algo que ya se sabía. 2 minutos es corto a propósito: lo justo para
// cubrir ese vaivén normal de tipeo sin arriesgarse a mostrar un precio de
// referencia desactualizado por mucho tiempo.
const CACHE_BUSQUEDA_TTL_MS = 2 * 60 * 1000;
const _cacheBusqueda = new Map();

// ---- Respaldo experimental: apitcg.com (ver sección 129 de
// SUSCRIPCIONES.md) -- un solo API cubre Pokémon/Magic/Yu-Gi-Oh/Lorcana (y
// varios más) con esquema consistente, imagen y precio real de TCGplayer en
// la misma respuesta. A diferencia de pokemontcg.io/Scryfall/YGOPRODeck/
// lorcana-api (llamadas directas desde el navegador, todas sin llave o con
// llave opcional), esta sí necesita una llave secreta de verdad -- por eso
// NO se llama directo desde aquí, sino a través de /api/tcgcsv?fuente=apitcg
// (ver api/tcgcsv.js), que la manda en el header `x-api-key` desde el
// servidor. Es el ÚLTIMO intento, después de la fuente principal de cada
// TCG (y de TCGdex también, en Pokémon) -- nunca las reemplaza, solo amplía
// las probabilidades de encontrar algo cuando de plano nadie más lo tiene
// todavía. Si la llave no está configurada en el servidor (variable de
// entorno APITCG_API_KEY en Vercel) o si apitcg.com falla, se degrada en
// silencio a "sin resultados" -- nunca rompe una búsqueda que ya funcionaba.
const TCG_SLUG_APITCG = { pokemon: "pokemon", magic: "magic", yugioh: "yugioh", lorcana: "lorcana", onepiece: "one-piece" };

function mapearProductoApiTCG(p) {
  const precio = p?.markets?.tcgplayer?.prices?.market ?? p?.markets?.tcgplayer?.prices?.mid ?? p?.markets?.tcgplayer?.prices?.low ?? null;
  return {
    id: `apitcg:${p._id}`,
    name: p.name,
    localId: p.attributes?.Number || p.code || "",
    setName: p.set?.name || "",
    setTotal: "",
    image: p.images?.[0]?.large || p.images?.[0]?.medium || p.images?.[0]?.small || null,
    precioRefMxn: precio != null ? Math.round(Number(precio) * USD_TO_MXN) : null,
    precioRefFuente: precio != null ? "TCGplayer" : null,
  };
}

async function buscarCartasVisualApiTCG(tcg, texto, limite, signal) {
  const slug = TCG_SLUG_APITCG[tcg];
  if (!slug) return [];
  try {
    const path = `api/products?${new URLSearchParams({ tcg: slug, type: "card", name: texto, limit: String(limite) })}`;
    const res = await fetch(`/api/tcgcsv?fuente=apitcg&path=${encodeURIComponent(path)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data || []).map(mapearProductoApiTCG);
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return [];
  }
}

// Elige el catálogo correcto según el TCG de la publicación (ver
// TCG_CON_CATALOGO en theme.js: qué TCG ya tienen buscador de texto libre).
// One Piece todavía no tiene una fuente gratis confiable de texto libre —
// usa TCGplayerPicker (elegir set, luego buscar dentro de ese set) en vez
// de este despachador; ver App.jsx.
// A diferencia de obtenerErasYSetsCatalogo/obtenerCartasDeSetCatalogo, este
// despachador SÍ distingue una caída real de conexión de un "sin
// resultados" genuino (ver más abajo): su único punto de uso (CardPicker,
// el cuadro de búsqueda al publicar una carta) usa esa distinción para
// mostrarle a quien está publicando el mensaje correcto en cada caso.
// "signal" (opcional): CardPicker cancela la búsqueda anterior en cuanto
// hay una nueva, para no dejar peticiones viejas compitiendo con la vigente.
export async function buscarCartasCatalogo(tcg, texto, signal) {
  const clave = `${tcg}::${(texto || "").trim().toLowerCase()}`;
  const enCache = _cacheBusqueda.get(clave);
  if (enCache && Date.now() - enCache.ts < CACHE_BUSQUEDA_TTL_MS) return enCache.resultado;

  let resultado = [];
  let fuentePrincipalFallo = false;
  try {
    if (tcg === "magic") resultado = await buscarCartasMagic(texto, 24, signal);
    else if (tcg === "pokemon") resultado = await buscarCartasVisual(texto, 8, signal);
    else if (tcg === "yugioh") resultado = await buscarCartasYugioh(texto, 24, signal);
    else if (tcg === "lorcana") resultado = await buscarCartasLorcana(texto, 24, signal);
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    fuentePrincipalFallo = true;
  }

  // Se prueba apitcg.com tanto si la fuente principal no trajo nada como si
  // de plano falló la conexión -- así una caída momentánea de Scryfall/
  // pokemontcg.io/YGOPRODeck/lorcana-api ya no se traduce automáticamente
  // en "no se pudo conectar" si apitcg.com sí responde.
  if (resultado.length === 0) {
    const deApiTCG = await buscarCartasVisualApiTCG(tcg, texto, 24, signal);
    if (deApiTCG.length > 0) resultado = deApiTCG;
    else if (fuentePrincipalFallo) throw new Error("No se pudo conectar con el catálogo. Intenta de nuevo en un momento.");
  }

  if (_cacheBusqueda.size > 200) _cacheBusqueda.clear(); // tope simple, no hace falta ser precisos aquí
  _cacheBusqueda.set(clave, { ts: Date.now(), resultado });
  return resultado;
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
  try {
    const categorias = await obtenerCategoriasTCGplayer();
    const encontrada = categorias.find((c) => patron.test(c.name || ""));
    return encontrada?.categoryId ?? null;
  } catch {
    return null;
  }
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
    const precio = precioRefDeCartaPokemonTCG(c);
    return {
      precioRefMxn: precio.precioMxn,
      precioRefFuente: precio.fuente,
      tcgplayerUrl: c.tcgplayer?.url || null,
      cardmarketUrl: c.cardmarket?.url || null,
    };
  } catch {
    return null;
  }
}
