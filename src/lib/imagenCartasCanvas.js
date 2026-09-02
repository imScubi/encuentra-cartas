import { COLORS } from "../theme.js";

// Utilidades de Canvas2D compartidas por los generadores de imagen de
// cartas (Wishlist en wishlistImagen.js, Tablón de venta en
// tablonVentaImagen.js) -- separadas aquí para no duplicar la misma
// lógica de proxy/carga/texto en los dos archivos.

// Todas las imágenes remotas (avatar + arte de cada carta) pasan por
// nuestro propio proxy same-origin (api/tcgcsv.js, fuente=imgproxy) --
// dibujar una imagen cross-origin sin headers CORS permisivos "mancha" el
// canvas y bloquea canvas.toBlob(). Las cartas vienen de +6 CDNs de
// terceros que no controlamos, así que la única forma confiable es
// servirlas desde nuestro propio origen primero.
export function proxyImagenUrl(url) {
  if (!url) return null;
  return `/api/tcgcsv?fuente=imgproxy&url=${encodeURIComponent(url)}`;
}

// Carga una imagen y resuelve el elemento <img> ya listo para dibujar --
// nunca rechaza con una excepción no atrapada: quien llama decide qué
// hacer si no cargó (dibujar un placeholder en vez de tronar toda la
// generación por una sola carta con imagen rota).
export function cargarImagen(url) {
  return new Promise((resolve, reject) => {
    if (!url) { reject(new Error("sin url")); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("no se pudo cargar"));
    img.src = url;
  });
}

export function textoTruncado(ctx, texto, anchoMax) {
  if (ctx.measureText(texto).width <= anchoMax) return texto;
  let recortado = texto;
  while (recortado.length > 1 && ctx.measureText(recortado + "…").width > anchoMax) {
    recortado = recortado.slice(0, -1);
  }
  return recortado + "…";
}

export function rectRedondeado(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    // Respaldo manual para navegadores viejos sin CanvasRenderingContext2D.roundRect
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

export function dibujarPlaceholder(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.surface2;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 42px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎴", x + w / 2, y + h / 2);
}
