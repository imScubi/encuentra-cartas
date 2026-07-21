export const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
@keyframes drift { 0% { transform: translate(0,0); } 50% { transform: translate(-2%,3%); } 100% { transform: translate(0,0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulseGlow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
`;

// Tipos de cambio aproximados, solo para calcular un precio de referencia (no es una tasa en tiempo real)
export const USD_TO_MXN = 18.5;
export const EUR_TO_MXN = 20;

export const COLORS = {
  bg: "#050810", surface: "#0A1330", surface2: "#101A36",
  azul: "#0B2A66", azulClaro: "#4F7FD1", azulMedio: "#1B4A9E",
  azulPalido: "#9EC0EE", gold: "#FFD34D", violeta: "#8B5CF6",
  text: "#F4F6FB", muted: "#8291B5",
};

export const STORE_COLORS = [COLORS.azul, COLORS.azulClaro, COLORS.azulMedio, COLORS.azulPalido];
export const colorFor = (i) => STORE_COLORS[i % STORE_COLORS.length];
// De los tonos de la paleta, azul y azulMedio son oscuros: sobre ellos el texto debe ir blanco, no negro.
export const textoSobre = (fondo) => (fondo === COLORS.azul || fondo === COLORS.azulMedio ? COLORS.text : COLORS.bg);

// ---- Rangos / planes de suscripción ----
export const PLAN_ORDER = ["pokeball", "superball", "ultraball", "masterball", "enteball"];

export const PLAN_INFO = {
  pokeball: {
    nombre: "Cuarzo", emoji: "⚪", precio: 0, color: COLORS.muted,
    resumen: "Básico y gratis",
    beneficios: ["Publica hasta 20 cartas/productos activos", "Aparece en búsquedas y en el directorio"],
    limiteCartas: 20, verificado: false, redesExtra: false, wishlistPremium: false, importadorMasivo: false, soloTienda: false, carpetas: false,
  },
  superball: {
    nombre: "Zafiro", emoji: "🔵", precio: 49, color: COLORS.azulClaro,
    resumen: "Insignia verificado + redes directas",
    beneficios: ["Todo lo de Cuarzo", "Insignia de perfil verificado", "Enlace directo a Instagram (Google Maps si eres tienda, WhatsApp y Facebook si eres cuenta individual)"],
    limiteCartas: 20, verificado: true, redesExtra: true, wishlistPremium: false, importadorMasivo: false, soloTienda: false, carpetas: false,
  },
  ultraball: {
    nombre: "Amatista", emoji: "🟣", precio: 89, color: COLORS.violeta,
    resumen: "Todo Zafiro + Wishlist Premium",
    beneficios: ["Todo lo de Zafiro", "Alertas de precio con notificación push", "Carpetas: sube fotos de tu álbum y detecta las cartas automáticamente"],
    limiteCartas: 20, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: false, soloTienda: false, carpetas: true,
  },
  masterball: {
    nombre: "Diamante", emoji: "🟡", precio: 149, color: COLORS.azulPalido,
    resumen: "Todos los beneficios, inventario ilimitado",
    beneficios: ["Todo lo de Amatista", "Publicaciones ilimitadas (una por una)", "Decoración holográfica adicional en tu perfil", "Emblema con la fecha desde la que eres Diamante"],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: false, soloTienda: false, carpetas: true, diamante: true,
  },
  enteball: {
    nombre: "Aurora", emoji: "🔴", precio: 349, color: COLORS.gold,
    resumen: "Exclusivo tiendas: todo + importador masivo",
    beneficios: ["Todo lo de Diamante", "Importador masivo de inventario (texto o Excel)", "Solo disponible para cuentas de tienda"],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: true, soloTienda: true, carpetas: true, holo: true,
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
