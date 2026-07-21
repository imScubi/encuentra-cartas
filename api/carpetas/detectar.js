// Recibe la foto de una página de un álbum/carpeta ya subida a Storage,
// y usa la IA con visión de Google (Gemini, capa gratuita) para
// identificar cada carta visible. Requiere: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (gratis en aistudio.google.com/apikey).
import { GoogleGenerativeAI } from "@google/generative-ai";

const PLANES_CON_CARPETAS = ["superball", "ultraball", "masterball", "enteball"];
const MODELO_GEMINI = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { perfilId, imagenUrl } = req.body || {};
  if (!perfilId || !imagenUrl) {
    return res.status(400).json({ error: "Falta perfilId o imagenUrl" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
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

    const genAI = new GoogleGenerativeAI(geminiKey);
    const modelo = genAI.getGenerativeModel({ model: MODELO_GEMINI });

    const prompt =
      "Esta es una foto de una página de un álbum/carpeta de cartas coleccionables (Pokémon u otro TCG). " +
      "Identifica cada carta individual que veas. Para cada una da: el nombre exacto de la carta tal como " +
      "aparece impreso, el nombre del set si lo puedes leer, y el número de carta/set si es legible (ej. '054/198' o 'GG56'). " +
      "Si no puedes leer o identificar una carta con confianza razonable, no la inventes: pon \"nombre\": null en esa posición. " +
      "Responde ÚNICAMENTE con un JSON array (sin texto antes ni después, sin markdown), con este formato exacto: " +
      '[{"nombre": "...", "set": "...", "numero": "..."}, ...]';

    const resultado = await modelo.generateContent([
      { inlineData: { data: base64, mimeType } },
      prompt,
    ]);

    const texto = resultado.response.text() || "[]";
    const inicio = texto.indexOf("[");
    const fin = texto.lastIndexOf("]");
    const json = inicio >= 0 && fin >= inicio ? texto.slice(inicio, fin + 1) : "[]";
    let detectadas = [];
    try {
      detectadas = JSON.parse(json);
    } catch {
      detectadas = [];
    }
    detectadas = (Array.isArray(detectadas) ? detectadas : []).filter((c) => c?.nombre);

    res.status(200).json({ cartas: detectadas });
  } catch (e) {
    console.error("Error detectando cartas:", e);
    res.status(500).json({ error: e.message || "No se pudo procesar la foto." });
  }
}
