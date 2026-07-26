// Redimensiona/recomprime una foto antes de subirla. Una foto tomada
// directo con la cámara de un celular pesa varios MB (a veces 10+), y ese
// peso -- sumado a que primero se manda a moderar (ver moderacion.js) y
// luego se sube a Storage -- es lo que hace que en internet lento la subida
// tarde muchísimo o directamente truene con "Failed to fetch". Se reescala
// al lado más largo a 1600px y se recodifica como JPEG calidad 0.82: de
// sobra para que se lea el texto de una carta, pero normalmente baja el
// peso a unos cientos de KB.
export async function comprimirImagen(file, maxLado = 1600, calidad = 0.82) {
  if (!file.type?.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", calidad));
    if (!blob || blob.size >= file.size) return file; // si no ayudó, se queda con el original
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // navegador sin soporte u otro problema: sigue con el original
  }
}
