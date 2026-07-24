// Moderación de fotos reales antes de subirlas: le pide a la IA con visión
// (Gemini, vía api/carpetas/detectar.js con modo:"moderar" -- ver el
// comentario en ese archivo sobre por qué comparte función serverless) que
// revise si la foto tiene contenido inapropiado o de plano no es de un
// producto de TCG, ANTES de subirla a Supabase Storage -- así nada indebido
// llega a guardarse siquiera un momento.
//
// "Fail-open": si algo falla (sin conexión, Gemini caído, llave no
// configurada), se deja pasar la foto en vez de bloquear a quien está
// vendiendo por un problema que no es suyo. Esta moderación es una primera
// barrera automática, no reemplaza el botón "Reportar" ni la revisión de
// Admin -- sigue habiendo forma de bajar algo que se cuele.
function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export async function moderarFotoReal(file) {
  try {
    const imagenBase64 = await archivoABase64(file);
    const res = await fetch("/api/carpetas/detectar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo: "moderar", imagenBase64, mimeType: file.type || "image/jpeg" }),
    });
    if (!res.ok) return { permitida: true };
    const data = await res.json();
    return { permitida: data?.permitida !== false, motivo: data?.motivo || null };
  } catch {
    return { permitida: true };
  }
}
