import { COLORS } from "../theme.js";
import { proxyImagenUrl, cargarImagen, textoTruncado, rectRedondeado, dibujarPlaceholder } from "./imagenCartasCanvas.js";

// Genera una imagen del "Tablón de venta" (ver TablonVentaView en
// App.jsx): un póster con las cartas/producto que alguien eligió de su
// inventario o sus carpetas, mostrando nombre, imagen, precio, idioma y
// estado -- para compartir sin mandar el link. Mismo enfoque que
// wishlistImagen.js (Canvas2D nativo, sin librería nueva), comparte sus
// utilidades de proxy/carga/texto vía imagenCartasCanvas.js.

const ANCHO = 1080;
const COLS = 4;
const GAP = 24;
const CELDA = (ANCHO - GAP * (COLS + 1)) / COLS;
const IMG_ALTO = CELDA * 1.15;
// 3 líneas de texto por celda (nombre, precio, idioma/estado) en vez de las
// 2 de la Wishlist -- por eso una celda más baja de imagen y más alto de texto.
const TEXTO_ALTO = 78;
const CARD_ALTO = IMG_ALTO + TEXTO_ALTO;
const HEADER_ALTO = 190;
const FOOTER_ALTO = 90;

// { perfil: {nombre, avatar_url}, items: [{nombre, imagen_url, precio, idioma, condicion}], link } -> Promise<Blob>
export async function generarImagenTablonVenta({ perfil, items, link }) {
  const filas = Math.max(1, Math.ceil(items.length / COLS));
  const alto = HEADER_ALTO + filas * (CARD_ALTO + GAP) + GAP + FOOTER_ALTO;

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, ANCHO, alto);

  // ---- Header: avatar + nombre ----
  const avatarSize = 84;
  const avatarX = GAP;
  const avatarY = 40;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = COLORS.surface2;
  ctx.fill();
  ctx.clip();
  try {
    const avatarImg = await cargarImagen(proxyImagenUrl(perfil.avatar_url));
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  } catch { /* se queda el círculo de fondo, sin foto */ }
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText(textoTruncado(ctx, perfil.nombre || "Alguien", ANCHO - avatarSize - GAP * 3), avatarX + avatarSize + 20, avatarY + 36);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 22px system-ui, sans-serif";
  ctx.fillText("tiene esto en venta:", avatarX + avatarSize + 20, avatarY + 68);

  ctx.fillStyle = COLORS.azulPalido;
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Encuentra Cartas", ANCHO - GAP, avatarY + 36);

  // ---- Grid de productos ----
  ctx.textAlign = "center";
  for (let i = 0; i < items.length; i++) {
    const fila = Math.floor(i / COLS);
    const col = i % COLS;
    const x = GAP + col * (CELDA + GAP);
    const y = HEADER_ALTO + fila * (CARD_ALTO + GAP);
    const item = items[i];

    rectRedondeado(ctx, x, y, CELDA, IMG_ALTO, 14);
    ctx.save();
    ctx.clip();
    try {
      const img = await cargarImagen(proxyImagenUrl(item.imagen_url));
      const escala = Math.min(CELDA / img.width, IMG_ALTO / img.height);
      const w = img.width * escala;
      const h = img.height * escala;
      ctx.fillStyle = COLORS.surface2;
      ctx.fillRect(x, y, CELDA, IMG_ALTO);
      ctx.drawImage(img, x + (CELDA - w) / 2, y + (IMG_ALTO - h) / 2, w, h);
    } catch {
      dibujarPlaceholder(ctx, x, y, CELDA, IMG_ALTO);
    }
    ctx.restore();

    ctx.fillStyle = COLORS.text;
    ctx.font = "600 19px system-ui, sans-serif";
    ctx.fillText(textoTruncado(ctx, item.nombre || "", CELDA - 12), x + CELDA / 2, y + IMG_ALTO + 24);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText(item.precio != null ? `$${Number(item.precio).toLocaleString("es-MX")}` : "Consultar", x + CELDA / 2, y + IMG_ALTO + 50);

    const detalle = [item.idioma, item.condicion].filter(Boolean).join(" · ");
    if (detalle) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "400 15px system-ui, sans-serif";
      ctx.fillText(textoTruncado(ctx, detalle, CELDA - 12), x + CELDA / 2, y + IMG_ALTO + 70);
    }
  }

  // ---- Footer: link ----
  const footerY = alto - FOOTER_ALTO / 2;
  ctx.fillStyle = COLORS.surface2;
  ctx.fillRect(0, alto - FOOTER_ALTO, ANCHO, FOOTER_ALTO);
  ctx.fillStyle = COLORS.azulPalido;
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(link || "encuentracartasmx.com", ANCHO / 2, footerY + 8);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
