// ---- App nativa (Capacitor, Google Play) vs. la web normal ----
// Vive en su propio archivo (sin depender de supabase.js/errorReporting.jsx)
// para que cualquier módulo lo pueda importar sin arriesgar una importación
// circular -- errorReporting.jsx también lo necesita, y supabase.js ya
// importa de errorReporting.jsx.
import { Capacitor } from "@capacitor/core";

export const esNativo = () => Capacitor.isNativePlatform();

// Las rutas /api/... son relativas a "el origen desde el que se sirvió la
// página" -- en la web eso es siempre encuentracartasmx.com, así que una
// ruta relativa funciona sola. Pero dentro de la app nativa de Android
// (Capacitor) los archivos se sirven empaquetados desde un origen local
// falso (https://localhost), NO desde el dominio real -- ahí una ruta
// relativa a /api/... nunca llega a ningún lado (no existe ningún servidor
// en ese "localhost"), así que cualquier fetch a un endpoint de Vercel
// (imágenes, moderación de fotos, catálogo, pagos, etc.) fallaba en
// silencio. Bug real encontrado en la primera prueba de la app -- ver
// sección 171 de SUSCRIPCIONES.md.
export const apiUrl = (path) => `${esNativo() ? "https://encuentracartasmx.com" : ""}${path}`;
