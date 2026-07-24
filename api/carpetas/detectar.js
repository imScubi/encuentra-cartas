// Recibe la foto de una página de un álbum/carpeta ya subida a Storage,
// y usa la IA con visión de Google (Gemini, capa gratuita) para
// identificar cada carta visible. Requiere: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (gratis en aistudio.google.com/apikey).
//
// Llama directo a la API REST de Gemini (sin el SDK) y le pregunta a
// Google qué modelos están disponibles en vez de fijar un nombre — así
// no se rompe cuando Google retira o renombra un modelo.
//
// Este mismo archivo también atiende `modo: "moderar"` (moderación de
// fotos reales que sube cualquier vendedor antes de publicar) -- no es
// "detectar cartas de carpetas" en sentido estricto, pero el plan Hobby de
// Vercel limita a 12 funciones serverless y este archivo ya trae toda la
// lógica de llamar a Gemini con visión, así que se comparte en vez de
// sumar un archivo nuevo en api/ (ver sección 74 de SUSCRIPCIONES.md).
import { llamarGeminiConReintento } from "../../lib/gemini.js";

const PLANES_CON_CARPETAS = ["ultraball", "masterball", "enteball"];

// Nombres de sets que solo existen en Pokémon TCG Pocket (el juego para
// celular) — ninguno de estos es un set real del TCG físico, así que si
// la IA devuelve uno de estos, es una carta de Pocket mal etiquetada (o
// una confusión) y hay que descartarla sin importar qué diga "juego".
const SETS_SOLO_POCKET = [
  "genetic apex", "mythical island", "space-time smackdown", "triumphant light",
  "shining revelry", "celestial guardians", "extradimensional crisis",
  "eevee grove", "wisdom of sea and sky", "promo-a",
];

function esDePocket(carta) {
  const texto = `${carta.set || ""} ${carta.nombre || ""}`.toLowerCase();
  if (/pocket/.test(texto)) return true;
  return SETS_SOLO_POCKET.some((set) => texto.includes(set));
}

