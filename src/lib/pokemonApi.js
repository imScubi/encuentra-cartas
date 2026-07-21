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
// Together"). Cada combinación se manda como filtro a TCGdex en paralelo;
// las que no existen en su catálogo simplemente no traen resultados, así
// que no hace falta saber de antemano cuáles palabras son el set.
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

export async function buscarCartasVisual(texto, itemsPorCombo = 8) {
  const q = (texto || "").trim();
  if (q.length < 3) return [];
  const { restante, numero } = extraerNumeroDeTexto(q);
  const combos = generarCombinacionesNombreSet(restante);

  const peticiones = combos.map(async ({ nombre, set }) => {
    if (!nombre && !set && !numero) return [];
    const partes = [];
    if (nombre) partes.push(`name=${encodeURIComponent(nombre)}`);
    if (set) partes.push(`set.name=${encodeURIComponent(set)}`);
    if (numero) partes.push(`localId=${encodeURIComponent(numero)}`);
    partes.push(`pagination:itemsPerPage=${itemsPorCombo}`);
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards?${partes.join("&")}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
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
  if (numero) combinado.sort((a, b) => (b.localId === numero) - (a.localId === numero));
  return combinado.slice(0, 24);
}
