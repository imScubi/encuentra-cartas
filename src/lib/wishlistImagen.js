import { COLORS } from "../theme.js";

// Genera una imagen descargable/compartible de una Wishlist (carpeta
// visual de cartas "quiero", ver MiWishlistView/WishlistPublicaView en
// App.jsx) -- pensada para quien prefiere mandar una imagen en vez de un
// link (ej. en un grupo de WhatsApp). Todo con Canvas2D nativo, sin
// agregar ninguna librería nueva (mismo criterio que ya se usó para el QR
// de sorteos: preferir una solución sin dependencia nueva cuando el
// navegador ya trae lo necesario).

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
function cargarImagen(url) {
  return new Promise((resolve, reject) => {
    if (!url) { reject(new Error("sin url")); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("no se pudo cargar"));
    img.src = url;
  });
}

function textoTruncado(ctx, texto, anchoMax) {
  if (ctx.measureText(texto).width <= anchoMax) return texto;
  let recortado = texto;
  while (recortado.length > 1 && ctx.measureText(recortado + "…").width > anchoMax) {
    recortado = recortado.slice(0, -1);
  }
  return recortado + "…";
}

function rectRedondeado(ctx, x, y, w, h, r) {
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

function dibujarPlaceholder(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.surface2;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 42px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎴", x + w / 2, y + h / 2);
}

const ANCHO = 1080;
const COLS = 4;
const GAP = 24;
const CELDA = (ANCHO - GAP * (COLS + 1)) / COLS;
const IMG_ALTO = CELDA * 1.3;
const TEXTO_ALTO = 56;
const CARD_ALTO = IMG_ALTO + TEXTO_ALTO;
const HEADER_ALTO = 190;
const FOOTER_ALTO = 90;

// { perfil: {nombre, avatar_url}, cartas: [{carta, imagen_url, set_nombre}], linkWishlist } -> Promise<Blob>
export async function generarImagenWishlist({ perfil, cartas, linkWishlist }) {
  const filas = Math.max(1, Math.ceil(cartas.length / COLS));
  const alto = HEADER_ALTO + filas * (CARD_ALTO + GAP) + GAP + FOOTER_ALTO;

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");

  // Fondo
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
  ctx.fillText("está buscando estas cartas:", avatarX + avatarSize + 20, avatarY + 68);

  ctx.fillStyle = COLORS.azulPalido;
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Encuentra Cartas", ANCHO - GAP, avatarY + 36);
  ctx.restore?.();

  // ---- Grid de cartas ----
  ctx.textAlign = "center";
  for (let i = 0; i < cartas.length; i++) {
    const fila = Math.floor(i / COLS);
    const col = i % COLS;
    const x = GAP + col * (CELDA + GAP);
    const y = HEADER_ALTO + fila * (CARD_ALTO + GAP);
    const carta = cartas[i];

    rectRedondeado(ctx, x, y, CELDA, IMG_ALTO, 14);
    ctx.save();
    ctx.clip();
    try {
      const img = await cargarImagen(proxyImagenUrl(carta.imagen_url));
      // "contain" dentro de la celda, centrado
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
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText(textoTruncado(ctx, carta.carta || "", CELDA - 12), x + CELDA / 2, y + IMG_ALTO + 26);
    if (carta.set_nombre) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "400 16px system-ui, sans-serif";
      ctx.fillText(textoTruncado(ctx, carta.set_nombre, CELDA - 12), x + CELDA / 2, y + IMG_ALTO + 48);
    }
  }

  // ---- Footer: link ----
  const footerY = alto - FOOTER_ALTO / 2;
  ctx.fillStyle = COLORS.surface2;
  ctx.fillRect(0, alto - FOOTER_ALTO, ANCHO, FOOTER_ALTO);
  ctx.fillStyle = COLORS.azulPalido;
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(linkWishlist || "encuentracartasmx.com", ANCHO / 2, footerY + 8);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
