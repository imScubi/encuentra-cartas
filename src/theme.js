export const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Cabin:wght@400;500;600;700&display=swap');
@keyframes drift { 0% { transform: translate(0,0); } 50% { transform: translate(-2%,3%); } 100% { transform: translate(0,0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulseGlow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes floatCard1 { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-10px) rotate(-1deg); } }
@keyframes floatCard2 { 0%, 100% { transform: translateY(0) rotate(1deg); } 50% { transform: translateY(-12px) rotate(3deg); } }
@keyframes floatCard3 { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-9px) rotate(0deg); } }
@keyframes ringPulse { 0% { transform: scale(0.9); opacity: .9; } 100% { transform: scale(1.9); opacity: 0; } }
@keyframes typeBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes chatIn1 { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes chatIn2 { 0%, 35% { opacity: 0; transform: translateY(8px) scale(.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes badgePop { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
@keyframes gemPop { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
@keyframes marqueeScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes pulseSkeleton { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
}
/* Scrollbar a juego con el resto del diseño (por default el navegador pone
   la barra gris genérica, que desentona con el fondo oscuro) */
* { scrollbar-width: thin; scrollbar-color: #6882AD #433324; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #433324; }
::-webkit-scrollbar-thumb { background: #6882AD; border-radius: 9999px; border: 2px solid #433324; }
::-webkit-scrollbar-thumb:hover { background: #A9C0E6; }
`;

// Tipos de cambio aproximados, solo para calcular un precio de referencia (no es una tasa en tiempo real)
export const USD_TO_MXN = 18.5;
export const EUR_TO_MXN = 20;

// Paleta "cozy" (ver SUSCRIPCIONES.md, rediseño de agosto 2026): crema/café/
// tan cálidos en vez del navy/azul tecnológico de antes, con la misma
// pareja de azules de la hoja de marca (#2A4C91/#6882AD) como acento -- el
// resto del código sigue leyendo COLORS.azul/azulClaro/etc. igual que
// siempre, así que cambiar estos valores base ya recolorea toda la app sin
// tocar cada uno de esos usos.
export const COLORS = {
  bg: "#2E2216", surface: "#433324", surface2: "#4F3D2A",
  azul: "#1F3A6E", azulClaro: "#6882AD", azulMedio: "#2A4C91",
  azulPalido: "#A9C0E6", gold: "#D99A3D", violeta: "#9B6FA3",
  text: "#F1E4D3", muted: "#A0876E",
  // Fijo siempre (no lo toca aplicarTema, ver más abajo): para texto legible
  // sobre botones/insignias con fondo claro o medio (azulPalido, azulClaro,
  // gold) sin importar el modo. Antes esos botones usaban COLORS.bg como
  // "el color oscuro de siempre" -- funcionaba de casualidad en modo noche
  // (donde bg sí es oscuro) pero en modo día bg es claro, así que el texto
  // se volvía casi invisible sobre esos mismos botones.
  textoOscuro: "#2C2116",
  fondoProfundo: "#201709",
};

// ---- TCG (juego de cartas): Pokémon fue el primero en tener catálogo
// visual real (imagen, set, precio de referencia); Magic es el segundo
// piloto (vía Scryfall). Yu-Gi-Oh, Lorcana y One Piece ya se pueden
// publicar (texto libre, sin catálogo todavía) hasta que se conecte su
// propia fuente de datos, mismo patrón que Magic.
//
// Los 8 de abajo (Cardfight Vanguard en adelante) se agregaron directo
// con catálogo real vía apitcg.com (ver TCG_SLUG_APITCG en
// lib/pokemonApi.js y sección 138 de SUSCRIPCIONES.md) -- a diferencia
// de los 5 originales, no tienen ninguna fuente propia aparte (Scryfall,
// YGOPRODeck, etc.), así que apitcg.com es su único catálogo, sin
// respaldo si llegara a fallar. Producto sellado usa el mismo apitcg.com
// para los 13 TCG (SelladoPickerVisual, ver sección 139+ de
// SUSCRIPCIONES.md) -- TCGplayerPicker/TCGCSV queda como respaldo manual
// si apitcg.com no trae aún un producto en particular.
export const TCG_OPCIONES = [
  { key: "pokemon", label: "Pokémon" },
  { key: "yugioh", label: "Yu-Gi-Oh!" },
  { key: "lorcana", label: "Lorcana" },
  { key: "magic", label: "Magic" },
  { key: "onepiece", label: "One Piece" },
  { key: "vanguard", label: "Cardfight Vanguard" },
  { key: "digimon", label: "Digimon" },
  { key: "dbfusionworld", label: "Dragon Ball Super Fusion World" },
  { key: "dbmasters", label: "Dragon Ball Super Masters" },
  { key: "fleshblood", label: "Flesh and Blood" },
  { key: "gundam", label: "Gundam" },
  { key: "hololive", label: "hololive" },
  { key: "riftbound", label: "Riftbound" },
];
export const TCG_LABEL = Object.fromEntries(TCG_OPCIONES.map((o) => [o.key, o.label]));
// TCG con buscador de texto libre (una sola caja, contra todo el catálogo):
// Pokémon (pokemontcg.io), Magic (Scryfall), Yu-Gi-Oh (YGOPRODeck) y Lorcana
// (lorcana-api.com) tienen además su propia fuente aparte de apitcg.com; los
// 9 restantes (incluido One Piece) dependen solo de apitcg.com -- One Piece
// ya tenía apitcg.com como fuente en TCG_SLUG_APITCG desde antes, solo le
// faltaba entrar aquí para usar el buscador visual (CardPicker) en vez del
// TCGplayerPicker de texto que usaba por descuido.
export const TCG_CON_CATALOGO = [
  "pokemon", "magic", "yugioh", "lorcana", "onepiece",
  "vanguard", "digimon", "dbfusionworld", "dbmasters", "fleshblood", "gundam", "hololive", "riftbound",
];

// ---- Idioma de la carta: obligatorio al publicar, para que el comprador
// sepa en qué idioma está la carta sin tener que preguntar ----
export const IDIOMA_OPCIONES = [
  { key: "EN", label: "Inglés" },
  { key: "ES", label: "Español" },
  { key: "JP", label: "Japonés" },
];
export const IDIOMA_LABEL = { EN: "Inglés", ES: "Español", JP: "Japonés" };

// ---- Zona: los 32 estados de México, en vez de texto libre -- así "cdmx"
// y "Ciudad de México" no son zonas distintas para el buscador/filtro, y
// tiendas + publicaciones usan siempre el mismo catálogo. Antes era una
// lista de los 51 municipios de Nuevo León (la app empezó enfocada solo en
// Monterrey/NL) -- al expandir a todo México se subió un nivel, a estado
// en vez de municipio: un catálogo completo de los ~2,469 municipios del
// país no se puede verificar contra una fuente en vivo desde este entorno,
// y el riesgo de un municipio mal escrito o mal asignado a esa escala es
// real -- los 32 estados son información mucho más estable y verificable.
// La ubicación más fina (calle, colonia) sigue viviendo en el campo de
// dirección de cada tienda, que ya es texto libre.
export const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua",
  "Ciudad de México", "Coahuila", "Colima", "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
  "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro",
  "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala",
  "Veracruz", "Yucatán", "Zacatecas",
];

// ---- Estado (condición) de la carta: obligatorio al publicar una carta suelta,
// para que el comprador sepa el desgaste real antes de contactar al vendedor ----
export const CONDICION_OPCIONES = [
  { key: "GM", label: "Gem Mint", desc: "Carta súper perfecta, sin ningún detalle -- del sobre directo a la mica" },
  { key: "NM", label: "Near Mint", desc: "Carta sin detalles a simple vista, de sobre a mica" },
  { key: "LP", label: "Lightly Played", desc: "Carta con detalles muy leves: un rayón chico o las esquinas apenas tocadas" },
  { key: "MP", label: "Moderately Played", desc: "Carta con detalles que ya se notan: rayones, esquinas gastadas o un doblez leve" },
  { key: "HP", label: "Heavily Played", desc: "Carta con detalles fuertes: doblez marcado, esquinas muy gastadas o manchas, pero completa" },
  { key: "DMG", label: "Damaged", desc: "Carta dañada de verdad: rota, con hoyos, manchada fuerte o le falta un pedazo" },
];
export const CONDICION_LABEL = Object.fromEntries(CONDICION_OPCIONES.map((o) => [o.key, o.label]));
export const CONDICION_DESC = Object.fromEntries(CONDICION_OPCIONES.map((o) => [o.key, o.desc]));
// Para normalizar texto libre (importador masivo, CSV) a un código válido; si no reconoce nada, usa NM por defecto.
export function normalizarCondicion(texto) {
  const t = String(texto || "").trim().toUpperCase();
  if (!t) return "NM";
  const directo = CONDICION_OPCIONES.find((o) => o.key === t);
  if (directo) return directo.key;
  const porNombre = CONDICION_OPCIONES.find((o) => o.label.toUpperCase() === t);
  if (porNombre) return porNombre.key;
  if (/GEM ?MINT|^GM$/.test(t)) return "GM";
  if (/DAMAGED|DMG|DAÑAD/.test(t)) return "DMG";
  if (/HEAVILY|^HP$/.test(t)) return "HP";
  if (/MODERATELY|^MP$/.test(t)) return "MP";
  if (/LIGHTLY|^LP$/.test(t)) return "LP";
  if (/NEAR ?MINT|^NM$/.test(t)) return "NM";
  return "NM";
}

// ---- Gradeo de la carta: opcional al publicar. Si el vendedor marca que la
// carta está gradeada, elige la empresa que la gradeó y su calificación ----
export const GRADEADORAS_OPCIONES = [
  { key: "PSA", label: "PSA" },
  { key: "CGC", label: "CGC" },
  { key: "BGS", label: "BGS" },
  { key: "TAG", label: "TAG" },
  { key: "VALUE_UP", label: "Value UP" },
  { key: "OTRO", label: "Otro" },
];
export const GRADEADORAS_LABEL = Object.fromEntries(GRADEADORAS_OPCIONES.map((o) => [o.key, o.label]));

// Calificación 1 a 10 para cualquier empresa...
const CALIFICACIONES_NORMALES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
// ...excepto BGS, que en el 10 se divide en tres niveles distintos.
const CALIFICACIONES_BGS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10 Gem Mint", "10 Pristine", "10 Black Label"];
export function calificacionesDeEmpresa(empresa) {
  return empresa === "BGS" ? CALIFICACIONES_BGS : CALIFICACIONES_NORMALES;
}

// Texto corto para mostrar en publicaciones (ej. "PSA 9", "BGS 10 Black Label", "GradeCo (otro) 8").
export function textoGradeo({ grado_empresa, grado_empresa_otro, grado_calificacion }) {
  if (!grado_empresa || !grado_calificacion) return null;
  const empresa = grado_empresa === "OTRO" ? (grado_empresa_otro || "Otro") : GRADEADORAS_LABEL[grado_empresa] || grado_empresa;
  return `${empresa} ${grado_calificacion}`;
}

export const STORE_COLORS = [COLORS.azul, COLORS.azulClaro, COLORS.azulMedio, COLORS.azulPalido];
export const colorFor = (i) => STORE_COLORS[i % STORE_COLORS.length];
// De los tonos de la paleta, azul y azulMedio son oscuros: sobre ellos el texto debe ir blanco, no negro.
export const textoSobre = (fondo) => (fondo === COLORS.azul || fondo === COLORS.azulMedio ? COLORS.text : COLORS.bg);

// ---- Rangos / planes de suscripción ----
export const PLAN_ORDER = ["pokeball", "superball", "ultraball", "masterball", "enteball"];

export const PLAN_INFO = {
  pokeball: {
    nombre: "Cuarzo", emoji: "⚪", precio: 0, precioAnual: 0, color: COLORS.muted,
    resumen: "Básico y gratis",
    beneficios: ["Publica hasta 20 cartas/productos activos", "Aparece en búsquedas y en el directorio", "Modo día/noche"],
    limiteCartas: 20, verificado: false, redesExtra: false, wishlistPremium: false, wishlistCompartible: false, coleccionPersonal: false, importadorMasivo: false, soloTienda: false, carpetas: false, ubicacion: false, mazoBuilder: false, competitivo: false, subastas: false, sorteos: false, modoEvento: false,
  },
  superball: {
    nombre: "Zafiro", emoji: "🔵", precio: 49, precioAnual: 499, color: COLORS.azulClaro,
    resumen: "Insignia verificado + redes directas",
    beneficios: [
      "Publica hasta 50 cartas/productos activos", "Insignia de perfil verificado", "Enlace directo a Instagram (Google Maps si eres tienda, WhatsApp y Facebook si eres cuenta individual)",
      "Personaliza tu perfil público: biografía, color de acento y el orden de tus secciones",
      "Filtra tiendas por zona y encuentra la más cercana con tu ubicación",
      "Competitivo: importa mazos reales de torneos de Pokémon TCG (vía Limitless TCG), marca qué cartas ya tienes y encuentra quién vende las que faltan",
      "Wishlist compartible: arma tu lista de cartas deseadas en una carpeta visual, comparte el link o descarga una imagen para mandarla directo",
    ],
    // coleccionPersonal y subastas se subieron de aquí (ver Amatista/Diamante
    // más abajo) -- Zafiro se queda con lo esencial para vender/verse
    // confiable, sin apilar de entrada las funciones más vistosas.
    limiteCartas: 50, verificado: true, redesExtra: true, wishlistPremium: false, wishlistCompartible: true, coleccionPersonal: false, importadorMasivo: false, soloTienda: false, carpetas: false, ubicacion: true, mazoBuilder: false, competitivo: true, subastas: false, sorteos: false, modoEvento: false,
  },
  ultraball: {
    nombre: "Amatista", emoji: "🟣", precio: 89, precioAnual: 899, color: COLORS.violeta,
    resumen: "Todo Zafiro + Alertas de precio con push",
    beneficios: [
      "Todo lo de Zafiro", "Publicaciones ilimitadas", "Alertas de precio con notificación push", "Organiza subastas de tus cartas/productos", "Carpetas: sube fotos de tu álbum y detecta las cartas automáticamente",
      "Cambia los colores de la página según tipos de Pokémon (agua, fuego, psíquico, etc.)",
      "Deck Builder visual: arma varios mazos con selector de cartas, cantidad, nombre y etiquetas",
      "Catálogo de sets: marca qué cartas ya tienes y sigue tu progreso por set (Master Sets)",
      "1 Boost gratis cada mes (destaca una publicación 3 días)",
    ],
    // coleccionPersonal y modoEvento se subieron a Diamante (ver más abajo) --
    // eran las dos funciones más grandes que hacían que Diamante se sintiera
    // vacío comparado con Amatista.
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, wishlistCompartible: true, coleccionPersonal: false, importadorMasivo: false, soloTienda: false, carpetas: true, ubicacion: true, mazoBuilder: true, competitivo: true, boostsGratisMes: 1, subastas: true, sorteos: false, modoEvento: false,
  },
  masterball: {
    nombre: "Diamante", emoji: "🟡", precio: 149, precioAnual: 1499, color: COLORS.azulPalido,
    resumen: "Todo Amatista + Colección/Portafolio y Modo Evento",
    beneficios: [
      "Todo lo de Amatista",
      "Colección/Portafolio: lleva el control de las cartas que ya tienes con cantidad y valor de referencia, e intercambia cartas registrando ambos lados",
      "Modo Evento: lleva el control de tus ventas, costos y gastos en vivo cuando vendes en un evento presencial, con reporte en PDF al final",
      "Decoración holográfica adicional en tu perfil", "Emblema con la fecha desde la que eres Diamante",
      "2 Boosts gratis cada mes", "Si eres tienda: panel de Mis Estadísticas (ventas, contactos y seguidores, con gráfica de crecimiento)",
    ],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, wishlistCompartible: true, coleccionPersonal: true, importadorMasivo: false, soloTienda: false, carpetas: true, diamante: true, ubicacion: true, mazoBuilder: true, competitivo: true, boostsGratisMes: 2, subastas: true, sorteos: false, modoEvento: true,
  },
  enteball: {
    nombre: "Aurora", emoji: "🔴", precio: 349, precioAnual: 2999, color: COLORS.gold,
    resumen: "Exclusivo tiendas: todo + importador masivo",
    beneficios: [
      "Todo lo de Diamante", "Importador masivo de inventario (texto, Excel, o directo desde tu tienda Shopify)", "Solo disponible para cuentas de tienda",
      "3 Boosts gratis cada mes", "Aparece en el carrusel de tiendas destacadas del Mercado",
      "Organiza sorteos con premio para tus clientes",
    ],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, wishlistCompartible: true, coleccionPersonal: true, importadorMasivo: true, soloTienda: true, carpetas: true, holo: true, ubicacion: true, mazoBuilder: true, competitivo: true, diamante: true, boostsGratisMes: 3, subastas: true, sorteos: true, modoEvento: true,
  },
};

export const planDe = (perfil) => {
  if (!perfil) return PLAN_INFO.pokeball;
  // Si venció la suscripción, tratamos al perfil como Cuarzo hasta que pague de nuevo.
  if (perfil.plan_vence && new Date(perfil.plan_vence) < new Date()) return PLAN_INFO.pokeball;
  return PLAN_INFO[perfil.plan] || PLAN_INFO.pokeball;
};
export const limiteAlcanzado = (perfil, total) => total >= planDe(perfil).limiteCartas;

// ---- Boost: destacar una publicación por unos días ----
export const BOOST_PRECIOS = { 3: 15, 7: 29 };
export const estaDestacado = (item) => !!(item?.destacado_hasta && new Date(item.destacado_hasta) > new Date());
export const esCartaFavorita = (nombre, favoritos) => {
  if (!nombre || !favoritos?.length) return false;
  const texto = nombre.toLowerCase();
  return favoritos.some((f) => f && texto.includes(f.toLowerCase()));
};
export const conBoostPrimero = (lista) => {
  const destacados = lista.filter(estaDestacado);
  const resto = lista.filter((x) => !estaDestacado(x));
  return [...destacados, ...resto];
};

// La miniatura pública siempre es la foto oficial (catálogo), nunca la foto
// real que subió el vendedor -- salvo accesorios, que no tienen contraparte
// en ningún catálogo y por eso su única "foto oficial" es la real de frente.
export const miniaturaListing = (item) =>
  item?.tipo === "accesorio" ? (item.foto_real_url || item.imagen_url) : (item.imagen_url || item.foto_real_url);

// Pasa una URL de imagen por nuestro proxy (api/tcgcsv.js, fuente=imgproxy)
// pidiéndola ya redimensionada/comprimida a webp -- las tarjetas de las
// grillas de Mercado/tienda solo la muestran del tamaño de una miniatura,
// pero sin esto se bajaba el archivo original completo (a veces cientos de
// KB) por cada una. Solo envuelve https:// -- los `data:`/blob: locales
// (previews antes de subir una foto) se quedan tal cual.
export const miniaturaUrl = (url, ancho = 320) =>
  url && url.startsWith("https://") ? `/api/tcgcsv?fuente=imgproxy&url=${encodeURIComponent(url)}&w=${ancho}` : url;

// ---- Apariencia: modo día/noche (Zafiro+) y temas por tipo de Pokémon (Amatista+) ----
//
// COLORS es un objeto compartido: en vez de hacer que cada uno de los ~700 usos
// existentes lea el color desde un contexto de React, aplicarTema() MUTA las
// propiedades de este mismo objeto (y el array STORE_COLORS). Como todos los
// componentes leen `COLORS.xxx` directo en cada render (no lo guardan en estado),
// con forzar un remount del árbol (ver `temaVersion` en el componente raíz) el
// cambio se refleja en todos lados sin tocar ningún componente existente.
//
// El modo controla fondo/texto; el tipo controla solo la familia "azul" (el
// acento principal de botones/bordes). gold y violeta se quedan fijos siempre,
// porque ya tienen un significado propio (Aurora y Amatista, respectivamente).

// Bases deliberadamente neutras (sin tinte azul propio): así, cuando aplicarTema()
// mezcla el color del tipo de Pokémon encima, el tinte resultante se ve limpio y
// fiel al tipo elegido, en vez de mezclarse con un azul de fondo que ya traía el modo.
// fondoProfundo: el tono al que se degrada el fondo animado (BackgroundField)
// en su punto más profundo -- antes era un oscuro fijo en todos los modos,
// lo que hacía que el fondo animado se viera negro incluso en modo día.
export const MODOS_COLOR = {
  noche: { bg: "#2E2216", surface: "#433324", surface2: "#4F3D2A", text: "#F1E4D3", muted: "#A0876E", fondoProfundo: "#201709" },
  dia: { bg: "#E0CEBA", surface: "#F6EEE1", surface2: "#E9DCC9", text: "#433324", muted: "#8A7568", fondoProfundo: "#D3BFA0" },
};

export const TIPOS_POKEMON_INFO = {
  default: { nombre: "Predeterminado", emoji: "⚡" },
  normal: { nombre: "Normal", emoji: "⭐" },
  fuego: { nombre: "Fuego", emoji: "🔥" },
  agua: { nombre: "Agua", emoji: "💧" },
  planta: { nombre: "Planta", emoji: "🌿" },
  electrico: { nombre: "Eléctrico", emoji: "⚡" },
  hielo: { nombre: "Hielo", emoji: "❄️" },
  lucha: { nombre: "Lucha", emoji: "🥊" },
  veneno: { nombre: "Veneno", emoji: "☠️" },
  tierra: { nombre: "Tierra", emoji: "🏜️" },
  volador: { nombre: "Volador", emoji: "🕊️" },
  psiquico: { nombre: "Psíquico", emoji: "🔮" },
  bicho: { nombre: "Bicho", emoji: "🐛" },
  roca: { nombre: "Roca", emoji: "🪨" },
  fantasma: { nombre: "Fantasma", emoji: "👻" },
  dragon: { nombre: "Dragón", emoji: "🐉" },
  siniestro: { nombre: "Siniestro", emoji: "🌑" },
  acero: { nombre: "Acero", emoji: "⚙️" },
  hada: { nombre: "Hada", emoji: "✨" },
};

export const TIPOS_POKEMON_COLOR = {
  default: { azul: "#1F3A6E", azulClaro: "#6882AD", azulMedio: "#2A4C91", azulPalido: "#A9C0E6" },
  normal: { azul: "#6B6153", azulClaro: "#A79C87", azulMedio: "#8A7F6B", azulPalido: "#C9BFA9" },
  fuego: { azul: "#7A2000", azulClaro: "#FF7A3C", azulMedio: "#C1440E", azulPalido: "#FFB07A" },
  agua: { azul: "#08376B", azulClaro: "#4FA8D1", azulMedio: "#1470A8", azulPalido: "#8FD3EF" },
  planta: { azul: "#0E4429", azulClaro: "#4CAF6D", azulMedio: "#1E7A45", azulPalido: "#9BE3B4" },
  electrico: { azul: "#7A6A00", azulClaro: "#F5D742", azulMedio: "#C7A600", azulPalido: "#FCEB8C" },
  hielo: { azul: "#0B5B66", azulClaro: "#7FE0EC", azulMedio: "#1590A1", azulPalido: "#C6F5FA" },
  lucha: { azul: "#5C1A1A", azulClaro: "#C1544B", azulMedio: "#8B2E28", azulPalido: "#E2948D" },
  veneno: { azul: "#4A1466", azulClaro: "#A855C9", azulMedio: "#7229A0", azulPalido: "#D9A9EC" },
  tierra: { azul: "#5C4420", azulClaro: "#C9A15C", azulMedio: "#8C6B2E", azulPalido: "#E6CE9C" },
  volador: { azul: "#2E3F70", azulClaro: "#9AA9E0", azulMedio: "#4C60A3", azulPalido: "#C9D3F5" },
  psiquico: { azul: "#7A1054", azulClaro: "#F06BB0", azulMedio: "#B02A82", azulPalido: "#F9B3D9" },
  bicho: { azul: "#4E5C0E", azulClaro: "#AACB3E", azulMedio: "#7C921E", azulPalido: "#D6E896" },
  roca: { azul: "#544A2E", azulClaro: "#B9A876", azulMedio: "#877349", azulPalido: "#E0D3AC" },
  fantasma: { azul: "#2E1A4A", azulClaro: "#7C5FA8", azulMedio: "#4C3373", azulPalido: "#B8A3D9" },
  dragon: { azul: "#1E1A6E", azulClaro: "#6C63C4", azulMedio: "#38309E", azulPalido: "#ABA4E8" },
  siniestro: { azul: "#1C1C24", azulClaro: "#6B5B7A", azulMedio: "#33333E", azulPalido: "#8A8A9E" },
  acero: { azul: "#3A4652", azulClaro: "#9FB2C2", azulMedio: "#5E7284", azulPalido: "#CBDAE3" },
  hada: { azul: "#7A2F52", azulClaro: "#F2A0C4", azulMedio: "#B85686", azulPalido: "#F9CEE1" },
};

export const TEMA_MODO_KEY = "ec_tema_modo";
export const TEMA_TIPO_KEY = "ec_tema_tipo";
// Ícono del botón flotante de notificaciones -- independiente del modo
// día/noche y del tinte por tipo de Pokémon de arriba. "default" = la
// campana genérica (Bell); el resto son emblemas por TCG que el usuario
// elige en Apariencia. La lista de TCG con emblema disponible vive junto
// a los propios íconos en lib/icons.jsx (EmblemaPokemon, EmblemaMagic,
// etc.) para no duplicar el mapeo en dos archivos -- ver
// ICONOS_NOTIFICACION_TCG en App.jsx.
export const TEMA_ICONO_KEY = "ec_tema_icono_notif";

function mezclarHex(hexBase, hexTinte, cantidad) {
  const parse = (hex) => {
    const limpio = hex.replace("#", "");
    const n = parseInt(limpio, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [br, bg, bb] = parse(hexBase);
  const [tr, tg, tb] = parse(hexTinte);
  const mezcla = (a, b) => Math.round(a + (b - a) * cantidad);
  return `#${[mezcla(br, tr), mezcla(bg, tg), mezcla(bb, tb)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function aplicarTema(modo, tipo) {
  const m = MODOS_COLOR[modo] || MODOS_COLOR.noche;
  const t = TIPOS_POKEMON_COLOR[tipo] || TIPOS_POKEMON_COLOR.default;
  const esDia = modo === "dia";
  // No solo cambiamos el acento (botones/bordes) — también teñimos el fondo y las
  // superficies con el color del tipo, para que el cambio se note de verdad y no
  // solo en detalles pequeños de texto.
  //
  // De noche se tiñe hacia el tono OSCURO del tipo (azul/azulMedio): parte de
  // un fondo casi negro, así que agregar un oscuro lo aclara un poco y se
  // nota el tinte. De día pasaría lo contrario: mezclar ese mismo oscuro en
  // un fondo casi blanco lo apaga, y como "surface" recibe más tinte que
  // "bg" (28% vs 22%), de día terminaba MÁS oscuro que el fondo -- las
  // tarjetas se veían más sucias que la página en vez de "flotar" sobre
  // ella. De día se tiñe hacia el tono CLARO del tipo (azulPalido/azulClaro)
  // para que el resultado se quede luminoso y la tarjeta sí se vea más
  // clara que el fondo.
  const tinteSuperficie = esDia ? t.azulPalido : t.azul;
  const tinteProfundo = esDia ? t.azulClaro : t.azulMedio;
  // Estos porcentajes eran más altos (22/28/34%) cuando la base era el navy
  // de antes -- mezclar un tinte de tipo (azul, o cualquiera de los 18
  // colores de Pokémon) contra un navy casi no cambiaba el TONO, solo el
  // valor, así que se notaba poco. Con la base cálida nueva (crema/café),
  // esos mismos porcentajes sí cambian el tono de verdad -- el crema se
  // volvía gris-azulado en vez de quedarse crema. Se bajan para que el
  // tinte siga notándose (sigue siendo el mismo color) sin apagar la
  // calidez de la base.
  Object.assign(COLORS, {
    bg: mezclarHex(m.bg, tinteSuperficie, 0.10),
    surface: mezclarHex(m.surface, tinteSuperficie, 0.13),
    surface2: mezclarHex(m.surface2, tinteProfundo, 0.16),
    text: m.text,
    muted: m.muted,
    fondoProfundo: m.fondoProfundo,
  }, t);
  STORE_COLORS.splice(0, STORE_COLORS.length, COLORS.azul, COLORS.azulClaro, COLORS.azulMedio, COLORS.azulPalido);
}

// "#RRGGBB" -> "rgba(r, g, b, alpha)": para fondos translúcidos (el header
// con blur, el modal de bienvenida) que necesitan seguir el modo actual en
// vez de quedar fijos en un tono oscuro que no cambia de día.
export function conAlpha(hex, alpha) {
  const limpio = hex.replace("#", "");
  const n = parseInt(limpio, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Se aplica una sola vez, al cargar el módulo (antes de que React pinte nada),
// para no mostrar un parpadeo con los colores por defecto y luego cambiar.
if (typeof window !== "undefined") {
  const modoGuardado = localStorage.getItem(TEMA_MODO_KEY);
  const tipoGuardado = localStorage.getItem(TEMA_TIPO_KEY);
  if (modoGuardado || tipoGuardado) aplicarTema(modoGuardado || "noche", tipoGuardado || "default");
}
