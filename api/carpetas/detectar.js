// Recibe la foto de una página de un álbum/carpeta ya subida a Storage,
// y usa la IA con visión de Google (Gemini, capa gratuita) para
// identificar cada carta visible. Requiere: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY (gratis en aistudio.google.com/apikey).
//
// Llama directo a la API REST de Gemini (sin el SDK) y le pregunta a
// Google qué modelos están disponibles en vez de fijar un nombre — así
// no se rompe cuando Google retira o renombra un modelo.
const PLANES_CON_CARPETAS = ["superball", "ultraball", "masterball", "enteball"];

async function elegirModeloGemini(apiKey, preferido) {
  const candidatos = [];
  if (preferido) candidatos.push(preferido);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const flash = (data.models || [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /flash/i.test(m.name) && !/tts|embedding/i.test(m.name))
        .map((m) => m.name.replace(/^models\//, ""));
      // Prefiere el más nuevo (mayor número de versión en el nombre, ej. 2.5 > 2.0 > 1.5).
      flash.sort((a, b) => {
        const na = parseFloat((a.match(/[\d.]+/) || ["0"])[0]);
        const nb = parseFloat((b.match(/[\d.]+/) || ["0"])[0]);
        return nb - na;
      });
      candidatos.push(...flash);
    }
  } catch {
    // si falla la lista, seguimos con los candidatos fijos de abajo
  }
  candidatos.push("gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash");
  return [...new Set(candidatos)];
}

async function llamarGemini(apiKey, modelo, base64, mimeType, prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Gemini respondió con error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
}

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

    const prompt =
      "Esta es una foto de una página de un álbum/carpeta de cartas coleccionables (Pokémon u otro TCG). " +
      "Identifica cada carta individual que veas. Para cada una da: el nombre exacto de la carta tal como " +
      "aparece impreso, el nombre del set si lo puedes leer, y el número de carta/set si es legible (ej. '054/198' o 'GG56'). " +
      "Si no puedes leer o identificar una carta con confianza razonable, no la inventes: pon \"nombre\": null en esa posición. " +
      "Responde ÚNICAMENTE con un JSON array (sin texto antes ni después, sin markdown), con este formato exacto: " +
      '[{"nombre": "...", "set": "...", "numero": "..."}, ...]';

    const candidatos = await elegirModeloGemini(geminiKey, process.env.GEMINI_MODEL);
    let texto = null;
    let ultimoError = null;
    for (const modelo of candidatos) {
      try {
        texto = await llamarGemini(geminiKey, modelo, base64, mimeType, prompt);
        break;
      } catch (e) {
        ultimoError = e;
        if (e.status !== 404) break; // si no es "modelo no encontrado", no tiene caso probar otro
      }
    }
    if (texto === null) throw ultimoError || new Error("No se pudo contactar a Gemini.");

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
