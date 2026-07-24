// Helpers compartidos para llamar a Gemini (Google, capa gratuita) con
// visión de imagen. Se usan desde más de un endpoint (detección de cartas
// en Carpetas, moderación de fotos) -- viven en lib/ (no cuentan para el
// límite de 12 funciones serverless del plan Hobby de Vercel, a diferencia
// de un archivo nuevo en api/).
export async function elegirModeloGemini(apiKey, preferido) {
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

export async function llamarGemini(apiKey, modelo, base64, mimeType, prompt) {
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

// Llama a Gemini probando cada modelo candidato hasta que uno funcione
// (mismo patrón de reintento que ya usaba api/carpetas/detectar.js).
export async function llamarGeminiConReintento(apiKey, base64, mimeType, prompt, modeloPreferido) {
  const candidatos = await elegirModeloGemini(apiKey, modeloPreferido);
  let ultimoError = null;
  for (const modelo of candidatos) {
    try {
      return await llamarGemini(apiKey, modelo, base64, mimeType, prompt);
    } catch (e) {
      ultimoError = e;
      if (e.status !== 404) break; // si no es "modelo no encontrado", no tiene caso probar otro
    }
  }
  throw ultimoError || new Error("No se pudo contactar a Gemini.");
}