// Moderación de una foto real antes de publicarla (ver moderarFotoReal en
// lib/moderacion.js, del lado del cliente): rechaza contenido sexual/
// gráfico explícito o fotos que claramente no son de una carta/producto de
// TCG. "Fail-open" a propósito -- si Gemini falla o no hay llave
// configurada, se deja pasar la foto en vez de bloquear a un vendedor por
// un problema ajeno a él (ver sección 74 de SUSCRIPCIONES.md).
async function moderarImagen(req, res, geminiKey) {
  const { imagenBase64, mimeType } = req.body || {};
  if (!imagenBase64) return res.status(400).json({ error: "Falta imagenBase64" });
  if (!geminiKey) return res.status(200).json({ permitida: true });

  const prompt =
    "Eres el filtro de moderación de contenido de un marketplace de cartas coleccionables (TCG: Pokémon, Yu-Gi-Oh, " +
    "Magic, Lorcana, One Piece) y sus accesorios/producto sellado. Te voy a mostrar una foto que alguien subió como " +
    "la foto REAL de un producto que quiere vender (una carta suelta -- de frente o de atrás--, una caja o producto " +
    "sellado, o un accesorio como playmat/funda/deckbox). " +
    "Responde ÚNICAMENTE con un JSON (sin texto antes ni después, sin markdown) con este formato exacto: " +
    '{"permitida": true|false, "motivo": "..."}' +
    "\n\nMarca \"permitida\": false SOLO si la imagen claramente: " +
    "1) Contiene desnudos, contenido sexual explícito o insinuación sexual. " +
    "2) Contiene violencia gráfica, gore, o contenido perturbador/ilegal. " +
    "3) No tiene absolutamente nada que ver con cartas coleccionables/TCG o sus accesorios (ej. una selfie de una " +
    "persona, comida, un auto, una pantalla en blanco, un meme, una foto random sin ninguna carta ni producto). " +
    "Una foto borrosa, mal iluminada o de mala calidad de una carta SIGUE siendo \"permitida\" -- el criterio es el " +
    "TEMA de la foto, no qué tan bien tomada está. Si tienes duda razonable de que sí podría ser una carta/producto " +
    "de TCG legítimo, marca \"permitida\": true. Cuando \"permitida\" sea false, \"motivo\" debe ser una frase corta " +
    "en español explicándole a quien subió la foto por qué se rechazó (ej. \"La foto no muestra ninguna carta ni " +
    "producto de TCG\" o \"La foto contiene contenido inapropiado\").";

  try {
    const texto = await llamarGeminiConReintento(geminiKey, imagenBase64, mimeType || "image/jpeg", prompt, process.env.GEMINI_MODEL);
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    const json = inicio >= 0 && fin >= inicio ? texto.slice(inicio, fin + 1) : "{}";
    let veredicto = {};
    try { veredicto = JSON.parse(json); } catch { veredicto = {}; }
    const permitida = veredicto.permitida !== false;
    res.status(200).json({ permitida, motivo: permitida ? null : (veredicto.motivo || "Esta foto no se puede usar.") });
  } catch (e) {
    console.error("Error moderando imagen:", e);
    res.status(200).json({ permitida: true });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const geminiKey = process.env.GEMINI_API_KEY;

  if (req.body?.modo === "moderar") {
    return moderarImagen(req, res, geminiKey);
  }

  const { perfilId, imagenUrl } = req.body || {};
  if (!perfilId || !imagenUrl) {
    return res.status(400).json({ error: "Falta perfilId o imagenUrl" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel." });
  }

  try {
    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=plan,plan_vence&id=eq.${perfilId}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const perfiles = await perfilRes.json();
    const perfil = perfiles?.[0];
    const planVencido = perfil?.plan_vence && new Date(perfil.plan_vence) < new Date();
    if (!perfil || planVencido || !PLANES_CON_CARPETAS.includes(perfil.plan)) {
      return res.status(403).json({ error: "Esta función requiere plan Super Ball o superior." });
    }

    const imgRes = await fetch(imagenUrl);
    if (!imgRes.ok) return res.status(400).json({ error: "No se pudo leer la imagen de la foto." });
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const base64 = buffer.toString("base64");

    const prompt =
      "Esta foto es de un álbum/carpeta de coleccionista y contiene una o varias cartas FÍSICAS DE PAPEL/CARTÓN " +
      "reales del Pokémon Trading Card Game (puede ser una página completa con varias cartas en fundas, o una sola " +
      "carta fotografiada de cerca). Como son cartas físicas, es IMPOSIBLE que alguna sea de 'Pokémon TCG Pocket' — " +
      "ese es un videojuego para celular sin ninguna carta física impresa, así que nunca existe una tarjeta de " +
      "Pocket dentro de un álbum real. Si el nombre de un set que ibas a poner coincide con uno de estos (todos son " +
      "exclusivos del videojuego Pocket y NUNCA existen en papel): Genetic Apex, Mythical Island, Space-Time " +
      "Smackdown, Triumphant Light, Shining Revelry, Celestial Guardians, Extradimensional Crisis, Eevee Grove, " +
      "Wisdom of Sea and Sky — entonces te equivocaste de set: vuelve a mirar la carta y da el nombre del set " +
      "físico real al que pertenece, basándote en el símbolo de set impreso (por ejemplo, un set real de Scarlet & " +
      "Violet, Sword & Shield, Sun & Moon, XY, Crown Zenith, etc.). Si de verdad no puedes determinar el set físico " +
      "real, deja el campo \"set\" vacío en vez de inventar uno de Pocket o adivinar uno parecido. " +
      "\n\n" +
      "Para cada carta que identifiques, mira con mucho cuidado el texto impreso — no adivines por parecido — y da: " +
      "el nombre exacto de la carta tal como aparece impreso (incluyendo sufijos como 'ex', 'V', 'VMAX', 'GX' si los " +
      "tiene), el nombre del set físico si lo puedes leer con el símbolo de set, el número de carta/set exactamente " +
      "como aparece impreso incluyendo el total (ej. '054/198' o 'GG56/GG70'), y tu propio nivel de confianza en esa " +
      "lectura (\"alta\" si leíste el nombre y número con nitidez, \"media\" si tuviste que inferir parte por brillo/" +
      "ángulo/borrosidad, \"baja\" si es una suposición poco segura). " +
      "Si dos cartas se parecen (mismo Pokémon en distintas variantes/artes) y no puedes distinguir cuál es por el " +
      "número de carta impreso, dilo con confianza \"baja\" en vez de adivinar cuál. " +
      "Si no puedes leer o identificar una carta en lo absoluto, no la inventes: pon \"nombre\": null en esa posición. " +
      "Responde ÚNICAMENTE con un JSON array (sin texto antes ni después, sin markdown), con este formato exacto: " +
      '[{"nombre": "...", "set": "...", "numero": "...", "confianza": "alta|media|baja"}, ...]';

    const texto = await llamarGeminiConReintento(geminiKey, base64, mimeType, prompt, process.env.GEMINI_MODEL);

    const inicio = texto.indexOf("[");
    const fin = texto.lastIndexOf("]");
    const json = inicio >= 0 && fin >= inicio ? texto.slice(inicio, fin + 1) : "[]";
    let detectadas = [];
    try {
      detectadas = JSON.parse(json);
    } catch {
      detectadas = [];
    }
    detectadas = (Array.isArray(detectadas) ? detectadas : []).filter((c) => c?.nombre && !esDePocket(c));

    res.status(200).json({ cartas: detectadas });
  } catch (e) {
    console.error("Error detectando cartas:", e);
    res.status(500).json({ error: e.message || "No se pudo procesar la foto." });
  }
}
