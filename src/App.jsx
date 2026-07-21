import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, MapPin, Phone, Store, Sparkles, Package, ChevronLeft,
  User, Megaphone, Newspaper, ShoppingBag, X, Loader2, AlertCircle,
  MessageCircle, Send, ExternalLink, Shield, Receipt, Menu, Bell, HelpCircle, Calendar,
} from "lucide-react";

// ---- Conexión a Supabase (usa la anon key, es segura para el navegador) ----
const SUPABASE_URL = "https://nulypgaaekexlbxbxdwq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bHlwZ2FhZWtleGxieGJ4ZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk3OTcsImV4cCI6MjA5OTk3NTc5N30.9qxfcmUx5k1br1CH3DIFI2EplFJWYeRyg6HFeZNN7og";

// El token de sesión de Supabase expira solo (~1 hora). Si una consulta falla
// por eso, la renovamos con el refresh_token y reintentamos una sola vez.
// onSesionRefrescada lo registra la app principal para enterarse del cambio
// (y así no perder la renovación en el siguiente render).
let onSesionRefrescada = null;
let refrescandoPromesa = null;

function pareceSesionExpirada(status, data) {
  return status === 401 || /jwt expired|invalid jwt/i.test(JSON.stringify(data || {}));
}

async function refrescarSesion(session) {
  if (!session?.refresh_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  if (!refrescandoPromesa) {
    refrescandoPromesa = fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.msg || "Tu sesión expiró. Vuelve a iniciar sesión.");
        const nueva = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user || session.user };
        localStorage.setItem("ec_session", JSON.stringify(nueva));
        onSesionRefrescada?.(nueva);
        return nueva;
      })
      .finally(() => { refrescandoPromesa = null; });
  }
  return refrescandoPromesa;
}

// ---- Captura de errores: avisa al admin sin que nadie tenga que reportarlo a mano ----
let uidActual = null; // lo actualiza EncuentraCartas cuando hay sesión, para poder incluirlo en el reporte

function reportarError(mensaje, stack) {
  if (!mensaje) return;
  try {
    fetch("/api/errores/reportar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: String(mensaje).slice(0, 500), stack, url: window.location.href, perfilId: uidActual }),
    }).catch(() => {});
  } catch {}
}

if (typeof window !== "undefined" && !window.__ecErroresListo) {
  window.__ecErroresListo = true;
  window.addEventListener("error", (e) => reportarError(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => reportarError(e.reason?.message || String(e.reason), e.reason?.stack));
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    reportarError(error.message, `${error.stack || ""}\n${info?.componentStack || ""}`);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="text-center max-w-sm">
            <p className="text-lg font-semibold mb-2">Algo salió mal</p>
            <p style={{ color: "#7A8BA8" }} className="text-sm mb-4">Ya avisamos al equipo. Intenta recargar la página.</p>
            <button onClick={() => window.location.reload()} style={{ background: "#9EC0EE", color: "#000" }} className="rounded-lg px-4 py-2 text-sm font-semibold">
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

async function sb(path, session) {
  const pedir = (s) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}` },
    });

  let res = await pedir(session);
  if (!res.ok && session) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await pedir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    throw new Error(`Error consultando la base de datos (${res.status}) en ${path}: ${data?.message || data?.hint || JSON.stringify(data) || "sin detalle"}`);
  }
  return res.json();
}

async function sbWrite(method, path, body, session) {
  const pedir = (s) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });

  let res = await pedir(session);
  let data = await res.clone().json().catch(() => null);
  if (!res.ok && session && pareceSesionExpirada(res.status, data)) {
    const nueva = await refrescarSesion(session);
    res = await pedir(nueva);
    data = await res.json().catch(() => null);
  }
  if (!res.ok) throw new Error(data?.message || `Error guardando (${res.status})`);
  return data;
}

async function authSignUp(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "No se pudo crear la cuenta");
  return data; // incluye access_token si la confirmación por correo está desactivada
}

async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "Correo o contraseña incorrectos");
  return data;
}

// ---- Foto de perfil: Pokémon (PokeAPI, pública) o foto propia (Supabase Storage) ----
const POKEMON_MAX_ID = 1025;
const pokemonSpriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const randomPokemonAvatar = () => pokemonSpriteUrl(1 + Math.floor(Math.random() * POKEMON_MAX_ID));

let _pokemonListCache = null;
async function obtenerListaPokemon() {
  if (_pokemonListCache) return _pokemonListCache;
  const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000");
  const data = await res.json();
  _pokemonListCache = (data.results || [])
    .map((p) => {
      const match = p.url.match(/\/pokemon\/(\d+)\/?$/);
      return match ? { name: p.name, id: Number(match[1]) } : null;
    })
    .filter(Boolean);
  return _pokemonListCache;
}

async function subirAvatar(file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/avatar.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s.access_token}`,
        "Content-Type": file.type || "image/jpeg",
        "x-upsert": "true",
      },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo subir la foto");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
}

async function subirImagenAnuncio(file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/${Date.now()}.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/anuncios/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo subir la imagen");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/anuncios/${path}`;
}

async function subirImagenABucket(bucket, file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/${Date.now()}.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo subir la imagen");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function subirImagenCarta(file, session) {
  return subirImagenABucket("cartas", file, session);
}

// Extrae el número exacto y el nombre del set desde un texto tipo
// "Crown Zenith GG56/GG70" (formato que usa set_nombre en la app).
function parseNumeroYSet(setNombre) {
  if (!setNombre) return { set: null, numero: null };
  const limpio = setNombre.trim();
  const conSet = limpio.match(/^(.+?)\s+([A-Za-z]*\d+[A-Za-z]*)(?:\/[A-Za-z0-9]*)?$/);
  if (conSet) return { set: conSet[1].trim(), numero: conSet[2] };
  const soloNumero = limpio.match(/^([A-Za-z]*\d+[A-Za-z]*)(?:\/[A-Za-z0-9]*)?$/);
  if (soloNumero) return { set: null, numero: soloNumero[1] };
  return { set: limpio, numero: null };
}

// Respaldo cuando TCGdex no tiene la imagen (pasa seguido con arte especial / secretas).
// pokemontcg.io tiene mejor cobertura de esas variantes. Exige nombre + número
// exactos (y set si lo tenemos) para no traer la imagen de una versión distinta
// de la misma carta — si no hay coincidencia exacta, no arriesga y devuelve null.
async function buscarImagenRespaldo(nombre, numero, setNombre) {
  if (!nombre || !numero) return null;
  try {
    const buscar = async (conSet) => {
      let query = `name:"${nombre}" number:"${numero}"`;
      if (conSet && setNombre) query += ` set.name:"${setNombre}"`;
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=20`);
      if (!res.ok) return [];
      const data = await res.json();
      return data?.data || [];
    };

    let cartas = await buscar(true);
    if (!cartas.length) cartas = await buscar(false);
    if (!cartas.length) return null;

    const exacta = cartas.find((c) => String(c.number).toLowerCase() === String(numero).toLowerCase());
    if (!exacta) return null;
    return exacta.images?.large || exacta.images?.small || null;
  } catch {
    return null;
  }
}

// Busca una carta por nombre (y opcionalmente número) en TCGdex, con el
// mismo respaldo de imagen que usa CardPicker. Se usa para prellenar las
// cartas que la IA detectó en una foto de carpeta.
async function buscarCartaTCGdex(nombre, numeroHint) {
  if (!nombre) return null;
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(nombre)}&pagination:itemsPerPage=10`);
    const lista = await res.json();
    if (!Array.isArray(lista) || !lista.length) return null;
    // El número puede venir como "054/198" (con el total) — solo la primera parte
    // es el localId real de TCGdex, si comparamos el texto completo nunca coincide.
    const numeroLimpio = numeroHint ? String(numeroHint).split("/")[0].trim() : null;
    const candidato = (numeroLimpio && lista.find((c) => c.localId === numeroLimpio)) || lista[0];
    const detalleRes = await fetch(`https://api.tcgdex.net/v2/en/cards/${candidato.id}`);
    const full = await detalleRes.json();
    const total = full.set?.cardCount?.official || full.set?.cardCount?.total || "";
    let imagen = full.image ? `${full.image}/high.webp` : "";
    if (!imagen) imagen = (await buscarImagenRespaldo(full.name, full.localId, full.set?.name)) || "";
    return {
      name: full.name,
      set_nombre: `${full.set?.name || ""} ${full.localId}${total ? "/" + total : ""}`,
      card_api_id: full.id,
      imagen_url: imagen,
    };
  } catch {
    return null;
  }
}

function AvatarImg({ url, size = 36 }) {
  const [error, setError] = useState(false);
  return (
    <img
      src={!error && url ? url : "/branding/logo-icon.png"}
      onError={() => setError(true)}
      alt=""
      style={{
        width: size, height: size, borderRadius: "9999px", objectFit: "cover",
        border: `1px solid ${COLORS.azulMedio}`, flexShrink: 0, background: COLORS.surface2,
      }}
    />
  );
}

function PokemonPicker({ onSelect }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && todos.length === 0) {
      setLoading(true);
      obtenerListaPokemon().then(setTodos).finally(() => setLoading(false));
    }
  }, [open]);

  const resultados =
    q.trim().length >= 2 ? todos.filter((p) => p.name.includes(q.trim().toLowerCase())).slice(0, 20) : [];

  return (
    <div className="relative">
      <input
        placeholder="Busca tu Pokémon favorito (ej. Pikachu)"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={inputStyle}
        className="rounded-lg px-2 py-2 text-sm w-full"
      />
      {open && q.trim().length >= 2 && (
        <div
          style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66` }}
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg shadow-xl grid grid-cols-4 gap-2 p-2"
        >
          {loading && <p style={{ color: COLORS.muted }} className="text-xs col-span-4 p-2">Cargando lista de Pokémon...</p>}
          {!loading && resultados.length === 0 && (
            <p style={{ color: COLORS.muted }} className="text-xs col-span-4 p-2">Escribe al menos 2 letras.</p>
          )}
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onSelect(pokemonSpriteUrl(p.id), p.name); setQ(""); setOpen(false); }}
              className="flex flex-col items-center gap-1 p-1 rounded hover:brightness-125"
            >
              <img src={pokemonSpriteUrl(p.id)} alt={p.name} style={{ width: 48, height: 48, objectFit: "contain" }} loading="lazy" />
              <span style={{ color: COLORS.text }} className="text-xs capitalize truncate w-full text-center">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PokemonFavSprite({ name, size = 40 }) {
  const [id, setId] = useState(null);
  useEffect(() => {
    let activo = true;
    obtenerListaPokemon().then((lista) => {
      const p = lista.find((x) => x.name === String(name).toLowerCase());
      if (activo) setId(p?.id || null);
    });
    return () => { activo = false; };
  }, [name]);
  if (!id) return <div style={{ width: size, height: size, background: COLORS.surface2 }} className="rounded-full" />;
  return <img src={pokemonSpriteUrl(id)} alt={name} style={{ width: size, height: size, objectFit: "contain" }} loading="lazy" />;
}

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
@keyframes drift { 0% { transform: translate(0,0); } 50% { transform: translate(-2%,3%); } 100% { transform: translate(0,0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulseGlow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
`;

// Tipos de cambio aproximados, solo para calcular un precio de referencia (no es una tasa en tiempo real)
const USD_TO_MXN = 18.5;
const EUR_TO_MXN = 20;

const COLORS = {
  bg: "#050810", surface: "#0A1330", surface2: "#101A36",
  azul: "#0B2A66", azulClaro: "#4F7FD1", azulMedio: "#1B4A9E",
  azulPalido: "#9EC0EE", gold: "#FFD34D", violeta: "#8B5CF6",
  text: "#F4F6FB", muted: "#8291B5",
};

const STORE_COLORS = [COLORS.azul, COLORS.azulClaro, COLORS.azulMedio, COLORS.azulPalido];
const colorFor = (i) => STORE_COLORS[i % STORE_COLORS.length];
// De los tonos de la paleta, azul y azulMedio son oscuros: sobre ellos el texto debe ir blanco, no negro.
const textoSobre = (fondo) => (fondo === COLORS.azul || fondo === COLORS.azulMedio ? COLORS.text : COLORS.bg);

// ---- Llave pública VAPID para notificaciones push (la privada vive solo en el servidor) ----
const VAPID_PUBLIC_KEY = "BLPUA-CAQihRVApIBjAaOg6Sb83z1j2uLTL-irKRiZ0JW6XlpJ2u9S4pFCqbC15VBOsL4MmlCHUe-_LsychJOs0";

// ---- Rangos / planes de suscripción ----
const PLAN_ORDER = ["pokeball", "superball", "ultraball", "masterball", "enteball"];

const PLAN_INFO = {
  pokeball: {
    nombre: "Cuarzo", emoji: "⚪", precio: 0, color: COLORS.muted,
    resumen: "Básico y gratis",
    beneficios: ["Publica hasta 20 cartas/productos activos", "Aparece en búsquedas y en el directorio"],
    limiteCartas: 20, verificado: false, redesExtra: false, wishlistPremium: false, importadorMasivo: false, soloTienda: false, carpetas: false,
  },
  superball: {
    nombre: "Zafiro", emoji: "🔵", precio: 49, color: COLORS.azulClaro,
    resumen: "Insignia verificado + redes directas",
    beneficios: ["Todo lo de Cuarzo", "Insignia de perfil verificado", "Enlace directo a Instagram (Google Maps si eres tienda, WhatsApp y Facebook si eres cuenta individual)"],
    limiteCartas: 20, verificado: true, redesExtra: true, wishlistPremium: false, importadorMasivo: false, soloTienda: false, carpetas: false,
  },
  ultraball: {
    nombre: "Amatista", emoji: "🟣", precio: 89, color: COLORS.violeta,
    resumen: "Todo Zafiro + Wishlist Premium",
    beneficios: ["Todo lo de Zafiro", "Alertas de precio con notificación push", "Carpetas: sube fotos de tu álbum y detecta las cartas automáticamente"],
    limiteCartas: 20, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: false, soloTienda: false, carpetas: true,
  },
  masterball: {
    nombre: "Diamante", emoji: "🟡", precio: 149, color: COLORS.azulPalido,
    resumen: "Todos los beneficios, inventario ilimitado",
    beneficios: ["Todo lo de Amatista", "Publicaciones ilimitadas (una por una)", "Decoración holográfica adicional en tu perfil", "Emblema con la fecha desde la que eres Diamante"],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: false, soloTienda: false, carpetas: true, diamante: true,
  },
  enteball: {
    nombre: "Aurora", emoji: "🔴", precio: 349, color: COLORS.gold,
    resumen: "Exclusivo tiendas: todo + importador masivo",
    beneficios: ["Todo lo de Diamante", "Importador masivo de inventario (texto o Excel)", "Solo disponible para cuentas de tienda"],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: true, soloTienda: true, carpetas: true, holo: true,
  },
};

const planDe = (perfil) => {
  if (!perfil) return PLAN_INFO.pokeball;
  // Si venció la suscripción, tratamos al perfil como Cuarzo hasta que pague de nuevo.
  if (perfil.plan_vence && new Date(perfil.plan_vence) < new Date()) return PLAN_INFO.pokeball;
  return PLAN_INFO[perfil.plan] || PLAN_INFO.pokeball;
};
const limiteAlcanzado = (perfil, total) => total >= planDe(perfil).limiteCartas;

// ---- Boost: destacar una publicación por unos días ----
const BOOST_PRECIOS = { 3: 15, 7: 29 };
const estaDestacado = (item) => !!(item?.destacado_hasta && new Date(item.destacado_hasta) > new Date());
const esCartaFavorita = (nombre, favoritos) => {
  if (!nombre || !favoritos?.length) return false;
  const texto = nombre.toLowerCase();
  return favoritos.some((f) => f && texto.includes(f.toLowerCase()));
};
const conBoostPrimero = (lista) => {
  const destacados = lista.filter(estaDestacado);
  const resto = lista.filter((x) => !estaDestacado(x));
  return [...destacados, ...resto];
};

function BoostBadge({ item }) {
  if (!estaDestacado(item)) return null;
  return (
    <span
      title={`Destacado hasta ${new Date(item.destacado_hasta).toLocaleDateString("es-MX")}`}
      style={{ border: `1px solid ${COLORS.azulPalido}`, color: COLORS.azulPalido, boxShadow: `0 0 8px ${COLORS.azulPalido}66` }}
      className="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap px-2 py-0.5 text-xs"
    >
      🚀 Destacado
    </span>
  );
}

function BoostButton({ session, tabla, item, onBoosted }) {
  const [abierto, setAbierto] = useState(false);
  const [pagando, setPagando] = useState(null);
  const [error, setError] = useState(null);

  if (estaDestacado(item)) {
    return (
      <p style={{ color: COLORS.azulPalido }} className="text-xs">
        🚀 Destacado hasta {new Date(item.destacado_hasta).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
      </p>
    );
  }

  const destacar = async (dias) => {
    setPagando(dias); setError(null);
    try {
      const res = await fetch("/api/mercadopago/crear-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: session.user.id, tabla, listingId: item.id, dias, email: session.user.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar el pago");
      window.location.href = data.init_point;
    } catch (e) {
      setError(e.message);
      setPagando(null);
    }
  };

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azulPalido}55` }} className="text-xs px-2 py-1 rounded-lg whitespace-nowrap">
        🚀 Destacar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {error && <span style={{ color: COLORS.azulPalido }} className="text-xs">{error}</span>}
      <button onClick={() => destacar(3)} disabled={pagando !== null} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="text-xs px-2 py-1 rounded-lg whitespace-nowrap">
        {pagando === 3 ? "..." : `3 días · $${BOOST_PRECIOS[3]}`}
      </button>
      <button onClick={() => destacar(7)} disabled={pagando !== null} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="text-xs px-2 py-1 rounded-lg whitespace-nowrap">
        {pagando === 7 ? "..." : `7 días · $${BOOST_PRECIOS[7]}`}
      </button>
      <button onClick={() => setAbierto(false)} style={{ color: COLORS.muted }} className="text-xs px-1">✕</button>
    </div>
  );
}

function RankIcon({ plan, emoji, size = 16 }) {
  const [iconError, setIconError] = useState(false);
  if (iconError) return <>{emoji}</>;
  return (
    <img
      src={`/branding/rango-${plan}.png`}
      alt=""
      onError={() => setIconError(true)}
      style={{ width: size, height: size, display: "inline-block", objectFit: "contain" }}
    />
  );
}

function PlanBadge({ perfil, size = "sm" }) {
  const info = planDe(perfil);
  if (info === PLAN_INFO.pokeball) return null;
  const iconPx = size === "lg" ? 18 : 14;
  const holoStyle = info.holo
    ? {
        color: COLORS.bg,
        border: "none",
        background: "linear-gradient(90deg,#FF9FE0,#9EC0EE,#FFD34D,#8B5CF6)",
        backgroundSize: "300% 100%",
        animation: "shimmer 3s linear infinite",
        boxShadow: `0 0 14px ${COLORS.gold}80`,
      }
    : { border: `1px solid ${info.color}`, color: info.color, boxShadow: `0 0 8px ${info.color}66` };
  return (
    <span
      title={info.nombre}
      style={holoStyle}
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}
    >
      <RankIcon plan={perfil.plan} emoji={info.emoji} size={iconPx} /> {info.nombre}
    </span>
  );
}

function VerificadoBadge({ perfil }) {
  if (!planDe(perfil).verificado) return null;
  return (
    <span
      title="Tienda verificada"
      style={{ border: `1px solid ${COLORS.azulClaro}`, color: COLORS.azulClaro, boxShadow: `0 0 8px ${COLORS.azulClaro}66` }}
      className="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap px-2 py-0.5 text-xs"
    >
      ✓ Verificado
    </span>
  );
}

// ---- Decoración exclusiva de Diamante: anillo holográfico giratorio detrás del avatar ----
function HoloAvatar({ perfil, children, ringSize }) {
  const esDiamante = planDe(perfil) === PLAN_INFO.masterball;
  if (!esDiamante) return children;
  return (
    <div
      style={{
        padding: 3, borderRadius: "9999px", flexShrink: 0,
        background: `conic-gradient(from 0deg, ${COLORS.azulPalido}, ${COLORS.violeta}, ${COLORS.azulClaro}, ${COLORS.gold}, ${COLORS.azulPalido})`,
        animation: "spin 5s linear infinite",
        width: ringSize, height: ringSize,
      }}
    >
      <div style={{ background: COLORS.surface, borderRadius: "9999px", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

// ---- Emblema "Diamante desde <fecha>" ----
function DiamanteEmblema({ perfil }) {
  if (planDe(perfil) !== PLAN_INFO.masterball || !perfil?.diamante_desde) return null;
  const fecha = new Date(perfil.diamante_desde).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return (
    <div
      style={{ background: `${COLORS.azulPalido}14`, border: `1px solid ${COLORS.azulPalido}55`, color: COLORS.azulPalido }}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap"
    >
      💎 Diamante desde {fecha}
    </div>
  );
}

// ---- Notificaciones push (Wishlist Premium) ----
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function activarPush(session) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Tu navegador no soporta notificaciones push.");
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("No diste permiso para recibir notificaciones.");

  await navigator.serviceWorker.register("/sw.js");
  // Espera a que el Service Worker quede realmente ACTIVO antes de suscribir
  // (justo después de registrar por primera vez, puede seguir "installing").
  const registro = await navigator.serviceWorker.ready;
  const sub = await registro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  const json = sub.toJSON();
  try {
    await sbWrite("POST", "push_subscriptions", {
      perfil_id: session.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, session);
  } catch (e) {
    // Ya estaba suscrito con este mismo endpoint (navegador/dispositivo): no es un error real.
    if (!/duplicate key|already exists/i.test(e.message || "")) throw e;
  }
}

function Badge({ children, color }) {
  return (
    <span style={{ border: `1px solid ${color}`, color, boxShadow: `0 0 8px ${color}66` }}
      className="px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap">
      {children}
    </span>
  );
}

function PrecioConOferta({ precio, precioAntes, size = "lg" }) {
  const enOferta = precioAntes && Number(precioAntes) > Number(precio);
  const pct = enOferta ? Math.round((1 - Number(precio) / Number(precioAntes)) * 100) : 0;
  const claseTamano = size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-base";
  return (
    <div>
      {enOferta && (
        <div className="flex items-center gap-2 mb-0.5">
          <span style={{ background: "#C24444", color: "#fff" }} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">-{pct}% Descuento</span>
          <span style={{ color: COLORS.muted, textDecoration: "line-through" }} className="text-xs">${Number(precioAntes).toLocaleString("es-MX")}</span>
        </div>
      )}
      <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className={`${claseTamano} font-bold`}>
        ${Number(precio).toLocaleString("es-MX")}
      </p>
    </div>
  );
}

function Loading({ label }) {
  return (
    <div style={{ color: COLORS.muted }} className="flex items-center justify-center gap-2 py-16 text-sm">
      <Loader2 size={18} className="animate-spin" /> {label}
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div style={{ color: COLORS.text, border: `1px solid ${COLORS.azulPalido}88`, background: `${COLORS.azul}22` }}
      className="rounded-lg p-4 flex items-center gap-2 text-sm">
      <AlertCircle size={18} color={COLORS.azulPalido} /> {message}
    </div>
  );
}

function AccountModal({ onClose, onAuthed }) {
  const [mode, setMode] = useState("choose"); // choose | signupForm | login
  const [accountType, setAccountType] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [facebook, setFacebook] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null); // vista previa (blob local o URL de Pokémon)
  const [avatarPokemonUrl, setAvatarPokemonUrl] = useState(null);
  const [mostrarPokemonPicker, setMostrarPokemonPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPokemonUrl(null);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const elegirPokemon = (url) => {
    setAvatarPokemonUrl(url);
    setAvatarFile(null);
    setAvatarPreview(url);
    setMostrarPokemonPicker(false);
  };

  const handleSignUp = async () => {
    setLoading(true); setError(null); setInfo(null);
    try {
      const avatarUrlPokemonFinal = avatarFile ? null : avatarPokemonUrl || randomPokemonAvatar();
      const auth = await authSignUp(email, password, {
        tipo: accountType, nombre, whatsapp: whatsapp || null, facebook: facebook || null,
        avatar_url: avatarUrlPokemonFinal,
      });
      if (!auth.access_token) {
        setInfo("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
        setLoading(false);
        return;
      }
      const session = { access_token: auth.access_token, refresh_token: auth.refresh_token, user: auth.user };
      const avatarUrl = avatarFile ? await subirAvatar(avatarFile, session) : avatarUrlPokemonFinal;
      await sbWrite("POST", "perfiles", {
        id: auth.user.id, tipo: accountType, nombre, email: auth.user.email,
        whatsapp: whatsapp || null, facebook: facebook || null, avatar_url: avatarUrl,
      }, session);
      localStorage.setItem("ec_session", JSON.stringify(session));
      onAuthed(session, { esNuevo: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true); setError(null);
    try {
      const auth = await authSignIn(email, password);
      const session = { access_token: auth.access_token, refresh_token: auth.refresh_token, user: auth.user };
      localStorage.setItem("ec_session", JSON.stringify(session));
      onAuthed(session);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulMedio}66`, boxShadow: `0 0 40px ${COLORS.azulMedio}33` }}
        className="w-full max-w-md rounded-2xl p-6 relative">
        <button onClick={onClose} style={{ color: COLORS.muted }} className="absolute top-4 right-4"><X size={20} /></button>

        {mode === "choose" && (
          <>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Mi cuenta</h2>
            <p style={{ color: COLORS.muted }} className="text-sm mb-5">Crea una cuenta o inicia sesión.</p>
            <div className="grid gap-3">
              <button onClick={() => { setAccountType("tienda"); setMode("signupForm"); }}
                style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azul}` }} className="rounded-xl p-4 text-left flex items-center gap-3">
                <Store size={22} color={COLORS.azulPalido} />
                <div><p className="font-semibold">Crear cuenta de tienda</p></div>
              </button>
              <button onClick={() => { setAccountType("individual"); setMode("signupForm"); }}
                style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulClaro}` }} className="rounded-xl p-4 text-left flex items-center gap-3">
                <User size={22} color={COLORS.azulClaro} />
                <div><p className="font-semibold">Crear cuenta individual</p></div>
              </button>
              <button onClick={() => setMode("login")} style={{ color: COLORS.azulPalido }} className="text-sm mt-2">
                Ya tengo cuenta, iniciar sesión
              </button>
            </div>
          </>
        )}

        {mode === "signupForm" && (
          <div className="grid gap-3">
            <Badge color={accountType === "tienda" ? COLORS.azulPalido : COLORS.azulClaro}>
              {accountType === "tienda" ? "Cuenta de tienda" : "Cuenta individual"}
            </Badge>

            <div className="flex items-center gap-3">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" style={{ width: 56, height: 56, borderRadius: "9999px", objectFit: "cover", border: `1px solid ${COLORS.azulMedio}` }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: "9999px", border: `1px dashed ${COLORS.surface2}`, color: COLORS.muted }} className="flex items-center justify-center text-xs text-center">
                  ?
                </div>
              )}
              <div className="grid gap-1">
                <label style={{ color: COLORS.azulClaro, border: `1px solid ${COLORS.azulClaro}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer text-center">
                  Subir foto
                  <input type="file" accept="image/*" onChange={elegirArchivo} className="hidden" />
                </label>
                <button type="button" onClick={() => setMostrarPokemonPicker((v) => !v)} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                  Elegir Pokémon
                </button>
              </div>
            </div>
            {!avatarPreview && (
              <p style={{ color: COLORS.muted }} className="text-xs -mt-2">Si no eliges nada, te asignamos un Pokémon al azar de foto.</p>
            )}
            {mostrarPokemonPicker && <PokemonPicker onSelect={elegirPokemon} />}

            <input placeholder={accountType === "tienda" ? "Nombre de la tienda" : "Nombre de usuario"} value={nombre} onChange={(e) => setNombre(e.target.value)}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="Contraseña (mínimo 6 caracteres)" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
            {accountType === "individual" && (
              <>
                <input placeholder="WhatsApp (opcional)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
                <input placeholder="Enlace de Facebook (opcional)" value={facebook} onChange={(e) => setFacebook(e.target.value)}
                  style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
              </>
            )}
            {error && <ErrorBox message={error} />}
            {info && <p style={{ color: COLORS.azulPalido }} className="text-xs">{info}</p>}
            <button onClick={handleSignUp} disabled={loading || !email || !password || !nombre}
              style={{ background: accountType === "tienda" ? COLORS.azulPalido : COLORS.azulClaro, color: COLORS.bg, opacity: loading ? 0.6 : 1 }}
              className="rounded-lg py-2 font-semibold mt-1 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />} Crear cuenta
            </button>
            <button onClick={() => setMode("choose")} style={{ color: COLORS.muted }} className="text-xs">← Volver</button>
          </div>
        )}

        {mode === "login" && (
          <div className="grid gap-3">
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Iniciar sesión</h2>
            <input placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
            <input placeholder="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-2 text-sm outline-none" />
            {error && <ErrorBox message={error} />}
            <button onClick={handleLogin} disabled={loading || !email || !password}
              style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: loading ? 0.6 : 1 }}
              className="rounded-lg py-2 font-semibold mt-1 flex items-center justify-center gap-2">
              {loading && <Loader2 size={16} className="animate-spin" />} Entrar
            </button>
            <button onClick={() => setMode("choose")} style={{ color: COLORS.muted }} className="text-xs">← Volver</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubirFotoManual({ session, onSubido, label }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  const manejar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true); setError(null);
    try {
      const url = await subirImagenCarta(file, session);
      onSubido(url);
    } catch (err) { setError(err.message); } finally { setSubiendo(false); e.target.value = ""; }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap">
        {subiendo ? "Subiendo..." : label || "📷 Subir foto"}
        <input type="file" accept="image/*" className="hidden" onChange={manejar} disabled={subiendo} />
      </label>
      {error && <span style={{ color: "#C24444" }} className="text-xs">{error}</span>}
    </span>
  );
}

function ReintentarImagen({ nombre, setNombre, onEncontrada }) {
  const [buscando, setBuscando] = useState(false);
  const [sinSuerte, setSinSuerte] = useState(false);

  const intentar = async () => {
    setBuscando(true); setSinSuerte(false);
    const { set, numero } = parseNumeroYSet(setNombre);
    const url = await buscarImagenRespaldo(nombre, numero, set);
    setBuscando(false);
    if (url) onEncontrada(url); else setSinSuerte(true);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={intentar} disabled={buscando}
        style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }}
        className="rounded-lg px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
        {buscando ? "Buscando..." : "🔄 Buscar foto"}
      </button>
      {sinSuerte && <span style={{ color: COLORS.muted }} className="text-xs">No se encontró la versión exacta</span>}
    </span>
  );
}

function CardPicker({ onSelect }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(q.trim())}&pagination:itemsPerPage=8`)
        .then((r) => r.json())
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const seleccionar = async (c) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${c.id}`);
      const full = await res.json();
      const total = full.set?.cardCount?.official || full.set?.cardCount?.total || "";

      // Buscamos un precio de referencia: primero TCGPlayer (USD), si no hay, Cardmarket (EUR)
      let precioRefMxn = null;
      const tp = full.pricing?.tcgplayer;
      if (tp) {
        const variante = tp.normal || tp.holofoil || tp["reverse-holofoil"] || tp.unlimited || tp["1st-edition"];
        if (variante?.marketPrice) precioRefMxn = Math.round(variante.marketPrice * USD_TO_MXN);
      }
      if (!precioRefMxn && full.pricing?.cardmarket?.trend) {
        precioRefMxn = Math.round(full.pricing.cardmarket.trend * EUR_TO_MXN);
      }

      let imagen = full.image ? `${full.image}/high.webp` : "";
      if (!imagen) imagen = (await buscarImagenRespaldo(full.name, full.localId, full.set?.name)) || "";

      onSelect({
        name: full.name,
        set_nombre: `${full.set?.name || ""} ${full.localId}${total ? "/" + total : ""}`,
        card_api_id: full.id,
        imagen_url: imagen,
        precio_ref_mxn: precioRefMxn,
      });
    } catch {
      // si falla el detalle, usamos lo que ya teníamos de la lista
      let imagenFallback = c.image ? `${c.image}/high.webp` : "";
      if (!imagenFallback) imagenFallback = (await buscarImagenRespaldo(c.name, c.localId, null)) || "";
      onSelect({
        name: c.name,
        set_nombre: `#${c.localId}`,
        card_api_id: c.id,
        imagen_url: imagenFallback,
        precio_ref_mxn: null,
      });
    } finally {
      setQ(""); setResults([]); setOpen(false); setLoadingDetail(false);
    }
  };

  return (
    <div className="relative">
      <input
        placeholder="Busca la carta oficial (ej. Mega Charizard EX)"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        disabled={loadingDetail}
        style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }}
        className="rounded-lg px-2 py-2 text-sm w-full"
      />
      {loadingDetail && <p style={{ color: COLORS.muted }} className="text-xs mt-1">Cargando datos exactos de la carta...</p>}
      {open && !loadingDetail && q.trim().length >= 3 && (
        <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66` }}
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg shadow-xl">
          {loading && <p style={{ color: COLORS.muted }} className="text-xs p-3">Buscando en el catálogo oficial...</p>}
          {!loading && results.length === 0 && <p style={{ color: COLORS.muted }} className="text-xs p-3">Sin resultados. Prueba con otro nombre.</p>}
          {results.map((c) => (
            <button key={c.id} type="button"
              onClick={() => seleccionar(c)}
              className="flex items-center gap-3 w-full text-left p-2 hover:brightness-125"
              style={{ borderBottom: `1px solid ${COLORS.bg}` }}>
              {c.image && <img src={`${c.image}/low.webp`} alt={c.name} style={{ width: 48, height: 66, objectFit: "contain" }} />}
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p style={{ color: COLORS.muted }} className="text-xs">#{c.localId}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatModal({ session, otherId, otherNombre, contexto, otherWhatsapp, otherFacebook, otherAvatar, onClose }) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const uid = session.user.id;

  const cargarMensajes = () => {
    const path = `mensajes?select=*&contexto=eq.${encodeURIComponent(contexto)}&or=(and(de_perfil_id.eq.${uid},para_perfil_id.eq.${otherId}),and(de_perfil_id.eq.${otherId},para_perfil_id.eq.${uid}))&order=created_at.asc`;
    return sb(path, session);
  };

  const enviar = async (texto) => {
    return sbWrite("POST", "mensajes", { de_perfil_id: uid, para_perfil_id: otherId, texto, contexto }, session);
  };

  useEffect(() => {
    setLoading(true);
    cargarMensajes()
      .then(async (rows) => {
        if (rows.length === 0) {
          // primer contacto: mandamos automáticamente un mensaje indicando qué carta/producto le interesó
          await enviar(`Hola, me interesa: ${contexto}`);
          const de_nuevo = await cargarMensajes();
          setMensajes(de_nuevo);
        } else {
          setMensajes(rows);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await enviar(draft.trim());
      setDraft("");
      const rows = await cargarMensajes();
      setMensajes(rows);
    } catch (e) { setError(e.message); } finally { setSending(false); }
  };

  return (
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulClaro}66`, boxShadow: `0 0 40px ${COLORS.azulClaro}33` }}
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col">
        <div style={{ borderBottom: `1px solid ${COLORS.surface2}` }} className="flex items-center justify-between p-4 gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <AvatarImg url={otherAvatar} size={32} />
            <div className="min-w-0">
              <p className="font-semibold truncate">{otherNombre || "Vendedor"}</p>
              <p style={{ color: COLORS.muted }} className="text-xs truncate">{contexto}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: COLORS.muted }} className="shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 p-4 grid gap-2" style={{ minHeight: "180px", maxHeight: "300px", overflowY: "auto" }}>
          {loading && <Loading label="Cargando conversación..." />}
          {error && <ErrorBox message={error} />}
          {!loading && mensajes.map((m) => (
            <div key={m.id}
              style={{
                alignSelf: m.de_perfil_id === uid ? "flex-end" : "flex-start",
                background: m.de_perfil_id === uid ? `${COLORS.azul}33` : COLORS.surface2,
                border: `1px solid ${m.de_perfil_id === uid ? COLORS.azul : COLORS.surface2}`,
              }}
              className="px-3 py-2 rounded-lg text-sm max-w-[80%]">
              {m.texto}
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.surface2}` }} className="p-3 flex items-center gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Escribe un mensaje..." style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }}
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" />
          <button onClick={handleSend} disabled={sending} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg p-2">
            <Send size={16} />
          </button>
        </div>

        {(otherWhatsapp || otherFacebook) && (
          <div style={{ borderTop: `1px solid ${COLORS.surface2}`, background: COLORS.bg }} className="p-3">
            <p style={{ color: COLORS.muted }} className="text-xs mb-2">O continúa la conversación fuera de la app:</p>
            <div className="flex gap-2">
              {otherWhatsapp && (
                <a href={`https://wa.me/${otherWhatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                  style={{ border: "1px solid #25D36688", color: "#25D366" }} className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1">
                  WhatsApp <ExternalLink size={12} />
                </a>
              )}
              {otherFacebook && (
                <a href={otherFacebook} target="_blank" rel="noreferrer"
                  style={{ border: `1px solid ${COLORS.azulMedio}88`, color: COLORS.azulMedio }} className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1">
                  Facebook <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SealedPicker({ onSelect }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [grupos, setGrupos] = useState([]);
  const [loadingGrupos, setLoadingGrupos] = useState(true);
  const [grupoId, setGrupoId] = useState("");
  const [productos, setProductos] = useState([]);
  const [precios, setPrecios] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/tcgcsv?path=tcgplayer/3/groups")
      .then((r) => r.json())
      .then((d) => setGrupos((d.results || []).slice().sort((a, b) => (b.publishedOn || "").localeCompare(a.publishedOn || ""))))
      .catch(() => {})
      .finally(() => setLoadingGrupos(false));
  }, []);

  useEffect(() => {
    if (!grupoId) { setProductos([]); setPrecios([]); return; }
    setLoadingProductos(true);
    Promise.all([
      fetch(`/api/tcgcsv?path=tcgplayer/3/${grupoId}/products`).then((r) => r.json()),
      fetch(`/api/tcgcsv?path=tcgplayer/3/${grupoId}/prices`).then((r) => r.json()),
    ])
      .then(([p, pr]) => {
        // Filtramos: si el producto NO tiene "Number" en sus datos, no es una carta suelta, es producto sellado
        const sellado = (p.results || []).filter((item) => !(item.extendedData || []).some((e) => e.name === "Number"));
        setProductos(sellado);
        setPrecios(pr.results || []);
      })
      .catch(() => { setProductos([]); setPrecios([]); })
      .finally(() => setLoadingProductos(false));
  }, [grupoId]);

  const filtrados = productos.filter((p) => p.name.toLowerCase().includes(busqueda.toLowerCase()));

  const seleccionar = (p) => {
    const precioInfo = precios.find((x) => x.productId === p.productId && x.marketPrice);
    const precioRefMxn = precioInfo ? Math.round(precioInfo.marketPrice * USD_TO_MXN) : null;
    onSelect({ producto: p.name, imagen_url: p.imageUrl, card_api_id: `tcgcsv-${p.productId}`, precio_ref_mxn: precioRefMxn });
    setOpen(false); setBusqueda("");
  };

  return (
    <div className="grid gap-2">
      <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm w-full">
        <option value="">{loadingGrupos ? "Cargando sets..." : "1. Selecciona el set / expansión"}</option>
        {grupos.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
      </select>

      {grupoId && (
        <div className="relative">
          <input
            placeholder="2. Busca el producto (ej. Elite Trainer Box)"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            style={inputStyle}
            className="rounded-lg px-2 py-2 text-sm w-full"
          />
          {open && (
            <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66` }}
              className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg shadow-xl">
              {loadingProductos && <p style={{ color: COLORS.muted }} className="text-xs p-3">Cargando productos de este set...</p>}
              {!loadingProductos && filtrados.length === 0 && <p style={{ color: COLORS.muted }} className="text-xs p-3">Sin resultados en este set.</p>}
              {filtrados.slice(0, 20).map((p) => (
                <button key={p.productId} type="button" onClick={() => seleccionar(p)}
                  className="flex items-center gap-3 w-full text-left p-2 hover:brightness-125"
                  style={{ borderBottom: `1px solid ${COLORS.bg}` }}>
                  {p.imageUrl && <img src={p.imageUrl} alt={p.name} style={{ width: 40, height: 56, objectFit: "contain" }} />}
                  <p className="text-sm">{p.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RedesSocialesEditor({ session, perfil, onIrAPlanes, onUpdated, esTienda = false }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const info = planDe(perfil);
  const [instagram, setInstagram] = useState(perfil?.instagram || "");
  const [maps, setMaps] = useState(perfil?.google_maps_url || "");
  const [whatsapp, setWhatsapp] = useState(perfil?.whatsapp || "");
  const [facebook, setFacebook] = useState(perfil?.facebook || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  if (!info.redesExtra) {
    return (
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <p style={{ color: COLORS.muted }} className="text-sm">
          🔒 Enlaces directos a Instagram{esTienda ? " y Google Maps" : ", WhatsApp y Facebook"} disponibles desde Zafiro.
        </p>
        <button onClick={onIrAPlanes} style={{ color: COLORS.azulClaro, border: `1px solid ${COLORS.azulClaro}55` }} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">Ver planes</button>
      </div>
    );
  }

  const guardar = async () => {
    setSaving(true); setError(null); setOk(false);
    try {
      const cambios = esTienda
        ? { instagram: instagram || null, google_maps_url: maps || null }
        : { instagram: instagram || null, whatsapp: whatsapp || null, facebook: facebook || null };
      await sbWrite("PATCH", `perfiles?id=eq.${session.user.id}`, cambios, session);
      setOk(true);
      onUpdated?.();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulClaro}55` }} className="rounded-xl p-4 mb-6 grid gap-2">
      <p style={{ color: COLORS.azulClaro }} className="text-sm font-semibold uppercase">Tus redes</p>
      {error && <ErrorBox message={error} />}
      <div className="grid sm:grid-cols-2 gap-2">
        <input placeholder="Enlace de Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
        {esTienda ? (
          <input placeholder="Enlace de Google Maps" value={maps} onChange={(e) => setMaps(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
        ) : (
          <>
            <input placeholder="WhatsApp (con código de país)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
            <input placeholder="Enlace de Facebook" value={facebook} onChange={(e) => setFacebook(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          </>
        )}
      </div>
      <button onClick={guardar} disabled={saving} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold w-fit px-4">
        {saving ? "Guardando..." : "Guardar"}
      </button>
      {ok && <p style={{ color: COLORS.azulPalido }} className="text-xs">Guardado.</p>}
    </div>
  );
}

function MyMarketPanel({ session, perfil, onIrAPlanes }) {
  const [publicaciones, setPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState("carta"); // carta | sellado

  const vacio = { tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", precio: "", precio_antes: "", zona: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null };
  const [nueva, setNueva] = useState(vacio);

  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };

  const cargar = () => {
    setLoading(true); setError(null);
    sb(`mercado_listings?select=*&perfil_id=eq.${session.user.id}&order=created_at.desc`, session)
      .then(setPublicaciones)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const alLimite = limiteAlcanzado(perfil, publicaciones.length);

  const agregar = async () => {
    if (!nueva.carta || !nueva.precio || !nueva.zona) return;
    if (alLimite) { setError(`Alcanzaste el límite de ${planDe(perfil).limiteCartas} publicaciones de tu plan. Mejora a Diamante para inventario ilimitado.`); return; }
    setSaving(true);
    try {
      await sbWrite("POST", "mercado_listings", {
        perfil_id: session.user.id,
        tipo,
        tcg: nueva.tcg,
        carta: nueva.carta,
        set_nombre: nueva.set_nombre || null,
        condicion: tipo === "carta" ? nueva.condicion : null,
        precio: Number(nueva.precio),
        precio_antes: nueva.precio_antes ? Number(nueva.precio_antes) : null,
        cantidad: Number(nueva.cantidad),
        zona: nueva.zona,
        card_api_id: nueva.card_api_id || null,
        imagen_url: nueva.imagen_url || null,
        precio_ref_mxn: nueva.precio_ref_mxn || null,
      }, session);
      setNueva(vacio);
      cargar();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const borrar = async (id) => {
    try { await sbWrite("DELETE", `mercado_listings?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const actualizar = async (id, campo, valor) => {
    try {
      const numerico = ["precio", "cantidad"].includes(campo) ? Number(valor) : campo === "precio_antes" ? (valor ? Number(valor) : null) : valor;
      await sbWrite("PATCH", `mercado_listings?id=eq.${id}`, { [campo]: numerico }, session);
    } catch (e) { setError(e.message); }
  };

  if (loading) return <Loading label="Cargando tus publicaciones..." />;

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Vender en el Mercado</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Publica cartas sueltas o producto sellado para que otros usuarios te encuentren.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <RedesSocialesEditor session={session} perfil={perfil} onIrAPlanes={onIrAPlanes} />

      {planDe(perfil).carpetas ? (
        <CarpetasPanel session={session} perfil={perfil} contexto="mercado" onPublicado={cargar} />
      ) : (
        <div className="mb-6">
          <UpsellCard requiere={PLAN_INFO.ultraball} plan="ultraball" onIrAPlanes={onIrAPlanes}>
            Sube fotos de tu álbum físico y deja que la IA identifique cada carta por ti, en vez de agregarlas una por una.
          </UpsellCard>
        </div>
      )}

      <p style={{ color: COLORS.muted }} className="text-xs mb-3">
        {publicaciones.length} / {planDe(perfil).limiteCartas === Infinity ? "∞" : planDe(perfil).limiteCartas} publicaciones usadas
      </p>
      {alLimite && (
        <div style={{ background: `${COLORS.azulPalido}11`, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <p style={{ color: COLORS.azulPalido }} className="text-sm">Alcanzaste el límite de tu plan. Mejora a Diamante para publicaciones ilimitadas.</p>
          <button onClick={onIrAPlanes} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">Ver planes</button>
        </div>
      )}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-6 grid gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => { setTipo("carta"); setNueva(vacio); }}
            style={{ background: tipo === "carta" ? COLORS.surface2 : "transparent", border: `1px solid ${tipo === "carta" ? COLORS.azulPalido : COLORS.surface2}`, color: tipo === "carta" ? COLORS.azulPalido : COLORS.muted }}
            className="px-3 py-1.5 rounded-full text-sm font-semibold">Carta suelta</button>
          <button type="button" onClick={() => { setTipo("sellado"); setNueva(vacio); }}
            style={{ background: tipo === "sellado" ? COLORS.surface2 : "transparent", border: `1px solid ${tipo === "sellado" ? COLORS.azulClaro : COLORS.surface2}`, color: tipo === "sellado" ? COLORS.azulClaro : COLORS.muted }}
            className="px-3 py-1.5 rounded-full text-sm font-semibold">Producto sellado</button>
        </div>

        {tipo === "carta" ? (
          <>
            <select value={nueva.tcg} onChange={(e) => setNueva({ ...nueva, tcg: e.target.value, carta: "", set_nombre: "", card_api_id: "", imagen_url: "" })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm">
              <option value="pokemon">Pokémon</option><option value="yugioh">Yu-Gi-Oh!</option><option value="lorcana">Lorcana</option><option value="magic">Magic</option><option value="onepiece">One Piece</option>
            </select>
            {nueva.tcg === "pokemon" ? (
              <div>
                <CardPicker onSelect={(c) => setNueva({ ...nueva, carta: c.name, set_nombre: c.set_nombre, card_api_id: c.card_api_id, imagen_url: c.imagen_url, precio_ref_mxn: c.precio_ref_mxn, precio: nueva.precio || (c.precio_ref_mxn ? String(c.precio_ref_mxn) : "") })} />
                {nueva.card_api_id && (
                  <div className="flex items-center gap-3 mt-2">
                    {nueva.imagen_url && <img src={nueva.imagen_url} alt={nueva.carta} style={{ width: 60, height: 84, objectFit: "contain" }} />}
                    <div>
                      <Badge color={COLORS.azulPalido}>{nueva.carta}</Badge>
                      {nueva.precio_ref_mxn && <p style={{ color: COLORS.azulClaro }} className="text-xs mt-1">Precio de referencia: ~${nueva.precio_ref_mxn.toLocaleString("es-MX")} MXN</p>}
                      <button type="button" onClick={() => setNueva({ ...nueva, carta: "", set_nombre: "", card_api_id: "", imagen_url: "", precio_ref_mxn: null })} style={{ color: COLORS.muted }} className="text-xs mt-1">Cambiar</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                <input placeholder="Nombre de la carta" value={nueva.carta} onChange={(e) => setNueva({ ...nueva, carta: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
                <input placeholder="Set / número" value={nueva.set_nombre} onChange={(e) => setNueva({ ...nueva, set_nombre: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
              </div>
            )}
            <input placeholder="Condición (ej. NM, LP)" value={nueva.condicion} onChange={(e) => setNueva({ ...nueva, condicion: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          </>
        ) : (
          <SealedPicker onSelect={(p) => setNueva({ ...nueva, carta: p.producto, imagen_url: p.imagen_url, card_api_id: p.card_api_id, precio_ref_mxn: p.precio_ref_mxn, precio: nueva.precio || (p.precio_ref_mxn ? String(p.precio_ref_mxn) : "") })} />
        )}

        {tipo === "sellado" && nueva.card_api_id && (
          <div className="flex items-center gap-3">
            {nueva.imagen_url && <img src={nueva.imagen_url} alt={nueva.carta} style={{ width: 60, height: 84, objectFit: "contain" }} />}
            <div>
              <Badge color={COLORS.azulClaro}>{nueva.carta}</Badge>
              {nueva.precio_ref_mxn && <p style={{ color: COLORS.azulPalido }} className="text-xs mt-1">Precio de referencia: ~${nueva.precio_ref_mxn.toLocaleString("es-MX")} MXN</p>}
              <button type="button" onClick={() => setNueva({ ...nueva, carta: "", imagen_url: "", card_api_id: "", precio_ref_mxn: null })} style={{ color: COLORS.muted }} className="text-xs mt-1">Cambiar</button>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-4 gap-2">
          <input placeholder="Precio" type="number" value={nueva.precio} onChange={(e) => setNueva({ ...nueva, precio: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <input placeholder="Precio antes (oferta, opcional)" type="number" value={nueva.precio_antes} onChange={(e) => setNueva({ ...nueva, precio_antes: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <input placeholder="Zona (ej. Centro, San Pedro)" value={nueva.zona} onChange={(e) => setNueva({ ...nueva, zona: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <button onClick={agregar} disabled={saving || alLimite} style={{ background: COLORS.azul, color: COLORS.text, opacity: alLimite ? 0.5 : 1 }} className="rounded-lg py-2 text-sm font-semibold">
            {alLimite ? "Límite alcanzado" : saving ? "Publicando..." : "+ Publicar"}
          </button>
        </div>
      </div>

      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Tus publicaciones</h3>
      <div className="grid gap-2">
        {publicaciones.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no has publicado nada en el mercado.</p>}
        {publicaciones.map((item) => (
          <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
            {item.imagen_url && <img src={item.imagen_url} alt={item.carta} style={{ width: 44, height: 62, objectFit: "contain" }} />}
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{item.carta}</p>
                <Badge color={item.tipo === "sellado" ? COLORS.azulClaro : COLORS.azulPalido}>{item.tipo === "sellado" ? "Sellado" : "Carta"}</Badge>
                <BoostBadge item={item} />
              </div>
              <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} {item.condicion ? `· ${item.condicion}` : ""} · {item.zona}</p>
            </div>
            <input type="number" defaultValue={item.precio} onBlur={(e) => actualizar(item.id, "precio", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio" />
            <input type="number" defaultValue={item.precio_antes || ""} onBlur={(e) => actualizar(item.id, "precio_antes", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio antes (oferta, deja vacío para quitarla)" placeholder="Antes" />
            {!item.imagen_url && <ReintentarImagen nombre={item.carta} setNombre={item.set_nombre} onEncontrada={async (url) => { await actualizar(item.id, "imagen_url", url); cargar(); }} />}
            <SubirFotoManual session={session} label={item.imagen_url ? "Cambiar foto" : "📷 Sin foto"} onSubido={async (url) => { await actualizar(item.id, "imagen_url", url); cargar(); }} />
            <BoostButton session={session} tabla="mercado_listings" item={item} onBoosted={cargar} />
            <button onClick={() => borrar(item.id)} style={{ color: COLORS.azulPalido }} className="text-xs px-2">Borrar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CambiarPlanAdmin({ session }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [planNuevo, setPlanNuevo] = useState("pokeball");
  const [venceNuevo, setVenceNuevo] = useState("");
  const [limpiarPreapproval, setLimpiarPreapproval] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(null);

  const buscar = async () => {
    if (!query.trim()) return;
    setBuscando(true); setError(null); setOk(null);
    try {
      const q = encodeURIComponent(query.trim());
      const rows = await sb(`perfiles?select=id,nombre,email,tipo,plan,plan_vence,mp_preapproval_id&or=(nombre.ilike.*${q}*,email.ilike.*${q}*)&limit=15`, session);
      setResultados(rows);
    } catch (e) { setError(e.message); } finally { setBuscando(false); }
  };

  const seleccionar = (u) => {
    setUsuario(u);
    setPlanNuevo(u.plan || "pokeball");
    setVenceNuevo(u.plan_vence ? u.plan_vence.slice(0, 16) : "");
    setLimpiarPreapproval(false);
    setOk(null); setError(null);
  };

  const mas30dias = () => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 30);
    setVenceNuevo(fecha.toISOString().slice(0, 16));
  };

  const guardar = async () => {
    if (!usuario) return;
    setGuardando(true); setError(null); setOk(null);
    try {
      const cambios = {
        plan: planNuevo,
        plan_vence: venceNuevo ? new Date(venceNuevo).toISOString() : null,
      };
      if (limpiarPreapproval) cambios.mp_preapproval_id = null;
      await sbWrite("PATCH", `perfiles?id=eq.${usuario.id}`, cambios, session);
      if (planNuevo === "masterball") {
        // Solo pone la fecha la primera vez que llega a Diamante (is.null evita pisarla si ya la tenía).
        await sbWrite("PATCH", `perfiles?id=eq.${usuario.id}&diamante_desde=is.null`, { diamante_desde: new Date().toISOString() }, session);
      }
      setUsuario({ ...usuario, ...cambios });
      setResultados(resultados.map((r) => (r.id === usuario.id ? { ...r, ...cambios } : r)));
      setOk(`Listo: el plan de ${usuario.nombre} ahora es ${PLAN_INFO[planNuevo].nombre}.`);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🎚️ Cambiar plan de un usuario</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-4">
        Busca una cuenta por nombre o correo y cámbiale el plan a mano (útil, por ejemplo, si se reembolsó un pago).
      </p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div className="flex gap-2 mb-4">
        <input placeholder="Busca por nombre o correo..." value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()} style={inputStyle} className="rounded-lg px-3 py-2 text-sm flex-1" />
        <button onClick={buscar} disabled={buscando || !query.trim()} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {resultados.length > 0 && (
        <div className="grid gap-2 mb-6">
          {resultados.map((u) => (
            <button key={u.id} onClick={() => seleccionar(u)}
              style={{ background: usuario?.id === u.id ? `${COLORS.azul}33` : COLORS.surface, border: `1px solid ${usuario?.id === u.id ? COLORS.azulPalido : COLORS.surface2}` }}
              className="text-left rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-semibold text-sm">{u.nombre}</p>
                <p style={{ color: COLORS.muted }} className="text-xs">{u.email || "(sin correo)"} · {u.tipo}</p>
              </div>
              <PlanBadge perfil={u} />
            </button>
          ))}
        </div>
      )}

      {usuario && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 grid gap-3">
          <p className="font-semibold text-sm">Editando a: {usuario.nombre}</p>
          {ok && <p style={{ color: COLORS.azulPalido }} className="text-xs">{ok}</p>}

          <div>
            <p style={{ color: COLORS.muted }} className="text-xs mb-1">Plan</p>
            <select value={planNuevo} onChange={(e) => setPlanNuevo(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm w-full">
              {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_INFO[p].nombre}</option>)}
            </select>
          </div>

          <div>
            <p style={{ color: COLORS.muted }} className="text-xs mb-1">Vence el (vacío = sin vencimiento)</p>
            <div className="flex gap-2 flex-wrap items-center">
              <input type="datetime-local" value={venceNuevo} onChange={(e) => setVenceNuevo(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
              <button type="button" onClick={mas30dias} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">+30 días</button>
              <button type="button" onClick={() => setVenceNuevo("")} style={{ color: COLORS.muted }} className="text-xs">Sin vencimiento</button>
            </div>
          </div>

          {usuario.mp_preapproval_id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={limpiarPreapproval} onChange={(e) => setLimpiarPreapproval(e.target.checked)} />
              Cancelar también la renovación automática registrada ({usuario.mp_preapproval_id})
            </label>
          )}

          <button onClick={guardar} disabled={guardando} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold">
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminPanel({ session }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [tabAdmin, setTabAdmin] = useState("planes");
  const [tiendasSinDueno, setTiendasSinDueno] = useState([]);
  const [perfilesDisponibles, setPerfilesDisponibles] = useState([]);
  const [seleccion, setSeleccion] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vinculando, setVinculando] = useState(null);

  const cargar = () => {
    setLoading(true); setError(null);
    Promise.all([
      sb(`tiendas?select=*&perfil_id=is.null&order=nombre.asc`, session),
      sb(`perfiles?select=*&tipo=eq.tienda&order=nombre.asc`, session),
      sb(`tiendas?select=perfil_id&perfil_id=not.is.null`, session),
    ])
      .then(([sinDueno, perfilesTienda, conDueno]) => {
        const vinculados = new Set(conDueno.map((t) => t.perfil_id));
        setTiendasSinDueno(sinDueno);
        setPerfilesDisponibles(perfilesTienda.filter((p) => !vinculados.has(p.id)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const vincular = async (tiendaId) => {
    const perfilId = seleccion[tiendaId];
    if (!perfilId) return;
    setVinculando(tiendaId);
    try {
      await sbWrite("PATCH", `tiendas?id=eq.${tiendaId}`, { perfil_id: perfilId }, session);
      cargar();
    } catch (e) { setError(e.message); } finally { setVinculando(null); }
  };

  // ---- Anuncios ----
  const inputStyleAnuncio = inputStyle;
  const [tituloAnuncio, setTituloAnuncio] = useState("");
  const [contenidoAnuncio, setContenidoAnuncio] = useState("");
  const [modoAnuncio, setModoAnuncio] = useState("ahora"); // ahora | programar
  const [programarFecha, setProgramarFecha] = useState("");
  const [imagenAnuncio, setImagenAnuncio] = useState(null);
  const [imagenAnuncioPreview, setImagenAnuncioPreview] = useState(null);
  const [creandoAnuncio, setCreandoAnuncio] = useState(false);
  const [errorAnuncio, setErrorAnuncio] = useState(null);
  const [pendientes, setPendientes] = useState([]);
  const [programados, setProgramados] = useState([]);
  const [loadingAnuncios, setLoadingAnuncios] = useState(true);
  const [procesando, setProcesando] = useState(null);

  const cargarAnuncios = () => {
    setLoadingAnuncios(true);
    Promise.all([
      sb(`noticias?select=*,tiendas(nombre,perfiles(avatar_url))&estado=eq.pendiente&order=created_at.desc`, session),
      sb(`noticias?select=*,tiendas(nombre,perfiles(avatar_url))&estado=eq.programado&order=fecha_publicacion.asc`, session),
    ])
      .then(([p, prog]) => { setPendientes(p); setProgramados(prog); })
      .catch((e) => setErrorAnuncio(e.message))
      .finally(() => setLoadingAnuncios(false));
  };

  useEffect(() => { cargarAnuncios(); }, []);

  const notificarAnuncio = async (anuncioId) => {
    try {
      await fetch("/api/anuncios/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ anuncioId }),
      });
    } catch { /* el anuncio ya quedó publicado aunque el push falle */ }
  };

  const crearAnuncio = async () => {
    if (!tituloAnuncio.trim() || !contenidoAnuncio.trim()) return;
    const esProgramado = modoAnuncio === "programar" && programarFecha;
    if (modoAnuncio === "programar" && !programarFecha) { setErrorAnuncio("Elige la fecha y hora de publicación."); return; }
    setCreandoAnuncio(true); setErrorAnuncio(null);
    try {
      const imagen_url = imagenAnuncio ? await subirImagenAnuncio(imagenAnuncio, session) : null;
      const creado = await sbWrite("POST", "noticias", {
        tipo: "anuncio",
        titulo: tituloAnuncio.trim(),
        contenido: contenidoAnuncio.trim(),
        imagen_url,
        tienda_id: null,
        creado_por: session.user.id,
        estado: esProgramado ? "programado" : "publicado",
        publicado: !esProgramado,
        fecha_publicacion: esProgramado ? new Date(programarFecha).toISOString() : new Date().toISOString(),
      }, session);
      const fila = Array.isArray(creado) ? creado[0] : creado;
      if (!esProgramado && fila?.id) await notificarAnuncio(fila.id);
      setTituloAnuncio(""); setContenidoAnuncio(""); setProgramarFecha(""); setModoAnuncio("ahora");
      setImagenAnuncio(null); setImagenAnuncioPreview(null);
      cargarAnuncios();
    } catch (e) { setErrorAnuncio(e.message); } finally { setCreandoAnuncio(false); }
  };

  const aprobarAnuncio = async (anuncio) => {
    setProcesando(anuncio.id);
    try {
      await sbWrite("PATCH", `noticias?id=eq.${anuncio.id}`, {
        estado: "publicado", publicado: true, fecha_publicacion: new Date().toISOString(), aprobado_por: session.user.id,
      }, session);
      await notificarAnuncio(anuncio.id);
      cargarAnuncios();
    } catch (e) { setErrorAnuncio(e.message); } finally { setProcesando(null); }
  };

  const rechazarAnuncio = async (anuncio) => {
    setProcesando(anuncio.id);
    try {
      await sbWrite("PATCH", `noticias?id=eq.${anuncio.id}`, { estado: "rechazado", aprobado_por: session.user.id }, session);
      cargarAnuncios();
    } catch (e) { setErrorAnuncio(e.message); } finally { setProcesando(null); }
  };

  // ---- Errores detectados ----
  const [errores, setErrores] = useState([]);
  const [loadingErrores, setLoadingErrores] = useState(true);
  const [marcandoError, setMarcandoError] = useState(null);

  const cargarErrores = () => {
    setLoadingErrores(true);
    sb(`errores_app?select=*&resuelto=eq.false&order=created_at.desc&limit=30`, session)
      .then(setErrores)
      .catch(() => {})
      .finally(() => setLoadingErrores(false));
  };

  useEffect(() => { cargarErrores(); }, []);

  const marcarErrorResuelto = async (id) => {
    setMarcandoError(id);
    try {
      await sbWrite("PATCH", `errores_app?id=eq.${id}`, { resuelto: true }, session);
      setErrores((prev) => prev.filter((e) => e.id !== id));
    } catch {} finally { setMarcandoError(null); }
  };

  // ---- Todas las tiendas (para detectar duplicadas y borrar) ----
  const [todasTiendas, setTodasTiendas] = useState([]);
  const [loadingTodasTiendas, setLoadingTodasTiendas] = useState(true);
  const [borrandoTienda, setBorrandoTienda] = useState(null);

  const cargarTodasTiendas = () => {
    setLoadingTodasTiendas(true);
    sb(`tiendas?select=*&order=nombre.asc`, session)
      .then(setTodasTiendas)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingTodasTiendas(false));
  };

  useEffect(() => { cargarTodasTiendas(); }, []);

  const conteoNombresTienda = {};
  todasTiendas.forEach((t) => {
    const k = (t.nombre || "").trim().toLowerCase();
    conteoNombresTienda[k] = (conteoNombresTienda[k] || 0) + 1;
  });

  const borrarTienda = async (t) => {
    if (!window.confirm(`¿Borrar la tienda "${t.nombre}"? Esto no se puede deshacer. Si tiene cartas o producto sellado, primero bórralos desde "Publicaciones".`)) return;
    setBorrandoTienda(t.id);
    try {
      await sbWrite("DELETE", `tiendas?id=eq.${t.id}`, {}, session);
      cargarTodasTiendas();
    } catch (e) { setError(e.message); } finally { setBorrandoTienda(null); }
  };

  // ---- Publicaciones: buscar y borrar cualquier carta/sellado/mercado ----
  const [buscarPub, setBuscarPub] = useState("");
  const [resultadosPub, setResultadosPub] = useState(null);
  const [buscandoPub, setBuscandoPub] = useState(false);
  const [borrandoPub, setBorrandoPub] = useState(null);

  const buscarPublicaciones = async () => {
    if (!buscarPub.trim()) return;
    setBuscandoPub(true); setError(null);
    try {
      const q = encodeURIComponent(buscarPub.trim());
      const [inv, sel, merc] = await Promise.all([
        sb(`inventario_tienda?select=*,tiendas(nombre)&carta=ilike.*${q}*&order=carta.asc`, session),
        sb(`sellado_tienda?select=*,tiendas(nombre)&producto=ilike.*${q}*&order=producto.asc`, session),
        sb(`mercado_listings?select=*,perfiles(nombre)&carta=ilike.*${q}*&order=carta.asc`, session),
      ]);
      setResultadosPub({ inventario: inv, sellado: sel, mercado: merc });
    } catch (e) { setError(e.message); } finally { setBuscandoPub(false); }
  };

  const borrarPublicacion = async (tabla, id) => {
    setBorrandoPub(`${tabla}-${id}`);
    try {
      await sbWrite("DELETE", `${tabla}?id=eq.${id}`, {}, session);
      setResultadosPub((prev) => ({
        inventario: tabla === "inventario_tienda" ? prev.inventario.filter((x) => x.id !== id) : prev.inventario,
        sellado: tabla === "sellado_tienda" ? prev.sellado.filter((x) => x.id !== id) : prev.sellado,
        mercado: tabla === "mercado_listings" ? prev.mercado.filter((x) => x.id !== id) : prev.mercado,
      }));
    } catch (e) { setError(e.message); } finally { setBorrandoPub(null); }
  };

  if (loading) return <Loading label="Cargando panel de administración..." />;

  const tabs = [
    { id: "planes", label: "Planes" },
    { id: "tiendas", label: "Tiendas" },
    { id: "anuncios", label: "Anuncios" },
    { id: "publicaciones", label: "Publicaciones" },
    { id: "errores", label: "Errores" },
  ];

  return (
    <div>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-2xl font-bold mb-6">Panel de administración</h1>

      <div className="flex gap-2 flex-wrap mb-8" style={{ borderBottom: `1px solid ${COLORS.surface2}` }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTabAdmin(t.id)}
            style={{
              color: tabAdmin === t.id ? COLORS.azulPalido : COLORS.muted,
              borderBottom: `2px solid ${tabAdmin === t.id ? COLORS.azulPalido : "transparent"}`,
            }}
            className="px-3 py-2 text-sm font-semibold -mb-px">
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {tabAdmin === "planes" && <CambiarPlanAdmin session={session} />}

      {tabAdmin === "tiendas" && (
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Vincular tiendas</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-6">Vincula cuentas de tienda registradas con su tienda real en el directorio.</p>

          {tiendasSinDueno.length === 0 ? (
            <p style={{ color: COLORS.muted }} className="text-sm mb-8">Todas las tiendas del directorio ya tienen una cuenta vinculada. 🎉</p>
          ) : (
            <div className="grid gap-3 mb-8">
              {tiendasSinDueno.map((t) => (
                <div key={t.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold">{t.nombre}</p>
                    <p style={{ color: COLORS.muted }} className="text-xs">{t.direccion}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={seleccion[t.id] || ""} onChange={(e) => setSeleccion({ ...seleccion, [t.id]: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm">
                      <option value="">Selecciona cuenta...</option>
                      {perfilesDisponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                    <button onClick={() => vincular(t.id)} disabled={!seleccion[t.id] || vinculando === t.id}
                      style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: seleccion[t.id] ? 1 : 0.5 }}
                      className="rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap">
                      {vinculando === t.id ? "Vinculando..." : "Vincular"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {perfilesDisponibles.length === 0 && tiendasSinDueno.length > 0 && (
            <p style={{ color: COLORS.muted }} className="text-xs mb-8">No hay cuentas de tipo tienda registradas todavía para vincular.</p>
          )}

          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Todas las tiendas</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-4">
            Las marcadas en rojo comparten nombre con otra — probablemente duplicadas. Bórralas desde aquí (si tienen inventario, primero bórralo en "Publicaciones").
          </p>
          {loadingTodasTiendas ? <Loading label="Cargando tiendas..." /> : (
            <div className="grid gap-2">
              {todasTiendas.map((t) => {
                const esDuplicada = conteoNombresTienda[(t.nombre || "").trim().toLowerCase()] > 1;
                return (
                  <div key={t.id} style={{ background: COLORS.surface, border: `1px solid ${esDuplicada ? "#C24444" : COLORS.surface2}` }} className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{t.nombre} {esDuplicada && <span style={{ color: "#C24444" }} className="text-xs font-semibold">· posible duplicado</span>}</p>
                      <p style={{ color: COLORS.muted }} className="text-xs">{t.direccion}{t.zona ? ` · ${t.zona}` : ""}{t.perfil_id ? "" : " · sin cuenta vinculada"}</p>
                    </div>
                    <button onClick={() => borrarTienda(t)} disabled={borrandoTienda === t.id}
                      style={{ color: "#C24444", border: "1px solid #C2444455" }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                      {borrandoTienda === t.id ? "Borrando..." : "Borrar tienda"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tabAdmin === "anuncios" && (
        <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">📢 Anuncios</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-4">Crea un anuncio para publicarlo de inmediato o programarlo, y revisa los que proponen las tiendas.</p>
      {errorAnuncio && <div className="mb-4"><ErrorBox message={errorAnuncio} /></div>}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-6 grid gap-3">
        <input placeholder="Título del anuncio" value={tituloAnuncio} onChange={(e) => setTituloAnuncio(e.target.value)}
          style={inputStyleAnuncio} className="rounded-lg px-3 py-2 text-sm" />
        <textarea placeholder="Contenido del anuncio" rows={3} value={contenidoAnuncio} onChange={(e) => setContenidoAnuncio(e.target.value)}
          style={inputStyleAnuncio} className="rounded-lg px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          {imagenAnuncioPreview && <img src={imagenAnuncioPreview} alt="" style={{ width: 70, height: 70, objectFit: "cover" }} className="rounded-lg" />}
          <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer">
            {imagenAnuncioPreview ? "Cambiar imagen" : "+ Agregar imagen (opcional)"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImagenAnuncio(file);
              setImagenAnuncioPreview(URL.createObjectURL(file));
            }} />
          </label>
          {imagenAnuncioPreview && (
            <button type="button" onClick={() => { setImagenAnuncio(null); setImagenAnuncioPreview(null); }} style={{ color: COLORS.muted }} className="text-xs">Quitar</button>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={modoAnuncio === "ahora"} onChange={() => setModoAnuncio("ahora")} /> Publicar ahora
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={modoAnuncio === "programar"} onChange={() => setModoAnuncio("programar")} /> Programar
          </label>
          {modoAnuncio === "programar" && (
            <input type="datetime-local" value={programarFecha} onChange={(e) => setProgramarFecha(e.target.value)}
              style={inputStyleAnuncio} className="rounded-lg px-2 py-1.5 text-sm" />
          )}
        </div>
        <button onClick={crearAnuncio} disabled={creandoAnuncio || !tituloAnuncio.trim() || !contenidoAnuncio.trim()}
          style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold">
          {creandoAnuncio ? "Guardando..." : modoAnuncio === "programar" ? "Programar anuncio" : "Publicar ahora"}
        </button>
      </div>

      {loadingAnuncios ? <Loading label="Cargando anuncios..." /> : (
        <>
          <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Pendientes de aprobación (propuestos por tiendas)</h3>
          {pendientes.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm mb-6">No hay anuncios esperando aprobación.</p>}
          <div className="grid gap-3 mb-8">
            {pendientes.map((n) => (
              <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AvatarImg url={n.tiendas?.perfiles?.avatar_url} size={24} />
                  <p className="text-sm font-semibold">{n.tiendas?.nombre || "Tienda"}</p>
                </div>
                {n.imagen_url && <img src={n.imagen_url} alt="" style={{ maxHeight: 140, objectFit: "cover" }} className="rounded-lg mb-2 w-full" />}
                <p className="font-semibold">{n.titulo}</p>
                <p style={{ color: COLORS.muted }} className="text-sm mt-1">{n.contenido}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => aprobarAnuncio(n)} disabled={procesando === n.id}
                    style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                    {procesando === n.id ? "..." : "Aprobar y publicar"}
                  </button>
                  <button onClick={() => rechazarAnuncio(n)} disabled={procesando === n.id}
                    style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Programados</h3>
          {programados.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">No hay anuncios programados.</p>}
          <div className="grid gap-3">
            {programados.map((n) => (
              <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4">
                <p style={{ color: COLORS.muted }} className="text-xs mb-1">
                  Se publica: {new Date(n.fecha_publicacion).toLocaleString("es-MX")}
                </p>
                {n.imagen_url && <img src={n.imagen_url} alt="" style={{ maxHeight: 140, objectFit: "cover" }} className="rounded-lg mb-2 w-full" />}
                <p className="font-semibold">{n.titulo}</p>
                <p style={{ color: COLORS.muted }} className="text-sm mt-1">{n.contenido}</p>
              </div>
            ))}
          </div>
        </>
      )}
        </div>
      )}

      {tabAdmin === "publicaciones" && (
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🔎 Publicaciones</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-4">
            Busca cualquier carta o producto (de tiendas o del Mercado entre usuarios) para revisarlo o borrarlo — por ejemplo, publicaciones sin imagen o duplicadas.
          </p>
          <div className="flex gap-2 mb-6">
            <input placeholder="Busca por nombre (ej. Charizard ex)" value={buscarPub}
              onChange={(e) => setBuscarPub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarPublicaciones()}
              style={inputStyle} className="rounded-lg px-3 py-2 text-sm flex-1" />
            <button onClick={buscarPublicaciones} disabled={buscandoPub || !buscarPub.trim()}
              style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
              {buscandoPub ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {resultadosPub && (
            <div className="grid gap-6">
              {[
                { key: "inventario", tabla: "inventario_tienda", titulo: "Cartas de tiendas", campo: "carta", dueno: (r) => r.tiendas?.nombre },
                { key: "sellado", tabla: "sellado_tienda", titulo: "Producto sellado de tiendas", campo: "producto", dueno: (r) => r.tiendas?.nombre },
                { key: "mercado", tabla: "mercado_listings", titulo: "Mercado (usuarios individuales)", campo: "carta", dueno: (r) => r.perfiles?.nombre },
              ].map((grupo) => (
                <div key={grupo.key}>
                  <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-2 text-sm uppercase">{grupo.titulo} ({resultadosPub[grupo.key].length})</h3>
                  {resultadosPub[grupo.key].length === 0 ? (
                    <p style={{ color: COLORS.muted }} className="text-xs mb-2">Sin resultados.</p>
                  ) : (
                    <div className="grid gap-2">
                      {resultadosPub[grupo.key].map((r) => (
                        <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${r.imagen_url ? COLORS.surface2 : "#C24444"}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
                          {r.imagen_url ? (
                            <img src={r.imagen_url} alt="" style={{ width: 44, height: 62, objectFit: "contain" }} />
                          ) : (
                            <div style={{ width: 44, height: 62, background: COLORS.surface2 }} className="flex items-center justify-center rounded shrink-0">
                              <Package size={18} color="#C24444" />
                            </div>
                          )}
                          <div className="flex-1 min-w-[140px]">
                            <p className="text-sm font-medium">{r[grupo.campo]}</p>
                            <p style={{ color: COLORS.muted }} className="text-xs">{grupo.dueno(r) || "(sin dueño)"} · ${Number(r.precio).toLocaleString("es-MX")}</p>
                            {!r.imagen_url && <p style={{ color: "#C24444" }} className="text-xs font-semibold">Sin imagen</p>}
                          </div>
                          <button onClick={() => borrarPublicacion(grupo.tabla, r.id)} disabled={borrandoPub === `${grupo.tabla}-${r.id}`}
                            style={{ color: "#C24444", border: "1px solid #C2444455" }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                            {borrandoPub === `${grupo.tabla}-${r.id}` ? "Borrando..." : "Borrar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tabAdmin === "errores" && (
        <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🐞 Errores detectados</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-4">Errores capturados automáticamente del navegador de los usuarios. Al resolverlos, márcalos para que desaparezcan de esta lista.</p>
      {loadingErrores ? <Loading label="Cargando errores..." /> : errores.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm">Sin errores pendientes. 🎉</p>
      ) : (
        <div className="grid gap-3">
          {errores.map((e) => (
            <div key={e.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{e.mensaje}</p>
                  {e.url && <p style={{ color: COLORS.muted }} className="text-xs mt-1 break-all">{e.url}</p>}
                  <p style={{ color: COLORS.muted }} className="text-xs mt-1">
                    {new Date(e.created_at).toLocaleString("es-MX")}
                  </p>
                  {e.stack && (
                    <details className="mt-2">
                      <summary style={{ color: COLORS.azulPalido }} className="text-xs cursor-pointer">Ver detalle técnico</summary>
                      <pre style={{ color: COLORS.muted, whiteSpace: "pre-wrap" }} className="text-xs mt-1">{e.stack}</pre>
                    </details>
                  )}
                </div>
                <button onClick={() => marcarErrorResuelto(e.id)} disabled={marcandoError === e.id}
                  style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                  {marcandoError === e.id ? "..." : "Marcar resuelto"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      )}
    </div>
  );
}

function ImportadorMasivo({ session, tiendaId, onImportado }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  const filasDeTexto = () =>
    texto.split("\n").map((l) => l.trim()).filter(Boolean).map((linea) => {
      const [carta, set_nombre, condicion, precio, cantidad] = linea.split(",").map((c) => c.trim());
      return { carta, set_nombre: set_nombre || null, condicion: condicion || "NM", precio: Number(precio), cantidad: Number(cantidad) || 1 };
    });

  const filasDeArchivo = async (file) => {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const libro = XLSX.read(buffer, { type: "array" });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });
    return filas.map((f) => ({
      carta: String(f.carta || f.nombre || f.Carta || f.Nombre || "").trim(),
      set_nombre: String(f.set_nombre || f.set || f.Set || "").trim() || null,
      condicion: String(f.condicion || f.Condicion || "NM").trim() || "NM",
      precio: Number(f.precio || f.Precio || 0),
      cantidad: Number(f.cantidad || f.Cantidad || 1) || 1,
    }));
  };

  const importar = async (filas) => {
    const validas = filas.filter((f) => f.carta && f.precio > 0);
    if (validas.length === 0) { setError("No encontramos filas válidas (revisa que tengan nombre y precio)."); return; }
    setImportando(true); setError(null); setResultado(null);
    try {
      await sbWrite("POST", "inventario_tienda", validas.map((f) => ({
        tienda_id: tiendaId,
        tcg: "pokemon",
        carta: f.carta,
        set_nombre: f.set_nombre,
        condicion: f.condicion,
        idioma: "EN",
        precio: f.precio,
        cantidad: f.cantidad,
      })), session);
      setResultado(`Se importaron ${validas.length} productos.`);
      setTexto("");
      onImportado?.();
    } catch (e) { setError(e.message); } finally { setImportando(false); }
  };

  const handleArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const filas = await filasDeArchivo(file);
      await importar(filas);
    } catch (err) { setError("No se pudo leer el archivo: " + err.message); }
    e.target.value = "";
  };

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-6 grid gap-3">
      <p style={{ color: COLORS.azulPalido }} className="text-sm font-semibold uppercase">🔴 Importador masivo (Aurora)</p>
      {error && <ErrorBox message={error} />}
      {resultado && <p style={{ color: COLORS.azulPalido }} className="text-xs">{resultado}</p>}

      <textarea
        placeholder={"Pega tu lista, una carta por línea:\nCharizard ex, SV 054/198, NM, 350, 2\nPikachu VMAX, SWSH 044, LP, 180, 1"}
        value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
        style={inputStyle} className="rounded-lg px-3 py-2 text-sm font-mono"
      />
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => importar(filasDeTexto())} disabled={importando || !texto.trim()}
          style={{ background: COLORS.azul, color: COLORS.text }} className="rounded-lg px-4 py-2 text-sm font-semibold">
          {importando ? "Importando..." : "Importar lista de texto"}
        </button>
        <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer">
          Subir CSV / Excel
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArchivo} className="hidden" disabled={importando} />
        </label>
      </div>
      <p style={{ color: COLORS.muted }} className="text-xs">
        Formato de texto: nombre, set (opcional), condición (opcional, NM por defecto), precio, cantidad (opcional, 1 por defecto) — separados por comas.
        En Excel/CSV usa columnas: carta, set_nombre, condicion, precio, cantidad.
      </p>
    </div>
  );
}

// Panel de "Carpetas": álbumes de fotos donde, al subir una foto de una
// página, se le pide a la IA (Claude, con visión) que identifique cada
// carta visible; el vendedor revisa lo detectado, le pone precio y
// publica en bloque. Disponible desde Amatista en adelante.
function CarpetasPanel({ session, perfil, contexto, tiendaId, onPublicado }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [carpetas, setCarpetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [creando, setCreando] = useState(false);
  const [subiendoFotoPara, setSubiendoFotoPara] = useState(null);
  const [revision, setRevision] = useState(null); // { carpetaId, filas: [...] }
  const [publicando, setPublicando] = useState(false);
  const [zonaMercado, setZonaMercado] = useState("");

  const cargar = () => {
    setLoading(true); setError(null);
    const filtroTienda = contexto === "tienda" ? `eq.${tiendaId}` : "is.null";
    sb(`carpetas?select=*,carpeta_fotos(id,imagen_url)&perfil_id=eq.${session.user.id}&tienda_id=${filtroTienda}&order=created_at.desc`, session)
      .then(setCarpetas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const crearCarpeta = async () => {
    if (!nombreNueva.trim()) return;
    setCreando(true); setError(null);
    try {
      await sbWrite("POST", "carpetas", {
        perfil_id: session.user.id,
        tienda_id: contexto === "tienda" ? tiendaId : null,
        nombre: nombreNueva.trim(),
      }, session);
      setNombreNueva("");
      cargar();
    } catch (e) { setError(e.message); } finally { setCreando(false); }
  };

  const borrarCarpeta = async (id) => {
    if (!window.confirm("¿Borrar esta carpeta y sus fotos? Las cartas ya publicadas no se borran, solo dejan de estar agrupadas.")) return;
    try { await sbWrite("DELETE", `carpetas?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const detectar = async (carpetaId, fotoUrl) => {
    setError(null);
    try {
      const res = await fetch("/api/carpetas/detectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: session.user.id, imagenUrl: fotoUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo procesar la foto.");
      const detectadas = data.cartas || [];
      if (!detectadas.length) { setError("No se detectó ninguna carta en esa foto. Intenta con una foto más clara o de más cerca."); return; }
      const filas = detectadas.map((c) => ({
        nombre: c.nombre, set: c.set || "", numero: c.numero || "",
        cargando: true, encontrada: null, incluir: true, precio: "", cantidad: "1", condicion: "NM",
      }));
      setRevision({ carpetaId, filas });
      filas.forEach((fila, idx) => {
        buscarCartaTCGdex(fila.nombre, fila.numero || null).then((encontrada) => {
          setRevision((prev) => {
            if (!prev || prev.carpetaId !== carpetaId) return prev;
            const nuevasFilas = [...prev.filas];
            if (nuevasFilas[idx]) nuevasFilas[idx] = { ...nuevasFilas[idx], cargando: false, encontrada };
            return { ...prev, filas: nuevasFilas };
          });
        });
      });
    } catch (e) { setError(e.message); }
  };

  const subirFoto = async (carpetaId, file) => {
    setSubiendoFotoPara(carpetaId); setError(null);
    try {
      const url = await subirImagenABucket("carpetas", file, session);
      await sbWrite("POST", "carpeta_fotos", { carpeta_id: carpetaId, imagen_url: url }, session);
      cargar();
      await detectar(carpetaId, url);
    } catch (e) { setError(e.message); } finally { setSubiendoFotoPara(null); }
  };

  const actualizarFila = (idx, cambios) => {
    setRevision((prev) => {
      const nuevasFilas = [...prev.filas];
      nuevasFilas[idx] = { ...nuevasFilas[idx], ...cambios };
      return { ...prev, filas: nuevasFilas };
    });
  };

  const publicarRevision = async () => {
    const validas = revision.filas.filter((f) => {
      const imagen = f.imagenManual || f.encontrada?.imagen_url;
      return f.incluir && (f.encontrada?.name || f.nombre || f.nombreManual) && Number(f.precio) > 0 && imagen;
    });
    if (!validas.length) { setError("Ponle un precio y una foto (del catálogo o subida a mano) a al menos una carta para publicarla."); return; }
    if (contexto === "mercado" && !zonaMercado.trim()) { setError("Escribe tu zona para publicar en el Mercado."); return; }
    setPublicando(true); setError(null);
    try {
      const filas = validas.map((f) => ({
        tcg: "pokemon",
        carta: f.encontrada?.name || f.nombre || f.nombreManual,
        set_nombre: f.encontrada?.set_nombre || f.set || null,
        condicion: f.condicion,
        precio: Number(f.precio),
        cantidad: Number(f.cantidad) || 1,
        card_api_id: f.encontrada?.card_api_id || null,
        imagen_url: f.imagenManual || f.encontrada?.imagen_url,
        carpeta_id: revision.carpetaId,
        ...(contexto === "tienda"
          ? { tienda_id: tiendaId, idioma: "EN" }
          : { perfil_id: session.user.id, tipo: "carta", zona: zonaMercado.trim() }),
      }));
      await sbWrite("POST", contexto === "tienda" ? "inventario_tienda" : "mercado_listings", filas, session);
      setRevision(null);
      onPublicado?.();
    } catch (e) { setError(e.message); } finally { setPublicando(false); }
  };

  if (loading) return <Loading label="Cargando tus carpetas..." />;

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-6 grid gap-3">
      <p style={{ color: COLORS.azulPalido }} className="text-sm font-semibold uppercase">📁 Carpetas</p>
      <p style={{ color: COLORS.muted }} className="text-xs -mt-2">
        Organiza tu inventario en carpetas (álbumes). Sube una foto de una página y la IA intenta identificar cada carta —
        tú revisas, le pones precio y publicas en bloque.
      </p>
      {error && <ErrorBox message={error} />}

      <div className="flex gap-2">
        <input placeholder="Nombre de la carpeta (ej. Álbum Charizards)" value={nombreNueva}
          onChange={(e) => setNombreNueva(e.target.value)} onKeyDown={(e) => e.key === "Enter" && crearCarpeta()}
          style={inputStyle} className="rounded-lg px-3 py-2 text-sm flex-1" />
        <button onClick={crearCarpeta} disabled={creando || !nombreNueva.trim()}
          style={{ background: COLORS.azul, color: COLORS.text }} className="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
          {creando ? "Creando..." : "+ Nueva carpeta"}
        </button>
      </div>

      {carpetas.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no tienes carpetas.</p>}

      <div className="grid gap-3">
        {carpetas.map((c) => (
          <div key={c.id} style={{ background: COLORS.bg, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-semibold">{c.nombre}</p>
              <div className="flex items-center gap-2">
                <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap">
                  {subiendoFotoPara === c.id ? "Procesando..." : "📷 Agregar foto"}
                  <input type="file" accept="image/*" className="hidden" disabled={subiendoFotoPara === c.id}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFoto(c.id, f); e.target.value = ""; }} />
                </label>
                <button onClick={() => borrarCarpeta(c.id)} style={{ color: "#C24444" }} className="text-xs">Borrar</button>
              </div>
            </div>
            {c.carpeta_fotos?.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {c.carpeta_fotos.map((f) => (
                  <img key={f.id} src={f.imagen_url} alt="" style={{ width: 56, height: 56, objectFit: "cover" }} className="rounded" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {revision && (
        <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.azulPalido}66` }} className="rounded-lg p-3 grid gap-3 mt-2">
          <p style={{ color: COLORS.azulPalido }} className="text-sm font-semibold">
            Revisa lo que detectamos ({revision.filas.length} carta{revision.filas.length === 1 ? "" : "s"})
          </p>
          {contexto === "mercado" && (
            <input placeholder="Tu zona (ej. Centro, San Pedro)" value={zonaMercado} onChange={(e) => setZonaMercado(e.target.value)}
              style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
          )}
          <div className="grid gap-2">
            {revision.filas.map((f, idx) => {
              const imagen = f.imagenManual || f.encontrada?.imagen_url;
              const faltaFoto = !f.cargando && !imagen;
              return (
              <div key={idx} style={{ background: COLORS.surface, border: `1px solid ${f.nombre ? COLORS.surface2 : "#C24444"}`, opacity: f.incluir && imagen ? 1 : 0.5 }}
                className="rounded-lg p-2 flex items-center gap-2 flex-wrap">
                <input type="checkbox" checked={f.incluir && !!imagen} disabled={!imagen} onChange={(e) => actualizarFila(idx, { incluir: e.target.checked })} />
                {imagen && <img src={imagen} alt="" style={{ width: 40, height: 56, objectFit: "contain" }} />}
                <div className="flex-1 min-w-[140px]">
                  {f.nombre ? (
                    <>
                      <p className="text-sm font-medium">{f.encontrada?.name || f.nombre}</p>
                      <p style={{ color: COLORS.muted }} className="text-xs">
                        {f.cargando ? "Buscando en el catálogo..." : f.encontrada?.set_nombre || f.set || ""}
                      </p>
                    </>
                  ) : (
                    <p style={{ color: "#C24444" }} className="text-xs">No se pudo leer esta carta — descártala o pon el nombre a mano abajo.</p>
                  )}
                  {!f.nombre && (
                    <input placeholder="Nombre de la carta (a mano)" value={f.nombreManual || ""} onChange={(e) => actualizarFila(idx, { nombreManual: e.target.value })}
                      style={inputStyle} className="rounded px-2 py-1 text-xs w-full mt-1" />
                  )}
                  {faltaFoto && (
                    <div className="mt-1">
                      <SubirFotoManual session={session} label="📷 Subir foto (obligatorio)"
                        onSubido={(url) => actualizarFila(idx, { imagenManual: url, incluir: true })} />
                      <p style={{ color: "#C24444" }} className="text-xs mt-0.5">Sin foto no se puede publicar esta carta.</p>
                    </div>
                  )}
                </div>
                <input type="number" placeholder="Precio" value={f.precio} onChange={(e) => actualizarFila(idx, { precio: e.target.value })}
                  style={inputStyle} className="rounded px-2 py-1 text-sm w-20" />
                <input type="number" placeholder="Cant." value={f.cantidad} onChange={(e) => actualizarFila(idx, { cantidad: e.target.value })}
                  style={inputStyle} className="rounded px-2 py-1 text-sm w-16" title="Cantidad" />
              </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={publicarRevision} disabled={publicando}
              style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold">
              {publicando ? "Publicando..." : "Publicar cartas incluidas"}
            </button>
            <button onClick={() => setRevision(null)} style={{ color: COLORS.muted }} className="text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MyStorePanel({ session, perfil, onIrAPlanes }) {
  const [tienda, setTienda] = useState(undefined); // undefined = cargando, null = no vinculada
  const [inventario, setInventario] = useState([]);
  const [sellado, setSellado] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [nuevaCarta, setNuevaCarta] = useState({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "EN", precio: "", precio_antes: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
  const [nuevoSellado, setNuevoSellado] = useState({ producto: "", precio: "", precio_antes: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
  const [selladoManual, setSelladoManual] = useState(false);
  const [savingCarta, setSavingCarta] = useState(false);
  const [savingSellado, setSavingSellado] = useState(false);

  const cargar = () => {
    setLoading(true); setError(null);
    sb(`tiendas?select=*&perfil_id=eq.${session.user.id}`, session)
      .then(async (rows) => {
        const t = rows[0] || null;
        setTienda(t);
        if (t) {
          const [inv, sel] = await Promise.all([
            sb(`inventario_tienda?select=*&tienda_id=eq.${t.id}&order=carta.asc`, session),
            sb(`sellado_tienda?select=*&tienda_id=eq.${t.id}&order=producto.asc`, session),
          ]);
          setInventario(inv);
          setSellado(sel);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const totalActivos = inventario.length + sellado.length;
  const alLimite = limiteAlcanzado(perfil, totalActivos);

  const agregarCarta = async () => {
    if (!nuevaCarta.carta || !nuevaCarta.precio) return;
    if (alLimite) { setError(`Alcanzaste el límite de ${planDe(perfil).limiteCartas} publicaciones de tu plan. Mejora a Diamante o Aurora para inventario ilimitado.`); return; }
    setSavingCarta(true);
    try {
      await sbWrite("POST", "inventario_tienda", {
        ...nuevaCarta,
        precio: Number(nuevaCarta.precio),
        precio_antes: nuevaCarta.precio_antes ? Number(nuevaCarta.precio_antes) : null,
        cantidad: Number(nuevaCarta.cantidad),
        tienda_id: tienda.id,
        card_api_id: nuevaCarta.card_api_id || null,
        imagen_url: nuevaCarta.imagen_url || null,
        precio_ref_mxn: nuevaCarta.precio_ref_mxn || null,
      }, session);
      setNuevaCarta({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "EN", precio: "", precio_antes: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
      cargar();
    } catch (e) { setError(e.message); } finally { setSavingCarta(false); }
  };

  const borrarCarta = async (id) => {
    try { await sbWrite("DELETE", `inventario_tienda?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const actualizarCarta = async (id, campo, valor) => {
    try {
      const numerico = ["precio", "cantidad"].includes(campo) ? Number(valor) : campo === "precio_antes" ? (valor ? Number(valor) : null) : valor;
      await sbWrite("PATCH", `inventario_tienda?id=eq.${id}`, { [campo]: numerico }, session);
    } catch (e) { setError(e.message); }
  };

  const agregarSellado = async () => {
    if (!nuevoSellado.producto || !nuevoSellado.precio) return;
    if (alLimite) { setError(`Alcanzaste el límite de ${planDe(perfil).limiteCartas} publicaciones de tu plan. Mejora a Diamante o Aurora para inventario ilimitado.`); return; }
    setSavingSellado(true);
    try {
      await sbWrite("POST", "sellado_tienda", {
        ...nuevoSellado,
        precio: Number(nuevoSellado.precio),
        precio_antes: nuevoSellado.precio_antes ? Number(nuevoSellado.precio_antes) : null,
        cantidad: Number(nuevoSellado.cantidad),
        tienda_id: tienda.id,
        card_api_id: nuevoSellado.card_api_id || null,
        imagen_url: nuevoSellado.imagen_url || null,
        precio_ref_mxn: nuevoSellado.precio_ref_mxn || null,
      }, session);
      setNuevoSellado({ producto: "", precio: "", precio_antes: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
      cargar();
    } catch (e) { setError(e.message); } finally { setSavingSellado(false); }
  };

  const borrarSellado = async (id) => {
    try { await sbWrite("DELETE", `sellado_tienda?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const actualizarSellado = async (id, campo, valor) => {
    try {
      const numerico = ["precio", "cantidad"].includes(campo) ? Number(valor) : campo === "precio_antes" ? (valor ? Number(valor) : null) : valor;
      await sbWrite("PATCH", `sellado_tienda?id=eq.${id}`, { [campo]: numerico }, session);
    } catch (e) { setError(e.message); }
  };

  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };

  if (loading) return <Loading label="Cargando tu tienda..." />;

  if (!tienda) {
    return (
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-6 text-center">
        <Store size={32} color={COLORS.azulPalido} className="mx-auto mb-3" />
        <p className="font-semibold mb-1">Tu cuenta todavía no está vinculada a una tienda</p>
        <p style={{ color: COLORS.muted }} className="text-sm">
          Pídele al administrador que conecte tu cuenta con tu tienda en el directorio. Necesita tu correo o el ID de tu cuenta ({session.user.id}).
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold">{tienda.nombre}</h2>
        <PlanBadge perfil={perfil} size="lg" />
      </div>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Administra tu inventario y producto sellado.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <RedesSocialesEditor session={session} perfil={perfil} onIrAPlanes={onIrAPlanes} esTienda />

      <p style={{ color: COLORS.muted }} className="text-xs mb-3">
        {totalActivos} / {planDe(perfil).limiteCartas === Infinity ? "∞" : planDe(perfil).limiteCartas} publicaciones usadas
      </p>
      {alLimite && (
        <div style={{ background: `${COLORS.azulPalido}11`, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <p style={{ color: COLORS.azulPalido }} className="text-sm">Alcanzaste el límite de tu plan. Mejora a Diamante o Aurora para inventario ilimitado.</p>
          <button onClick={onIrAPlanes} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">Ver planes</button>
        </div>
      )}

      {planDe(perfil).importadorMasivo && (
        <ImportadorMasivo session={session} tiendaId={tienda.id} onImportado={cargar} />
      )}

      {planDe(perfil).carpetas ? (
        <CarpetasPanel session={session} perfil={perfil} contexto="tienda" tiendaId={tienda.id} onPublicado={cargar} />
      ) : (
        <div className="mb-6">
          <UpsellCard requiere={PLAN_INFO.ultraball} plan="ultraball" onIrAPlanes={onIrAPlanes}>
            Sube fotos de tu álbum físico y deja que la IA identifique cada carta por ti, en vez de agregarlas una por una.
          </UpsellCard>
        </div>
      )}

      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Cartas sueltas</h3>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-4 grid gap-2 sm:grid-cols-6">
        <select value={nuevaCarta.tcg} onChange={(e) => setNuevaCarta({ ...nuevaCarta, tcg: e.target.value, carta: "", set_nombre: "", card_api_id: "", imagen_url: "" })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-1">
          <option value="pokemon">Pokémon</option><option value="yugioh">Yu-Gi-Oh!</option><option value="lorcana">Lorcana</option><option value="magic">Magic</option><option value="onepiece">One Piece</option>
        </select>

        {nuevaCarta.tcg === "pokemon" ? (
          <div className="sm:col-span-2">
            <CardPicker onSelect={(c) => setNuevaCarta({
              ...nuevaCarta,
              carta: c.name,
              set_nombre: c.set_nombre,
              card_api_id: c.card_api_id,
              imagen_url: c.imagen_url,
              precio_ref_mxn: c.precio_ref_mxn,
              precio: nuevaCarta.precio || (c.precio_ref_mxn ? String(c.precio_ref_mxn) : ""),
            })} />
            {nuevaCarta.card_api_id && (
              <div className="flex items-center gap-3 mt-2">
                {nuevaCarta.imagen_url && <img src={nuevaCarta.imagen_url} alt={nuevaCarta.carta} style={{ width: 70, height: 96, objectFit: "contain" }} />}
                <div>
                  <Badge color={COLORS.azulPalido}>{nuevaCarta.carta}</Badge>
                  {nuevaCarta.precio_ref_mxn && (
                    <p style={{ color: COLORS.azulClaro }} className="text-xs mt-1">
                      Precio de referencia en mercado: ~${nuevaCarta.precio_ref_mxn.toLocaleString("es-MX")} MXN
                    </p>
                  )}
                  <button type="button" onClick={() => setNuevaCarta({ ...nuevaCarta, carta: "", set_nombre: "", card_api_id: "", imagen_url: "", precio_ref_mxn: null })} style={{ color: COLORS.muted }} className="text-xs mt-1">Cambiar</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <input placeholder="Nombre de la carta" value={nuevaCarta.carta} onChange={(e) => setNuevaCarta({ ...nuevaCarta, carta: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-1" />
            <input placeholder="Set / número" value={nuevaCarta.set_nombre} onChange={(e) => setNuevaCarta({ ...nuevaCarta, set_nombre: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-1" />
          </>
        )}

        <input placeholder="Condición" value={nuevaCarta.condicion} onChange={(e) => setNuevaCarta({ ...nuevaCarta, condicion: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-1" />
        <input placeholder="Precio" type="number" value={nuevaCarta.precio} onChange={(e) => setNuevaCarta({ ...nuevaCarta, precio: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-1" />
        <input placeholder="Precio antes (oferta, opcional)" type="number" value={nuevaCarta.precio_antes} onChange={(e) => setNuevaCarta({ ...nuevaCarta, precio_antes: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-1" title="Si lo llenas, se muestra como oferta con el % de descuento" />
        <button onClick={agregarCarta} disabled={savingCarta || alLimite} style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: alLimite ? 0.5 : 1 }} className="rounded-lg py-2 text-sm font-semibold sm:col-span-6">
          {alLimite ? "Límite alcanzado" : savingCarta ? "Guardando..." : "+ Agregar carta"}
        </button>
      </div>
      <div className="grid gap-2 mb-8">
        {inventario.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no has agregado cartas.</p>}
        {inventario.map((item) => (
          <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
            {item.imagen_url && <img src={item.imagen_url} alt={item.carta} style={{ width: 56, height: 78, objectFit: "contain" }} />}
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{item.carta}</p>
                <BoostBadge item={item} />
              </div>
              <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} · {item.condicion}</p>
            </div>
            <input type="number" defaultValue={item.precio} onBlur={(e) => actualizarCarta(item.id, "precio", e.target.value)}
              style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio" />
            <input type="number" defaultValue={item.precio_antes || ""} onBlur={(e) => actualizarCarta(item.id, "precio_antes", e.target.value)}
              style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio antes (oferta, deja vacío para quitarla)" placeholder="Antes" />
            <input type="number" defaultValue={item.cantidad} onBlur={(e) => actualizarCarta(item.id, "cantidad", e.target.value)}
              style={inputStyle} className="rounded px-2 py-1 text-sm w-16" title="Cantidad" />
            {!item.imagen_url && <ReintentarImagen nombre={item.carta} setNombre={item.set_nombre} onEncontrada={async (url) => { await actualizarCarta(item.id, "imagen_url", url); cargar(); }} />}
            <SubirFotoManual session={session} label={item.imagen_url ? "Cambiar foto" : "📷 Sin foto"} onSubido={async (url) => { await actualizarCarta(item.id, "imagen_url", url); cargar(); }} />
            <BoostButton session={session} tabla="inventario_tienda" item={item} onBoosted={cargar} />
            <button onClick={() => borrarCarta(item.id)} style={{ color: COLORS.azulPalido }} className="text-xs px-2">Borrar</button>
          </div>
        ))}
      </div>

      <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Producto sellado</h3>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-4 grid gap-2">
        {!selladoManual ? (
          <>
            <SealedPicker onSelect={(p) => setNuevoSellado({
              ...nuevoSellado,
              producto: p.producto,
              imagen_url: p.imagen_url,
              card_api_id: p.card_api_id,
              precio_ref_mxn: p.precio_ref_mxn,
              precio: nuevoSellado.precio || (p.precio_ref_mxn ? String(p.precio_ref_mxn) : ""),
            })} />
            {nuevoSellado.card_api_id && (
              <div className="flex items-center gap-3">
                {nuevoSellado.imagen_url && <img src={nuevoSellado.imagen_url} alt={nuevoSellado.producto} style={{ width: 60, height: 84, objectFit: "contain" }} />}
                <div>
                  <Badge color={COLORS.azulClaro}>{nuevoSellado.producto}</Badge>
                  {nuevoSellado.precio_ref_mxn && (
                    <p style={{ color: COLORS.azulPalido }} className="text-xs mt-1">Precio de referencia: ~${nuevoSellado.precio_ref_mxn.toLocaleString("es-MX")} MXN</p>
                  )}
                  <button type="button" onClick={() => setNuevoSellado({ ...nuevoSellado, producto: "", imagen_url: "", card_api_id: "", precio_ref_mxn: null })} style={{ color: COLORS.muted }} className="text-xs mt-1">Cambiar</button>
                </div>
              </div>
            )}
            <button type="button" onClick={() => setSelladoManual(true)} style={{ color: COLORS.muted }} className="text-xs text-left">
              ¿No lo encuentras? Escribirlo manualmente
            </button>
          </>
        ) : (
          <>
            <input placeholder="Nombre del producto" value={nuevoSellado.producto} onChange={(e) => setNuevoSellado({ ...nuevoSellado, producto: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
            <button type="button" onClick={() => setSelladoManual(false)} style={{ color: COLORS.muted }} className="text-xs text-left">
              ← Volver a buscar en el catálogo oficial
            </button>
          </>
        )}
        <div className="grid sm:grid-cols-3 gap-2">
          <input placeholder="Precio" type="number" value={nuevoSellado.precio} onChange={(e) => setNuevoSellado({ ...nuevoSellado, precio: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <input placeholder="Precio antes (oferta, opcional)" type="number" value={nuevoSellado.precio_antes} onChange={(e) => setNuevoSellado({ ...nuevoSellado, precio_antes: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <button onClick={agregarSellado} disabled={savingSellado || alLimite} style={{ background: COLORS.azulClaro, color: COLORS.bg, opacity: alLimite ? 0.5 : 1 }} className="rounded-lg py-2 text-sm font-semibold">
            {alLimite ? "Límite alcanzado" : savingSellado ? "Guardando..." : "+ Agregar"}
          </button>
        </div>
      </div>
      <div className="grid gap-2">
        {sellado.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no has agregado producto sellado.</p>}
        {sellado.map((item) => (
          <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
            {item.imagen_url && <img src={item.imagen_url} alt={item.producto} style={{ width: 44, height: 62, objectFit: "contain" }} />}
            <div className="flex-1 min-w-[140px] flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{item.producto}</p>
              <BoostBadge item={item} />
            </div>
            <input type="number" defaultValue={item.precio} onBlur={(e) => actualizarSellado(item.id, "precio", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" />
            <input type="number" defaultValue={item.precio_antes || ""} onBlur={(e) => actualizarSellado(item.id, "precio_antes", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio antes (oferta, deja vacío para quitarla)" placeholder="Antes" />
            <input type="number" defaultValue={item.cantidad} onBlur={(e) => actualizarSellado(item.id, "cantidad", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-16" />
            <SubirFotoManual session={session} label={item.imagen_url ? "Cambiar foto" : "📷 Sin foto"} onSubido={async (url) => { await actualizarSellado(item.id, "imagen_url", url); cargar(); }} />
            <BoostButton session={session} tabla="sellado_tienda" item={item} onBoosted={cargar} />
            <button onClick={() => borrarSellado(item.id)} style={{ color: COLORS.azulPalido }} className="text-xs px-2">Borrar</button>
          </div>
        ))}
      </div>

      <ProponerAnuncio session={session} tiendaId={tienda.id} />
      <CrearTorneo session={session} tiendaId={tienda.id} />
    </div>
  );
}

const ESTADO_ANUNCIO_INFO = {
  pendiente: { label: "Esperando aprobación", color: "#CCA43B" },
  publicado: { label: "Publicado", color: "#3BA45C" },
  programado: { label: "Programado", color: "#4F7FD1" },
  rechazado: { label: "Rechazado", color: "#C24444" },
};

function ProponerAnuncio({ session, tiendaId }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [imagen, setImagen] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [misAnuncios, setMisAnuncios] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = () => {
    setLoading(true);
    sb(`noticias?select=*&tienda_id=eq.${tiendaId}&order=created_at.desc`, session)
      .then(setMisAnuncios)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const enviar = async () => {
    if (!titulo.trim() || !contenido.trim()) return;
    setEnviando(true); setError(null);
    try {
      const imagen_url = imagen ? await subirImagenAnuncio(imagen, session) : null;
      await sbWrite("POST", "noticias", {
        tipo: "anuncio",
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        imagen_url,
        tienda_id: tiendaId,
        creado_por: session.user.id,
        estado: "pendiente",
        publicado: false,
      }, session);
      setTitulo(""); setContenido(""); setImagen(null); setImagenPreview(null);
      cargar();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div className="mt-10">
      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">📢 Proponer un anuncio</h3>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-4 grid gap-2">
        <p style={{ color: COLORS.muted }} className="text-xs">
          Tu anuncio se lo manda al administrador para revisión. En cuanto lo apruebe, se publica con el nombre y la foto de tu tienda.
        </p>
        {error && <ErrorBox message={error} />}
        <input placeholder="Título del anuncio" value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
        <textarea placeholder="Contenido del anuncio" rows={3} value={contenido} onChange={(e) => setContenido(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          {imagenPreview && <img src={imagenPreview} alt="" style={{ width: 70, height: 70, objectFit: "cover" }} className="rounded-lg" />}
          <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer">
            {imagenPreview ? "Cambiar imagen" : "+ Agregar imagen (opcional)"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImagen(file);
              setImagenPreview(URL.createObjectURL(file));
            }} />
          </label>
          {imagenPreview && (
            <button type="button" onClick={() => { setImagen(null); setImagenPreview(null); }} style={{ color: COLORS.muted }} className="text-xs">Quitar</button>
          )}
        </div>
        <button onClick={enviar} disabled={enviando || !titulo.trim() || !contenido.trim()}
          style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold">
          {enviando ? "Enviando..." : "Enviar para aprobación"}
        </button>
      </div>

      {!loading && misAnuncios.length > 0 && (
        <div className="grid gap-2">
          {misAnuncios.map((n) => {
            const info = ESTADO_ANUNCIO_INFO[n.estado] || ESTADO_ANUNCIO_INFO.pendiente;
            return (
              <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex gap-3">
                {n.imagen_url && <img src={n.imagen_url} alt="" style={{ width: 56, height: 56, objectFit: "cover" }} className="rounded-lg shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium text-sm">{n.titulo}</p>
                    <Badge color={info.color}>{info.label}</Badge>
                  </div>
                  <p style={{ color: COLORS.muted }} className="text-xs mt-1">{n.contenido}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeccionAyuda({ titulo, children }) {
  return (
    <details style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 group">
      <summary style={{ color: COLORS.azulPalido }} className="font-semibold cursor-pointer list-none flex items-center justify-between">
        {titulo}
        <span className="text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div style={{ color: COLORS.muted }} className="text-sm mt-3 grid gap-2">{children}</div>
    </details>
  );
}

function AyudaView({ perfil }) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">❓ Ayuda / Tutorial</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Un repaso rápido de todo lo que puedes hacer en Encuentra Cartas.</p>

      <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Primeros pasos</h3>
      <div className="grid gap-3 mb-8">
        <SeccionAyuda titulo="🔍 Buscar una carta o producto">
          <p>Ve a "Buscar" y escribe el nombre. Te muestra lo que hay en tiendas registradas y lo que otros usuarios están vendiendo en el Mercado.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="🏪 Directorio de tiendas">
          <p>Explora las tiendas de Monterrey, con su ubicación en el mapa, plan/insignia y si están verificadas.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="🛍️ Mercado">
          <p>Aquí aparece todo lo que venden cuentas individuales (no tiendas). Cualquiera puede publicar una carta o producto sellado.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="💬 Contactar a un vendedor">
          <p>Dale click a "Contactar" en cualquier resultado — se abre un chat directo dentro de la app, y si el vendedor puso WhatsApp o Facebook, también puedes seguir la conversación ahí.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="🔔 Notificaciones">
          <p>La campanita del encabezado avisa cuando aparece algo de tu Wishlist, se publica un anuncio, o te llega un mensaje. También puedes activar notificaciones push del navegador desde "Wishlist" para recibir el aviso aunque no tengas la app abierta.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="📅 Torneos">
          <p>En "Torneos" ves el calendario de eventos que publican las tiendas. Dale "Me interesa" al que quieras — te avisamos por correo, push y en tu campanita unos días antes.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="⚪🔵🟣🟡🔴 Planes / rangos">
          <p>Cuarzo es gratis. Los planes pagados (Zafiro/Amatista/Diamante/Aurora) desbloquean insignia de verificado, Wishlist Premium, más publicaciones y beneficios exclusivos. Se renuevan solos cada mes hasta que los canceles.</p>
        </SeccionAyuda>
      </div>

      {perfil?.tipo !== "tienda" && (
        <>
          <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Para compradores y coleccionistas</h3>
          <div className="grid gap-3 mb-8">
            <SeccionAyuda titulo="⭐ Vender en el Mercado">
              <p>Si tu cuenta es individual, tienes la pestaña "Vender en el Mercado" para publicar tus propias cartas o producto sellado.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="❤️ Wishlist Premium">
              <p>Con plan Amatista o superior, crea alertas de las cartas que buscas (con precio máximo y, si quieres, zona). En cuanto alguien la publique, te avisamos por push y por correo.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="🚀 Destacar tu publicación (Boost)">
              <p>Paga para que tu carta o producto aparezca primero en resultados y en el Mercado durante 3 o 7 días.</p>
            </SeccionAyuda>
          </div>
        </>
      )}

      {perfil?.tipo === "tienda" && (
        <>
          <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Para tiendas</h3>
          <div className="grid gap-3 mb-8">
            <SeccionAyuda titulo="🔗 Vincular tu cuenta con tu tienda">
              <p>Si "Mi tienda" te dice que tu cuenta no está vinculada, pide al administrador que la conecte con tu tienda del directorio (necesita tu correo o ID de cuenta, que aparece ahí mismo).</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="📦 Agregar inventario">
              <p>Desde "Mi tienda" agrega cartas sueltas o producto sellado uno por uno, con precio, condición y cantidad.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="📊 Importador masivo (Aurora)">
              <p>Con plan Aurora puedes pegar una lista de texto o subir un Excel/CSV para cargar muchas cartas de golpe.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="🚀 Destacar publicaciones (Boost)">
              <p>Igual que las cuentas individuales, puedes pagar para que una publicación aparezca primero por 3 o 7 días.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="📢 Proponer un anuncio">
              <p>Desde "Mi tienda" puedes proponer un anuncio — el administrador lo revisa y, si lo aprueba, se publica con el nombre y la foto de tu tienda.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="📅 Publicar un torneo">
              <p>También desde "Mi tienda" puedes publicar tus torneos o eventos (fecha, dirección, costo) — aparecen en el calendario de "Torneos" para que los usuarios marquen su interés.</p>
            </SeccionAyuda>
            <SeccionAyuda titulo="✓ Insignia de verificado">
              <p>Disponible desde Zafiro en adelante — le da más confianza a quien te contacta.</p>
            </SeccionAyuda>
          </div>
        </>
      )}

      <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Tu cuenta</h3>
      <div className="grid gap-3">
        <SeccionAyuda titulo="🧑 Editar perfil">
          <p>Cambia tu nombre, foto (subida o de Pokémon), WhatsApp, Facebook, Instagram y ubicación de Google Maps desde el menú de tu cuenta.</p>
        </SeccionAyuda>
        <SeccionAyuda titulo="💳 Mis pagos">
          <p>Ahí ves el historial de tus suscripciones de plan y publicaciones destacadas, con fecha, monto y si se aprobó, quedó pendiente o se rechazó.</p>
        </SeccionAyuda>
      </div>
    </div>
  );
}

const JUEGOS_TORNEO = {
  pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!", lorcana: "Lorcana", magic: "Magic", onepiece: "One Piece", otro: "Otro",
};

function PerfilPublicoView({ perfilId, session, onVolver, onAbrirChat, onVerTienda }) {
  const [perfil, setPerfil] = useState(undefined); // undefined = cargando, null = no existe
  const [cartas, setCartas] = useState([]);
  const [sellado, setSellado] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    setPerfil(undefined); setCartas([]); setSellado([]); setTienda(null); setWishlist([]); setCarpetas([]);
    sb(`perfiles?select=*&id=eq.${perfilId}`)
      .then(async (rows) => {
        const p = rows[0] || null;
        setPerfil(p);
        if (!p) return;
        const vis = p.visibilidad || {};
        const tareas = [];
        if (p.tipo === "individual" && vis.publicaciones !== false) {
          tareas.push(
            sb(`mercado_listings?select=*&perfil_id=eq.${perfilId}&order=created_at.desc`).then((filas) => {
              setCartas(filas.filter((f) => f.tipo !== "sellado"));
              setSellado(filas.filter((f) => f.tipo === "sellado"));
            })
          );
        }
        if (p.tipo === "tienda") {
          tareas.push(sb(`tiendas?select=id,nombre,zona&perfil_id=eq.${perfilId}`).then((filas) => setTienda(filas[0] || null)));
        }
        if (vis.wishlist !== false) {
          tareas.push(sb(`alertas?select=*&perfil_id=eq.${perfilId}&order=created_at.desc`).then(setWishlist));
        }
        if (vis.carpetas !== false) {
          tareas.push(sb(`carpetas?select=*,carpeta_fotos(id,imagen_url)&perfil_id=eq.${perfilId}&order=created_at.desc`).then(setCarpetas));
        }
        await Promise.all(tareas);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [perfilId]);

  if (loading) return <Loading label="Cargando perfil..." />;
  if (!perfil) return (
    <div>
      <button onClick={onVolver} style={{ color: COLORS.muted }} className="flex items-center gap-1 text-sm mb-6"><ChevronLeft size={16} /> Volver</button>
      <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">Este perfil no existe.</p>
    </div>
  );

  const vis = perfil.visibilidad || {};
  const favoritos = perfil.pokemon_favoritos || [];

  return (
    <div>
      <button onClick={onVolver} style={{ color: COLORS.muted }} className="flex items-center gap-1 text-sm mb-6"><ChevronLeft size={16} /> Volver</button>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <HoloAvatar perfil={perfil} ringSize={62}>
            <AvatarImg url={perfil.avatar_url} size={56} />
          </HoloAvatar>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold">{perfil.nombre}</h2>
              <PlanBadge perfil={perfil} />
              <VerificadoBadge perfil={perfil} />
            </div>
            {tienda?.zona && <p style={{ color: COLORS.muted }} className="text-sm">{tienda.zona}</p>}
          </div>
          {session && session.user.id !== perfilId && (
            <button
              onClick={() => onAbrirChat(perfilId, perfil.nombre, "Perfil", perfil.whatsapp, perfil.facebook, perfil.avatar_url)}
              style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
              className="ml-auto text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap">
              <MessageCircle size={12} /> Contactar
            </button>
          )}
        </div>

        <div className="mt-3"><DiamanteEmblema perfil={perfil} /></div>

        {vis.favoritos !== false && favoritos.length > 0 && (
          <div className="mt-4">
            <p style={{ color: COLORS.azulPalido }} className="text-xs font-semibold uppercase mb-2">Pokémon favoritos</p>
            <div className="flex gap-4">
              {favoritos.map((f) => (
                <div key={f} className="flex flex-col items-center gap-1">
                  <PokemonFavSprite name={f} size={48} />
                  <p style={{ color: COLORS.muted }} className="text-xs capitalize">{f}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {perfil.tipo === "individual" && (perfil.instagram || perfil.whatsapp || perfil.facebook) && (
          <div className="flex gap-2 mt-4 flex-wrap">
            {perfil.instagram && (
              <a href={perfil.instagram} target="_blank" rel="noreferrer"
                style={{ border: `1px solid ${COLORS.azulMedio}88`, color: COLORS.azulMedio }} className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                Instagram <ExternalLink size={12} />
              </a>
            )}
            {perfil.whatsapp && (
              <a href={`https://wa.me/${perfil.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                style={{ border: "1px solid #25D36688", color: "#25D366" }} className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                WhatsApp <ExternalLink size={12} />
              </a>
            )}
            {perfil.facebook && (
              <a href={perfil.facebook} target="_blank" rel="noreferrer"
                style={{ border: `1px solid ${COLORS.azulClaro}88`, color: COLORS.azulClaro }} className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                Facebook <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {tienda && (
          <button onClick={() => onVerTienda(tienda.id)} style={{ color: COLORS.azulClaro, border: `1px solid ${COLORS.azulClaro}55` }} className="mt-4 text-xs px-3 py-1.5 rounded-lg">
            Ver tienda completa →
          </button>
        )}
      </div>

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {perfil.tipo === "individual" && vis.publicaciones !== false && (cartas.length > 0 || sellado.length > 0) && (
        <div className="mb-8">
          <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">En venta</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...cartas, ...sellado].map((r) => (
              <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(r) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-xl overflow-hidden flex flex-col">
                <div style={{ background: COLORS.surface2 }} className="aspect-[4/5] flex items-center justify-center p-2">
                  {r.imagen_url ? <img src={r.imagen_url} alt={r.carta} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <Package size={28} color={COLORS.muted} />}
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-1 flex-wrap mb-1">
                    {r.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}
                    <BoostBadge item={r} />
                  </div>
                  <p className="text-xs font-semibold line-clamp-2">{r.carta}</p>
                  <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vis.wishlist !== false && wishlist.length > 0 && (
        <div className="mb-8">
          <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Wishlist</h3>
          <div className="grid gap-2">
            {wishlist.map((a) => (
              <div key={a.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3">
                {a.imagen_url && <img src={a.imagen_url} alt={a.carta} style={{ width: 40, height: 56, objectFit: "contain" }} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{a.carta}</p>
                  {a.precio_max && <p style={{ color: COLORS.muted }} className="text-xs">Hasta ${Number(a.precio_max).toLocaleString("es-MX")}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vis.carpetas !== false && carpetas.length > 0 && (
        <div>
          <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">📁 Carpetas</h3>
          <div className="grid gap-3">
            {carpetas.map((c) => (
              <div key={c.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3">
                <p className="text-sm font-semibold mb-2">{c.nombre}</p>
                {c.carpeta_fotos?.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {c.carpeta_fotos.map((f) => <img key={f.id} src={f.imagen_url} alt="" style={{ width: 56, height: 56, objectFit: "cover" }} className="rounded" />)}
                  </div>
                ) : (
                  <p style={{ color: COLORS.muted }} className="text-xs">Sin fotos todavía.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TorneosView({ session, onRequireLogin }) {
  const [torneos, setTorneos] = useState([]);
  const [interesados, setInteresados] = useState(new Set());
  const [conteos, setConteos] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marcando, setMarcando] = useState(null);

  const cargar = () => {
    setLoading(true); setError(null);
    const ahora = new Date().toISOString();
    Promise.all([
      sb(`torneos?select=*,tiendas(nombre,direccion,lat,lng,perfiles(avatar_url))&fecha=gte.${ahora}&order=fecha.asc`, session),
      sb(`torneo_interes?select=torneo_id`, session),
      session ? sb(`torneo_interes?select=torneo_id&perfil_id=eq.${session.user.id}`, session) : Promise.resolve([]),
    ])
      .then(([t, todos, mios]) => {
        setTorneos(t);
        const c = {};
        (todos || []).forEach((i) => { c[i.torneo_id] = (c[i.torneo_id] || 0) + 1; });
        setConteos(c);
        setInteresados(new Set((mios || []).map((i) => i.torneo_id)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [session?.user?.id]);

  const toggleInteres = async (torneoId) => {
    if (!session) { onRequireLogin(); return; }
    setMarcando(torneoId);
    const interesado = interesados.has(torneoId);
    try {
      if (interesado) {
        await sbWrite("DELETE", `torneo_interes?torneo_id=eq.${torneoId}&perfil_id=eq.${session.user.id}`, {}, session);
        setInteresados((prev) => { const s = new Set(prev); s.delete(torneoId); return s; });
        setConteos((prev) => ({ ...prev, [torneoId]: Math.max(0, (prev[torneoId] || 1) - 1) }));
      } else {
        await sbWrite("POST", "torneo_interes", { torneo_id: torneoId, perfil_id: session.user.id }, session);
        setInteresados((prev) => new Set(prev).add(torneoId));
        setConteos((prev) => ({ ...prev, [torneoId]: (prev[torneoId] || 0) + 1 }));
      }
    } catch {} finally { setMarcando(null); }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">📅 Calendario de torneos</h2>
      {loading && <Loading label="Cargando torneos..." />}
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {!loading && !error && torneos.length === 0 && (
        <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
          Todavía no hay torneos programados. Las tiendas los publican desde "Mi tienda".
        </p>
      )}
      <div className="grid gap-4">
        {torneos.map((t) => {
          const interesado = interesados.has(t.id);
          return (
            <div key={t.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-5">
              {t.imagen_url && <img src={t.imagen_url} alt="" style={{ maxHeight: 200, objectFit: "cover" }} className="rounded-lg mb-3 w-full" />}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <AvatarImg url={t.tiendas?.perfiles?.avatar_url} size={22} />
                <p style={{ color: COLORS.muted }} className="text-xs font-semibold">{t.tiendas?.nombre}</p>
                {t.juego && <Badge color={COLORS.azulMedio}>{JUEGOS_TORNEO[t.juego] || t.juego}</Badge>}
              </div>
              <p className="font-semibold text-lg">{t.nombre}</p>
              <p style={{ color: COLORS.azulPalido }} className="text-sm mt-1 font-semibold">
                {new Date(t.fecha).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}
              </p>
              {t.descripcion && <p style={{ color: COLORS.muted }} className="text-sm mt-2">{t.descripcion}</p>}
              {(t.direccion || t.tiendas?.direccion) && (
                <p style={{ color: COLORS.muted }} className="text-xs mt-2 flex items-center gap-1"><MapPin size={12} /> {t.direccion || t.tiendas?.direccion}</p>
              )}
              {t.costo != null && <p style={{ color: COLORS.muted }} className="text-xs mt-1">Costo: ${Number(t.costo).toLocaleString("es-MX")} MXN</p>}
              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => toggleInteres(t.id)} disabled={marcando === t.id}
                  style={{ background: interesado ? COLORS.azulPalido : "transparent", border: `1px solid ${COLORS.azul}66`, color: interesado ? COLORS.bg : COLORS.azulPalido }}
                  className="rounded-lg px-4 py-1.5 text-xs font-semibold">
                  {interesado ? "✓ Me interesa" : "Me interesa"}
                </button>
                <p style={{ color: COLORS.muted }} className="text-xs">{conteos[t.id] || 0} interesado(s)</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DIAS_SEMANA_CORTOS = ["D", "L", "M", "M", "J", "V", "S"];

function CalendarioPicker({ value, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const seleccionada = value ? new Date(value + "T00:00:00") : null;
  const [mesVisible, setMesVisible] = useState(seleccionada || hoy);

  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const primerDiaSemana = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [...Array(primerDiaSemana).fill(null), ...Array(diasEnMes).keys()].map((d) => (d === null ? null : d + 1));

  const elegir = (d) => {
    const fecha = new Date(anio, mes, d);
    const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
    onChange(iso);
    setAbierto(false);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)}
        style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }}
        className="rounded-lg px-3 py-2 text-sm w-full text-left flex items-center gap-2">
        <Calendar size={14} color={COLORS.muted} />
        {seleccionada ? seleccionada.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Elegir fecha"}
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66`, boxShadow: `0 0 24px ${COLORS.azulMedio}33` }}
            className="absolute z-40 mt-1 rounded-xl p-3 w-64">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setMesVisible(new Date(anio, mes - 1, 1))} style={{ color: COLORS.azulPalido }} className="px-2">‹</button>
              <p className="text-sm font-semibold capitalize">{mesVisible.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}</p>
              <button type="button" onClick={() => setMesVisible(new Date(anio, mes + 1, 1))} style={{ color: COLORS.azulPalido }} className="px-2">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {DIAS_SEMANA_CORTOS.map((d, i) => <p key={i} style={{ color: COLORS.muted }} className="text-[10px]">{d}</p>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d, i) => {
                if (d === null) return <div key={i} />;
                const fechaDia = new Date(anio, mes, d);
                const esSeleccionado = seleccionada && fechaDia.getTime() === seleccionada.getTime();
                const esPasado = fechaDia < hoy;
                return (
                  <button key={i} type="button" disabled={esPasado} onClick={() => elegir(d)}
                    style={{
                      background: esSeleccionado ? COLORS.azulPalido : "transparent",
                      color: esSeleccionado ? COLORS.bg : esPasado ? COLORS.muted : COLORS.text,
                      opacity: esPasado ? 0.35 : 1,
                    }}
                    className="rounded-lg py-1.5 text-xs">
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CrearTorneo({ session, tiendaId }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [juego, setJuego] = useState("pokemon");
  const [fechaDia, setFechaDia] = useState("");
  const [fechaHora, setFechaHora] = useState("");
  const [direccion, setDireccion] = useState("");
  const [costo, setCosto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [misTorneos, setMisTorneos] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = () => {
    setLoading(true);
    sb(`torneos?select=*&tienda_id=eq.${tiendaId}&order=fecha.desc`, session)
      .then(setMisTorneos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!nombre.trim() || !fechaDia || !fechaHora) return;
    setEnviando(true); setError(null);
    try {
      await sbWrite("POST", "torneos", {
        tienda_id: tiendaId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        juego,
        fecha: new Date(`${fechaDia}T${fechaHora}`).toISOString(),
        direccion: direccion.trim() || null,
        costo: costo ? Number(costo) : null,
      }, session);
      setNombre(""); setDescripcion(""); setFechaDia(""); setFechaHora(""); setDireccion(""); setCosto("");
      cargar();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };

  const borrar = async (id) => {
    try { await sbWrite("DELETE", `torneos?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="mt-10">
      <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">📅 Publicar un torneo</h3>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-4 grid gap-2">
        {error && <ErrorBox message={error} />}
        <input placeholder="Nombre del torneo" value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
        <textarea placeholder="Descripción (formato, premios, etc.)" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
        <div className="grid sm:grid-cols-2 gap-2">
          <select value={juego} onChange={(e) => setJuego(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm">
            {Object.entries(JUEGOS_TORNEO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <CalendarioPicker value={fechaDia} onChange={setFechaDia} />
            <input type="time" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input placeholder="Dirección (si es distinta a la de tu tienda)" value={direccion} onChange={(e) => setDireccion(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <input type="number" placeholder="Costo de inscripción (opcional)" value={costo} onChange={(e) => setCosto(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
        </div>
        <button onClick={crear} disabled={enviando || !nombre.trim() || !fechaDia || !fechaHora}
          style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold">
          {enviando ? "Publicando..." : "Publicar torneo"}
        </button>
      </div>

      {!loading && misTorneos.length > 0 && (
        <div className="grid gap-2">
          {misTorneos.map((t) => (
            <div key={t.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="font-medium text-sm">{t.nombre}</p>
                <p style={{ color: COLORS.muted }} className="text-xs">{new Date(t.fecha).toLocaleString("es-MX")}</p>
              </div>
              <button onClick={() => borrar(t.id)} style={{ color: COLORS.azulPalido }} className="text-xs px-2">Borrar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UpsellCard({ requiere, plan, children, onIrAPlanes }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${requiere.color}66` }} className="rounded-xl p-6 text-center">
      <p className="mb-2">
        <RankIcon plan={plan} emoji={requiere.emoji} size={20} /> Esta función es de <span style={{ color: requiere.color }} className="font-semibold">{requiere.nombre}</span> en adelante.
      </p>
      {children && <p style={{ color: COLORS.muted }} className="text-sm mb-4">{children}</p>}
      <button onClick={onIrAPlanes} style={{ background: requiere.color, color: textoSobre(requiere.color) }} className="rounded-lg px-4 py-2 text-sm font-semibold">
        Ver planes
      </button>
    </div>
  );
}

function AlertasPanel({ session, perfil, onIrAPlanes }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const info = planDe(perfil);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activandoPush, setActivandoPush] = useState(false);
  const [pushOk, setPushOk] = useState(false);
  const [tipo, setTipo] = useState("carta"); // carta | sellado
  const vacio = { tcg: "pokemon", carta: "", precio_max: "", zona: "", card_api_id: "", imagen_url: "", precio_ref_mxn: null };
  const [nueva, setNueva] = useState(vacio);

  const cargar = () => {
    setLoading(true); setError(null);
    sb(`alertas?select=*&perfil_id=eq.${session.user.id}&order=created_at.desc`, session)
      .then(setAlertas)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (info.wishlistPremium) cargar(); }, []);

  if (!info.wishlistPremium) {
    return (
      <div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">Wishlist Premium</h2>
        <UpsellCard requiere={PLAN_INFO.ultraball} plan="ultraball" onIrAPlanes={onIrAPlanes}>
          Configura alertas como "avísame si sale Charizard a menos de $500" y recibe una notificación push apenas alguien lo publique.
        </UpsellCard>
      </div>
    );
  }

  const agregar = async () => {
    if (!nueva.carta.trim()) return;
    setSaving(true);
    try {
      await sbWrite("POST", "alertas", {
        perfil_id: session.user.id,
        tipo,
        tcg: nueva.tcg,
        carta: nueva.carta.trim(),
        precio_max: nueva.precio_max ? Number(nueva.precio_max) : null,
        zona: nueva.zona || null,
        card_api_id: nueva.card_api_id || null,
        imagen_url: nueva.imagen_url || null,
        precio_ref_mxn: nueva.precio_ref_mxn || null,
      }, session);
      setNueva(vacio);
      cargar();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const borrar = async (id) => {
    try { await sbWrite("DELETE", `alertas?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const toggle = async (id, activa) => {
    try { await sbWrite("PATCH", `alertas?id=eq.${id}`, { activa: !activa }, session); cargar(); } catch (e) { setError(e.message); }
  };

  const handleActivarPush = async () => {
    setActivandoPush(true); setError(null);
    try { await activarPush(session); setPushOk(true); }
    catch (e) { setError(e.message); }
    finally { setActivandoPush(false); }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Wishlist Premium</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Te avisamos apenas alguien publique lo que buscas.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {!pushOk && (
        <div style={{ background: `${COLORS.azulMedio}11`, border: `1px solid ${COLORS.azulMedio}55` }} className="rounded-xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm">Activa las notificaciones push en este navegador para recibir tus alertas.</p>
          <button onClick={handleActivarPush} disabled={activandoPush} style={{ background: COLORS.azulMedio, color: COLORS.text }} className="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
            {activandoPush ? "Activando..." : "Activar notificaciones"}
          </button>
        </div>
      )}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-6 grid gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => { setTipo("carta"); setNueva(vacio); }}
            style={{ background: tipo === "carta" ? COLORS.surface2 : "transparent", border: `1px solid ${tipo === "carta" ? COLORS.azulPalido : COLORS.surface2}`, color: tipo === "carta" ? COLORS.azulPalido : COLORS.muted }}
            className="px-3 py-1.5 rounded-full text-sm font-semibold">Carta suelta</button>
          <button type="button" onClick={() => { setTipo("sellado"); setNueva(vacio); }}
            style={{ background: tipo === "sellado" ? COLORS.surface2 : "transparent", border: `1px solid ${tipo === "sellado" ? COLORS.azulClaro : COLORS.surface2}`, color: tipo === "sellado" ? COLORS.azulClaro : COLORS.muted }}
            className="px-3 py-1.5 rounded-full text-sm font-semibold">Producto sellado</button>
        </div>

        {tipo === "carta" ? (
          <>
            <select value={nueva.tcg} onChange={(e) => setNueva({ ...nueva, tcg: e.target.value, carta: "", card_api_id: "", imagen_url: "", precio_ref_mxn: null })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm">
              <option value="pokemon">Pokémon</option><option value="yugioh">Yu-Gi-Oh!</option><option value="lorcana">Lorcana</option><option value="magic">Magic</option><option value="onepiece">One Piece</option>
            </select>
            {nueva.tcg === "pokemon" ? (
              <div>
                <CardPicker onSelect={(c) => setNueva({ ...nueva, carta: c.name, card_api_id: c.card_api_id, imagen_url: c.imagen_url, precio_ref_mxn: c.precio_ref_mxn, precio_max: nueva.precio_max || (c.precio_ref_mxn ? String(c.precio_ref_mxn) : "") })} />
                {nueva.card_api_id && (
                  <div className="flex items-center gap-3 mt-2">
                    {nueva.imagen_url && <img src={nueva.imagen_url} alt={nueva.carta} style={{ width: 60, height: 84, objectFit: "contain" }} />}
                    <div>
                      <Badge color={COLORS.azulPalido}>{nueva.carta}</Badge>
                      {nueva.precio_ref_mxn && <p style={{ color: COLORS.azulClaro }} className="text-xs mt-1">Precio de referencia: ~${nueva.precio_ref_mxn.toLocaleString("es-MX")} MXN</p>}
                      <button type="button" onClick={() => setNueva({ ...nueva, carta: "", card_api_id: "", imagen_url: "", precio_ref_mxn: null })} style={{ color: COLORS.muted }} className="text-xs mt-1">Cambiar</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <input placeholder="Nombre de la carta" value={nueva.carta} onChange={(e) => setNueva({ ...nueva, carta: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
            )}
          </>
        ) : (
          <div>
            <SealedPicker onSelect={(p) => setNueva({ ...nueva, carta: p.producto, imagen_url: p.imagen_url, card_api_id: p.card_api_id, precio_ref_mxn: p.precio_ref_mxn, precio_max: nueva.precio_max || (p.precio_ref_mxn ? String(p.precio_ref_mxn) : "") })} />
            {nueva.card_api_id && (
              <div className="flex items-center gap-3 mt-2">
                {nueva.imagen_url && <img src={nueva.imagen_url} alt={nueva.carta} style={{ width: 60, height: 84, objectFit: "contain" }} />}
                <div>
                  <Badge color={COLORS.azulClaro}>{nueva.carta}</Badge>
                  {nueva.precio_ref_mxn && <p style={{ color: COLORS.azulPalido }} className="text-xs mt-1">Precio de referencia: ~${nueva.precio_ref_mxn.toLocaleString("es-MX")} MXN</p>}
                  <button type="button" onClick={() => setNueva({ ...nueva, carta: "", card_api_id: "", imagen_url: "", precio_ref_mxn: null })} style={{ color: COLORS.muted }} className="text-xs mt-1">Cambiar</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-2">
          <input placeholder="Precio máximo (MXN)" type="number" value={nueva.precio_max} onChange={(e) => setNueva({ ...nueva, precio_max: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
          <input placeholder="Zona (opcional)" value={nueva.zona} onChange={(e) => setNueva({ ...nueva, zona: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
        </div>
        <button onClick={agregar} disabled={saving || !nueva.carta.trim()} style={{ background: COLORS.azulMedio, color: COLORS.text, opacity: !nueva.carta.trim() ? 0.5 : 1 }} className="rounded-lg py-2 text-sm font-semibold">
          {saving ? "Guardando..." : "+ Crear alerta"}
        </button>
      </div>

      {loading ? <Loading label="Cargando tus alertas..." /> : (
        <div className="grid gap-2">
          {alertas.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no tienes alertas configuradas.</p>}
          {alertas.map((a) => (
            <div key={a.id} style={{ background: COLORS.surface, border: `1px solid ${a.activa ? COLORS.azulMedio + "66" : COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
              {a.imagen_url && <img src={a.imagen_url} alt={a.carta} style={{ width: 44, height: 62, objectFit: "contain" }} />}
              <div className="flex-1 min-w-[140px]">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{a.carta}</p>
                  {a.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}
                </div>
                <p style={{ color: COLORS.muted }} className="text-xs">
                  {a.precio_max ? `hasta $${Number(a.precio_max).toLocaleString("es-MX")} MXN` : "cualquier precio"} {a.zona ? `· ${a.zona}` : ""}
                </p>
              </div>
              <button onClick={() => toggle(a.id, a.activa)} style={{ color: a.activa ? COLORS.azulMedio : COLORS.muted, border: `1px solid ${COLORS.surface2}` }} className="text-xs px-3 py-1.5 rounded-lg">
                {a.activa ? "Activa" : "Pausada"}
              </button>
              <button onClick={() => borrar(a.id)} style={{ color: COLORS.azulPalido }} className="text-xs px-2">Borrar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanesView({ session, perfil, onRequireLogin, onPlanActualizado }) {
  const [suscribiendo, setSuscribiendo] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState(null);
  const planActual = perfil?.plan || "pokeball";
  const renovacionActiva = !!perfil?.mp_preapproval_id;

  const suscribirse = async (plan) => {
    if (!session) { onRequireLogin(); return; }
    setSuscribiendo(plan); setError(null);
    try {
      const res = await fetch("/api/mercadopago/crear-suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: session.user.id, plan, email: session.user.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar la suscripción");
      window.location.href = data.init_point;
    } catch (e) {
      setError(e.message);
      setSuscribiendo(null);
    }
  };

  const cancelarRenovacion = async () => {
    if (!session) return;
    setCancelando(true); setError(null);
    try {
      const res = await fetch("/api/mercadopago/cancelar-suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilId: session.user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cancelar la renovación");
      onPlanActualizado?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Planes</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">
        Durante el lanzamiento, tiendas y vendedores activos tienen beneficios Premium de regalo. Elige tu rango cuando quieras hacerlo permanente — se renueva solo cada mes, cancela cuando quieras.
      </p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {renovacionActiva && (
        <div style={{ background: `${COLORS.azulMedio}11`, border: `1px solid ${COLORS.azulMedio}55` }} className="rounded-xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm">🔁 Tu plan se renueva automáticamente cada mes.</p>
          <button onClick={cancelarRenovacion} disabled={cancelando} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
            {cancelando ? "Cancelando..." : "Cancelar renovación automática"}
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLAN_ORDER.map((key) => {
          const info = PLAN_INFO[key];
          const esActual = planActual === key;
          const bloqueadoPorTipo = info.soloTienda && perfil?.tipo !== "tienda";
          return (
            <div key={key} style={{ background: COLORS.surface, border: `1px solid ${esActual ? info.color : COLORS.surface2}`, boxShadow: esActual ? `0 0 24px ${info.color}44` : "none" }} className="rounded-2xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-lg flex items-center gap-2"><RankIcon plan={key} emoji={info.emoji} size={22} /> {info.nombre}</p>
                {esActual && <Badge color={info.color}>Tu plan</Badge>}
              </div>
              <p style={{ color: COLORS.muted }} className="text-sm mb-3">{info.resumen}</p>
              <p style={{ fontFamily: "'Space Mono', monospace", color: info.color }} className="text-2xl font-bold mb-1">
                {info.precio === 0 ? "Gratis" : `$${info.precio} MXN/mes`}
              </p>
              {info.precio > 0 && <p style={{ color: COLORS.muted }} className="text-xs mb-2">Se renueva solo cada mes. Cancela cuando quieras.</p>}
              <ul className="text-sm grid gap-1 mb-4 flex-1">
                {info.beneficios.map((b, i) => <li key={i} style={{ color: COLORS.text }}>✓ {b}</li>)}
              </ul>
              {key === "pokeball" ? (
                <p style={{ color: COLORS.muted }} className="text-xs text-center">Plan por defecto</p>
              ) : bloqueadoPorTipo ? (
                <p style={{ color: COLORS.muted }} className="text-xs text-center">Exclusivo para cuentas de tienda</p>
              ) : esActual ? (
                <p style={{ color: info.color }} className="text-xs text-center">Ya tienes este plan activo</p>
              ) : (
                <button onClick={() => suscribirse(key)} disabled={suscribiendo === key}
                  style={{ background: info.color, color: textoSobre(info.color) }} className="rounded-lg py-2 text-sm font-semibold">
                  {suscribiendo === key ? "Redirigiendo a Mercado Pago..." : "Suscribirme"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const NOMBRES_TABLA_BOOST = { mercado_listings: "Mercado", inventario_tienda: "Carta de tienda", sellado_tienda: "Sellado de tienda" };
const ESTADOS_OK = ["approved", "processed"];

function MisPagosPanel({ session }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    Promise.all([
      sb(`pagos?select=*&perfil_id=eq.${session.user.id}&order=created_at.desc`, session),
      sb(`boosts?select=*&perfil_id=eq.${session.user.id}&order=created_at.desc`, session),
    ])
      .then(([pagos, boosts]) => {
        const combinados = [
          ...pagos.map((p) => ({ ...p, _tipo: "plan" })),
          ...boosts.map((b) => ({ ...b, _tipo: "boost" })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setItems(combinados);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const colorEstado = (status) => (ESTADOS_OK.includes(status) ? COLORS.azulClaro : status === "pending" ? COLORS.azulPalido : COLORS.azul);
  const textoEstado = (status) => (ESTADOS_OK.includes(status) ? "Aprobado" : status === "pending" ? "Pendiente" : "Rechazado");

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Mis pagos</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Historial de tus suscripciones de plan y publicaciones destacadas.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {loading ? <Loading label="Cargando tu historial..." /> : (
        <div className="grid gap-2">
          {items.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no tienes pagos registrados.</p>}
          {items.map((item) => (
            <div key={`${item._tipo}-${item.id}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
              <Badge color={item._tipo === "plan" ? COLORS.azulMedio : COLORS.azulPalido}>{item._tipo === "plan" ? "Plan" : "Boost"}</Badge>
              <div className="flex-1 min-w-[140px]">
                <p className="font-medium text-sm">
                  {item._tipo === "plan" ? (PLAN_INFO[item.plan]?.nombre || item.plan) : `${NOMBRES_TABLA_BOOST[item.tabla] || item.tabla} · ${item.dias} días`}
                </p>
                <p style={{ color: COLORS.muted }} className="text-xs">
                  {new Date(item.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <p style={{ fontFamily: "'Space Mono', monospace" }} className="font-bold text-sm">${Number(item.monto || 0).toLocaleString("es-MX")}</p>
              <Badge color={colorEstado(item.status)}>{textoEstado(item.status)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditarPerfilModal({ session, perfil, onClose, onGuardado }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const info = planDe(perfil);
  const [nombre, setNombre] = useState(perfil?.nombre || "");
  const [whatsapp, setWhatsapp] = useState(perfil?.whatsapp || "");
  const [facebook, setFacebook] = useState(perfil?.facebook || "");
  const [instagram, setInstagram] = useState(perfil?.instagram || "");
  const [googleMaps, setGoogleMaps] = useState(perfil?.google_maps_url || "");
  const [avatarPreview, setAvatarPreview] = useState(perfil?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPokemonUrl, setAvatarPokemonUrl] = useState(null);
  const [mostrarPokemonPicker, setMostrarPokemonPicker] = useState(false);
  const [favoritos, setFavoritos] = useState(() => {
    const base = perfil?.pokemon_favoritos || [];
    return [base[0] || null, base[1] || null, base[2] || null];
  });
  const [slotEditando, setSlotEditando] = useState(null);
  const [vis, setVis] = useState({
    publicaciones: perfil?.visibilidad?.publicaciones !== false,
    wishlist: perfil?.visibilidad?.wishlist !== false,
    favoritos: perfil?.visibilidad?.favoritos !== false,
    carpetas: perfil?.visibilidad?.carpetas !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const elegirArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPokemonUrl(null);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const elegirPokemon = (url) => {
    setAvatarPokemonUrl(url);
    setAvatarFile(null);
    setAvatarPreview(url);
    setMostrarPokemonPicker(false);
  };

  const elegirFavorito = (slot, url, name) => {
    setFavoritos((prev) => { const next = [...prev]; next[slot] = name.toLowerCase(); return next; });
    setSlotEditando(null);
  };

  const quitarFavorito = (slot) => {
    setFavoritos((prev) => { const next = [...prev]; next[slot] = null; return next; });
  };

  const guardar = async () => {
    if (!nombre.trim()) return;
    setSaving(true); setError(null);
    try {
      let avatar_url = perfil?.avatar_url || null;
      if (avatarFile) avatar_url = await subirAvatar(avatarFile, session);
      else if (avatarPokemonUrl) avatar_url = avatarPokemonUrl;

      await sbWrite("PATCH", `perfiles?id=eq.${session.user.id}`, {
        nombre: nombre.trim(),
        whatsapp: whatsapp || null,
        facebook: facebook || null,
        ...(info.redesExtra ? { instagram: instagram || null, google_maps_url: googleMaps || null } : {}),
        avatar_url,
        pokemon_favoritos: favoritos.filter(Boolean),
        visibilidad: vis,
      }, session);
      onGuardado();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulMedio}66`, boxShadow: `0 0 40px ${COLORS.azulMedio}33` }}
        className="w-full max-w-md rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} style={{ color: COLORS.muted }} className="absolute top-4 right-4"><X size={20} /></button>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-4">Editar perfil</h2>

        <div className="flex items-center gap-3 mb-3">
          <img
            src={avatarPreview || "/branding/logo-icon.png"}
            alt=""
            style={{ width: 64, height: 64, borderRadius: "9999px", objectFit: "cover", border: `1px solid ${COLORS.azulMedio}` }}
          />
          <div className="grid gap-1">
            <label style={{ color: COLORS.azulClaro, border: `1px solid ${COLORS.azulClaro}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer text-center">
              Cambiar foto
              <input type="file" accept="image/*" onChange={elegirArchivo} className="hidden" />
            </label>
            <button type="button" onClick={() => setMostrarPokemonPicker((v) => !v)} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
              Elegir Pokémon
            </button>
          </div>
        </div>
        {mostrarPokemonPicker && <div className="mb-3"><PokemonPicker onSelect={elegirPokemon} /></div>}

        {error && <div className="mb-3"><ErrorBox message={error} /></div>}

        <div className="grid gap-3">
          <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm outline-none" />
          <input placeholder="WhatsApp (opcional)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm outline-none" />
          <input placeholder="Enlace de Facebook (opcional)" value={facebook} onChange={(e) => setFacebook(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm outline-none" />
          {info.redesExtra ? (
            <>
              <input placeholder="Enlace de Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm outline-none" />
              {perfil?.tipo === "tienda" && (
                <input placeholder="Enlace de Google Maps" value={googleMaps} onChange={(e) => setGoogleMaps(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm outline-none" />
              )}
            </>
          ) : (
            <p style={{ color: COLORS.muted }} className="text-xs">
              🔒 Enlace de Instagram{perfil?.tipo === "tienda" ? " y Google Maps" : ""} disponible desde Zafiro.
            </p>
          )}

          <div>
            <p style={{ color: COLORS.azulPalido }} className="text-xs font-semibold uppercase mb-1">Tus 3 Pokémon favoritos</p>
            <p style={{ color: COLORS.muted }} className="text-xs mb-2">Aparecen en tu perfil público, y las cartas de esos Pokémon aparecen primero en el inicio de la app (después de las destacadas).</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="relative">
                  {favoritos[slot] ? (
                    <div className="flex flex-col items-center gap-1">
                      <PokemonFavSprite name={favoritos[slot]} size={48} />
                      <p className="text-xs capitalize truncate w-full text-center">{favoritos[slot]}</p>
                      <button type="button" onClick={() => quitarFavorito(slot)} style={{ color: "#C24444" }} className="text-xs">Quitar</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setSlotEditando(slot === slotEditando ? null : slot)}
                      style={{ border: `1px dashed ${COLORS.surface2}`, color: COLORS.muted }}
                      className="rounded-lg w-full h-full min-h-[64px] text-xs">
                      + Agregar
                    </button>
                  )}
                </div>
              ))}
            </div>
            {slotEditando !== null && (
              <div className="mt-2"><PokemonPicker onSelect={(url, name) => elegirFavorito(slotEditando, url, name)} /></div>
            )}
          </div>

          <div>
            <p style={{ color: COLORS.azulPalido }} className="text-xs font-semibold uppercase mb-1">Qué se ve en tu perfil público</p>
            {[
              { key: "publicaciones", label: "Mis cartas y producto sellado en venta" },
              { key: "wishlist", label: "Mi Wishlist" },
              { key: "favoritos", label: "Mis Pokémon favoritos" },
              { key: "carpetas", label: "Mis carpetas" },
            ].map((op) => (
              <label key={op.key} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                <input type="checkbox" checked={vis[op.key]} onChange={(e) => setVis((v) => ({ ...v, [op.key]: e.target.checked }))} />
                {op.label}
              </label>
            ))}
          </div>

          <button onClick={guardar} disabled={saving || !nombre.trim()} style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: saving ? 0.6 : 1 }} className="rounded-lg py-2 font-semibold mt-1 flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />} Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

const TIPO_NOTIFICACION_ICONO = { wishlist: Sparkles, anuncio: Megaphone, mensaje: MessageCircle, torneo: Calendar, plan: Shield, boost: Sparkles, error: AlertCircle };

function NotificationBell({ session, onNavigate }) {
  const [abierto, setAbierto] = useState(false);
  const [notis, setNotis] = useState([]);
  const [loading, setLoading] = useState(false);
  const ultimaVezKey = "ec_ultima_vez_notis";

  const cargar = () => {
    setLoading(true);
    const path = session
      ? `notificaciones?select=*&or=(perfil_id.eq.${session.user.id},perfil_id.is.null)&order=created_at.desc&limit=20`
      : `notificaciones?select=*&perfil_id=is.null&order=created_at.desc&limit=20`;
    sb(path, session)
      .then(setNotis)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [session?.user?.id]);

  const ultimaVez = Number(localStorage.getItem(ultimaVezKey) || 0);
  const noLeidas = notis.filter((n) => (n.perfil_id ? !n.leida : new Date(n.created_at).getTime() > ultimaVez)).length;

  const abrir = () => {
    setAbierto((v) => !v);
    if (!abierto) cargar();
  };

  const VISTA_POR_TIPO = { wishlist: "alertas", anuncio: "news", mensaje: "inbox" };

  const marcarLeida = async (n) => {
    if (n.perfil_id && !n.leida && session) {
      try { await sbWrite("PATCH", `notificaciones?id=eq.${n.id}`, { leida: true }, session); } catch {}
      setNotis((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
    }
    const vista = VISTA_POR_TIPO[n.tipo];
    if (vista) onNavigate?.(vista);
    setAbierto(false);
  };

  const marcarTodasLeidas = async () => {
    localStorage.setItem(ultimaVezKey, String(Date.now()));
    const pendientes = notis.filter((n) => n.perfil_id && !n.leida);
    setNotis((prev) => prev.map((n) => ({ ...n, leida: true })));
    if (session) {
      await Promise.allSettled(pendientes.map((n) => sbWrite("PATCH", `notificaciones?id=eq.${n.id}`, { leida: true }, session)));
    }
  };

  return (
    <>
      <button onClick={abrir} style={{ color: COLORS.muted }} className="relative p-2 rounded-lg">
        <Bell size={18} />
        {noLeidas > 0 && (
          <span style={{ background: COLORS.azulPalido, color: COLORS.bg }}
            className="absolute -top-1 -right-1 rounded-full text-[10px] font-bold w-4 h-4 flex items-center justify-center">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          {/* Ancla a la <nav> (más ancha, con position:relative) en vez de a este botón,
              para que no se salga de la pantalla en celular cuando la campanita no es
              el último ícono de la barra. */}
          <div
            style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66`, boxShadow: `0 0 24px ${COLORS.azulMedio}33` }}
            className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl overflow-hidden z-40"
          >
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${COLORS.bg}` }}>
              <p className="text-sm font-semibold">Notificaciones</p>
              <button onClick={marcarTodasLeidas} style={{ color: COLORS.azulPalido }} className="text-xs">Marcar todo leído</button>
            </div>
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              {loading && <p style={{ color: COLORS.muted }} className="text-xs p-4 text-center">Cargando...</p>}
              {!loading && notis.length === 0 && <p style={{ color: COLORS.muted }} className="text-xs p-4 text-center">Sin notificaciones todavía.</p>}
              {!loading && notis.map((n) => {
                const Icon = TIPO_NOTIFICACION_ICONO[n.tipo] || Bell;
                const noLeida = n.perfil_id ? !n.leida : new Date(n.created_at).getTime() > ultimaVez;
                return (
                  <button key={n.id} onClick={() => marcarLeida(n)}
                    style={{ background: noLeida ? `${COLORS.azul}22` : "transparent", borderBottom: `1px solid ${COLORS.bg}` }}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:brightness-125">
                    <Icon size={16} color={COLORS.azulPalido} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{n.titulo}</p>
                      {n.mensaje && <p style={{ color: COLORS.muted }} className="text-xs truncate">{n.mensaje}</p>}
                      <p style={{ color: COLORS.muted }} className="text-[10px] mt-0.5">
                        {new Date(n.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Drawer({ session, perfil, secundarios, view, onNavigate, onEditarPerfil, onLogout, onLogin, onClose }) {
  const renglon = (id, label, Icon, onClick) => (
    <button
      key={id}
      onClick={onClick}
      style={{ color: view === id ? COLORS.azulPalido : COLORS.text, background: view === id ? `${COLORS.azul}22` : "transparent" }}
      className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium hover:brightness-125"
    >
      <Icon size={18} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div style={{ background: "#00000099" }} className="absolute inset-0" onClick={onClose} />
      <div style={{ background: COLORS.surface, borderLeft: `1px solid ${COLORS.azulMedio}66` }}
        className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] overflow-y-auto">
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${COLORS.surface2}` }}>
          {session ? (
            <div className="flex items-center gap-2 min-w-0">
              <AvatarImg url={perfil?.avatar_url} size={36} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{perfil?.nombre || "Mi cuenta"}</p>
                <PlanBadge perfil={perfil} />
              </div>
            </div>
          ) : (
            <p className="font-semibold">Menú</p>
          )}
          <button onClick={onClose} style={{ color: COLORS.muted }}><X size={20} /></button>
        </div>

        <div className="py-2">
          {secundarios.map((item) => renglon(item.id, item.label, item.icon, () => onNavigate(item.id)))}
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.surface2}` }} className="py-2">
          {session ? (
            <>
              {renglon("editarPerfil", "Editar perfil", User, onEditarPerfil)}
              <button onClick={onLogout} style={{ color: COLORS.azulPalido }} className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium">
                Cerrar sesión
              </button>
            </>
          ) : (
            <button onClick={onLogin} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="mx-4 rounded-lg px-4 py-2 text-sm font-bold w-[calc(100%-2rem)]">
              Iniciar sesión / Crear cuenta
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { ErrorBoundary };

// ---- Fondo animado global: gradiente + panal de heptágonos con parallax y brillo al tacto ----
function heptagonPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + i * ((2 * Math.PI) / 7);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") + " Z";
}
const HEPTA_TILE_W = 42, HEPTA_TILE_H = 72, HEPTA_R = 13;
function honeycombSvg(color, opacity) {
  const d1 = heptagonPath(HEPTA_TILE_W / 2, HEPTA_TILE_H / 4, HEPTA_R);
  const d2 = heptagonPath(0, HEPTA_TILE_H * 0.75, HEPTA_R);
  const d3 = heptagonPath(HEPTA_TILE_W, HEPTA_TILE_H * 0.75, HEPTA_R);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${HEPTA_TILE_W}' height='${HEPTA_TILE_H}' viewBox='0 0 ${HEPTA_TILE_W} ${HEPTA_TILE_H}'>
    <path d='${d1}' fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'/>
    <path d='${d2}' fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'/>
    <path d='${d3}' fill='none' stroke='${color}' stroke-opacity='${opacity}' stroke-width='1'/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const HEPTA_DIM = honeycombSvg(COLORS.azulClaro, 0.3);
const HEPTA_BRIGHT = honeycombSvg("#CFE0FF", 0.75);

function BackgroundField() {
  const [scrollY, setScrollY] = useState(0);
  const [pointer, setPointer] = useState({ x: -500, y: -500 });
  const [glowOn, setGlowOn] = useState(false);
  const rafRef = useRef(null);
  const fadeRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setScrollY(window.scrollY || 0);
      });
    };
    const onPointer = (e) => {
      const p = e.touches ? e.touches[0] : e;
      if (!p) return;
      clearTimeout(fadeRef.current);
      setPointer({ x: p.clientX, y: p.clientY });
      setGlowOn(true);
      fadeRef.current = setTimeout(() => setGlowOn(false), 900);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onPointer, { passive: true });
    window.addEventListener("touchmove", onPointer, { passive: true });
    window.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onPointer);
      window.removeEventListener("touchmove", onPointer);
      window.removeEventListener("touchstart", onPointer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(fadeRef.current);
    };
  }, []);

  const bgPos = `0px ${scrollY * 0.35}px`;

  return (
    <>
      <div
        style={{
          position: "fixed", inset: "-10%", zIndex: 0, pointerEvents: "none",
          animation: "drift 22s ease-in-out infinite",
          background: `radial-gradient(60% 50% at 15% 8%, rgba(79,127,209,.28), transparent 60%),
            radial-gradient(50% 45% at 85% 15%, rgba(139,92,246,.16), transparent 60%),
            radial-gradient(70% 60% at 50% 95%, rgba(255,211,77,.08), transparent 60%),
            linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.surface} 45%, #070c1c 100%)`,
        }}
      />
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.32,
          backgroundImage: `url("${HEPTA_DIM}")`,
          backgroundSize: `${HEPTA_TILE_W}px ${HEPTA_TILE_H}px`,
          backgroundPosition: bgPos, backgroundRepeat: "repeat",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.1))",
          WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.1))",
        }}
      />
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", mixBlendMode: "screen",
          transition: "opacity .5s ease", opacity: glowOn ? 0.5 : 0,
          backgroundImage: `url("${HEPTA_BRIGHT}")`,
          backgroundSize: `${HEPTA_TILE_W}px ${HEPTA_TILE_H}px`,
          backgroundPosition: bgPos, backgroundRepeat: "repeat",
          maskImage: `radial-gradient(circle 130px at ${pointer.x}px ${pointer.y}px, rgba(0,0,0,0.9), transparent 70%)`,
          WebkitMaskImage: `radial-gradient(circle 130px at ${pointer.x}px ${pointer.y}px, rgba(0,0,0,0.9), transparent 70%)`,
        }}
      />
    </>
  );
}

export default function EncuentraCartas() {
  const [view, setView] = useState("search");
  const [query, setQuery] = useState("");
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showEditarPerfil, setShowEditarPerfil] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [chatContext, setChatContext] = useState(null);

  // Cuando sb()/sbWrite() renuevan la sesión sola (el token expiró), nos enteramos aquí.
  useEffect(() => {
    onSesionRefrescada = (nueva) => setSession(nueva);
    return () => { onSesionRefrescada = null; };
  }, []);

  // Para poder incluir quién estaba conectado si algo truena (reportarError).
  useEffect(() => {
    uidActual = session?.user?.id || null;
  }, [session]);

  const abrirChat = (otherId, otherNombre, contexto, otherWhatsapp, otherFacebook, otherAvatar) => {
    if (!session) { setShowAccountModal(true); return; }
    if (!otherId) return; // sin cuenta vinculada, no se puede chatear todavía
    if (otherId === session.user.id) return; // no chatear contigo mismo
    setChatContext({ otherId, otherNombre, contexto, otherWhatsapp, otherFacebook, otherAvatar });
  };

  // Si volvemos de Mercado Pago (plan, boost o suscripción), refrescamos el perfil
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get("pago") || params.get("plan") || params.get("boost")) && session) {
      cargarOCrearPerfil(session);
    }
  }, [session]);

  // Restaurar sesión guardada al abrir la app
  useEffect(() => {
    const saved = localStorage.getItem("ec_session");
    if (saved) {
      const s = JSON.parse(saved);
      setSession(s);
      cargarOCrearPerfil(s);
    }
  }, []);

  // Trae el perfil de la persona; si no existe (primer inicio de sesión tras confirmar su correo),
  // lo crea usando los datos que guardamos al momento del registro.
  const cargarOCrearPerfil = async (s) => {
    try {
      const rows = await sb(`perfiles?select=*&id=eq.${s.user.id}`, s);
      let p = rows[0];
      if (!p && s.user.user_metadata?.tipo) {
        const creado = await sbWrite("POST", "perfiles", {
          id: s.user.id,
          tipo: s.user.user_metadata.tipo,
          nombre: s.user.user_metadata.nombre,
          whatsapp: s.user.user_metadata.whatsapp || null,
          facebook: s.user.user_metadata.facebook || null,
          avatar_url: s.user.user_metadata.avatar_url || randomPokemonAvatar(),
          email: s.user.email || null,
        }, s);
        p = Array.isArray(creado) ? creado[0] : creado;
      }
      setPerfil(p || null);
    } catch {
      setPerfil(null);
    }
  };

  const handleAuthed = (s, { esNuevo } = {}) => {
    setSession(s);
    setShowAccountModal(false);
    cargarOCrearPerfil(s);
    if (esNuevo) setView("ayuda");
  };

  const handleLogout = () => {
    localStorage.removeItem("ec_session");
    setSession(null);
    setPerfil(null);
  };

  const [tiendas, setTiendas] = useState([]);
  const [loadingTiendas, setLoadingTiendas] = useState(true);
  const [errorTiendas, setErrorTiendas] = useState(null);

  const [searchResults, setSearchResults] = useState({ tiendas: [], mercado: [], sellado: [] });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedPerfilId, setSelectedPerfilId] = useState(null);
  const [vistaAntesDePerfil, setVistaAntesDePerfil] = useState("search");
  const [storeInventory, setStoreInventory] = useState([]);
  const [storeSellado, setStoreSellado] = useState([]);
  const [loadingStoreDetail, setLoadingStoreDetail] = useState(false);

  const [market, setMarket] = useState([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [inicioTienda, setInicioTienda] = useState([]);
  const [loadingInicio, setLoadingInicio] = useState(false);

  // Carga inicial: lista de tiendas reales
  useEffect(() => {
    setLoadingTiendas(true);
    sb("tiendas?select=*,perfiles(plan,plan_vence,instagram,google_maps_url,avatar_url,diamante_desde)&order=nombre.asc")
      .then(setTiendas)
      .catch((e) => setErrorTiendas(e.message))
      .finally(() => setLoadingTiendas(false));
  }, []);

  // Búsqueda en vivo (tiendas + mercado + producto sellado)
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults({ tiendas: [], mercado: [], sellado: [] });
      return;
    }
    const q = encodeURIComponent(query.trim());
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(() => {
      Promise.all([
        sb(`inventario_tienda?select=*,tiendas(nombre,zona,direccion,telefono,perfil_id,perfiles(plan,plan_vence,avatar_url))&carta=ilike.*${q}*&order=precio.asc`),
        sb(`mercado_listings?select=*,perfiles(nombre,whatsapp,facebook,plan,plan_vence,avatar_url)&carta=ilike.*${q}*&order=precio.asc`),
        sb(`sellado_tienda?select=*,tiendas(nombre,zona,direccion,telefono,perfil_id,perfiles(plan,plan_vence,avatar_url))&producto=ilike.*${q}*&order=precio.asc`),
      ])
        .then(([inv, merc, sel]) => setSearchResults({ tiendas: conBoostPrimero(inv), mercado: conBoostPrimero(merc), sellado: conBoostPrimero(sel) }))
        .catch((e) => { setSearchResults({ tiendas: [], mercado: [], sellado: [] }); setSearchError(e.message); })
        .finally(() => setSearching(false));
    }, 350); // pequeña espera para no saturar mientras escribes
    return () => clearTimeout(t);
  }, [query]);

  // Mercado y noticias, al entrar a esas pestañas (y también para la vitrina de inicio)
  useEffect(() => {
    const necesitaVitrina = view === "search" && !query.trim();
    if ((view === "market" || necesitaVitrina) && market.length === 0) {
      setLoadingMarket(true);
      sb("mercado_listings?select=*,perfiles(nombre,whatsapp,facebook,plan,plan_vence,avatar_url)&order=created_at.desc").then((rows) => setMarket(conBoostPrimero(rows))).finally(() => setLoadingMarket(false));
    }
    if ((view === "news" || necesitaVitrina) && news.length === 0) {
      setLoadingNews(true);
      sb("noticias?select=*,tiendas(nombre,perfiles(avatar_url))&publicado=eq.true&order=fecha_publicacion.desc").then(setNews).finally(() => setLoadingNews(false));
    }
    if (necesitaVitrina && inicioTienda.length === 0) {
      setLoadingInicio(true);
      sb("inventario_tienda?select=*,tiendas(nombre,zona,perfil_id,perfiles(plan,plan_vence,avatar_url))&order=created_at.desc&limit=10")
        .then((rows) => setInicioTienda(conBoostPrimero(rows)))
        .finally(() => setLoadingInicio(false));
    }
    if (view === "inbox" && session) {
      cargarInbox();
    }
  }, [view]);

  const [conversaciones, setConversaciones] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);

  const cargarInbox = () => {
    setLoadingInbox(true);
    const uid = session.user.id;
    sb(
      `mensajes?select=*,remitente:de_perfil_id(nombre,whatsapp,facebook,avatar_url),destinatario:para_perfil_id(nombre,whatsapp,facebook,avatar_url)&or=(de_perfil_id.eq.${uid},para_perfil_id.eq.${uid})&order=created_at.desc`,
      session
    )
      .then((rows) => {
        // Agrupamos por conversación: mismo interlocutor + mismo tema (contexto)
        const grupos = new Map();
        rows.forEach((m) => {
          const soyRemitente = m.de_perfil_id === uid;
          const otherId = soyRemitente ? m.para_perfil_id : m.de_perfil_id;
          const otherPerfil = soyRemitente ? m.destinatario : m.remitente;
          const key = `${otherId}::${m.contexto}`;
          if (!grupos.has(key)) {
            grupos.set(key, {
              otherId,
              otherNombre: otherPerfil?.nombre || "Usuario",
              otherWhatsapp: otherPerfil?.whatsapp,
              otherFacebook: otherPerfil?.facebook,
              otherAvatar: otherPerfil?.avatar_url,
              contexto: m.contexto,
              ultimoMensaje: m.texto,
              fecha: m.created_at,
            });
          }
        });
        setConversaciones(Array.from(grupos.values()));
      })
      .finally(() => setLoadingInbox(false));
  };

  const openStore = (store) => {
    setSelectedStore(store);
    setView("storeDetail");
    setLoadingStoreDetail(true);
    Promise.all([
      sb(`inventario_tienda?select=*&tienda_id=eq.${store.id}`),
      sb(`sellado_tienda?select=*&tienda_id=eq.${store.id}`),
    ])
      .then(([inv, sell]) => { setStoreInventory(conBoostPrimero(inv)); setStoreSellado(conBoostPrimero(sell)); })
      .finally(() => setLoadingStoreDetail(false));
  };

  const verPerfil = (perfilId) => {
    if (!perfilId) return;
    setVistaAntesDePerfil(view);
    setSelectedPerfilId(perfilId);
    setView("perfilPublico");
  };

  const verTiendaDesdePerfil = (tiendaId) => {
    sb(`tiendas?select=*,perfiles(plan,plan_vence,instagram,google_maps_url,avatar_url,diamante_desde)&id=eq.${tiendaId}`)
      .then((rows) => { if (rows[0]) openStore(rows[0]); });
  };

  // Esenciales: siempre visibles, en cualquier tamaño de pantalla.
  const navEsenciales = [
    { id: "search", label: "Buscar", icon: Search },
    { id: "directory", label: "Tiendas", icon: Store },
    { id: "market", label: "Mercado", icon: ShoppingBag },
    ...(session ? [{ id: "inbox", label: "Mensajes", icon: MessageCircle }] : []),
  ];
  // Secundarios: en escritorio se ven inline; en celular viven en el menú lateral.
  const navSecundarios = [
    { id: "news", label: "Anuncios y noticias", icon: Megaphone },
    { id: "torneos", label: "Torneos", icon: Calendar },
    ...(session ? [{ id: "alertas", label: "Wishlist", icon: Sparkles }] : []),
    { id: "planes", label: "Planes", icon: Shield },
    ...(session ? [{ id: "misPagos", label: "Mis pagos", icon: Receipt }] : []),
    ...(perfil?.tipo === "tienda" ? [{ id: "myStore", label: "Mi tienda", icon: Package }] : []),
    ...(perfil?.tipo === "individual" ? [{ id: "myMarket", label: "Vender en el Mercado", icon: ShoppingBag }] : []),
    { id: "ayuda", label: "Ayuda", icon: HelpCircle },
    ...(perfil?.es_admin ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
  ];
  const navButton = (item) => {
    const Icon = item.icon;
    const active = view === item.id;
    return (
      <button key={item.id} onClick={() => setView(item.id)}
        style={{ background: active ? COLORS.surface2 : "transparent", border: `1px solid ${active ? COLORS.azulPalido : COLORS.surface2}`, color: active ? COLORS.azulPalido : COLORS.muted }}
        className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
        <Icon size={15} /> <span className="hidden sm:inline">{item.label}</span>
      </button>
    );
  };

  return (
    <div
      style={{
        position: "relative",
        backgroundColor: COLORS.bg,
        color: COLORS.text,
        minHeight: "100vh",
        fontFamily: "'Rajdhani', sans-serif",
        overflowX: "hidden",
      }}
      className="w-full"
    >
      <style>{FONTS}</style>
      <BackgroundField />

      <header style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${COLORS.azulClaro}2e`, background: "rgba(5,8,16,0.66)", backdropFilter: "blur(14px)" }}
        className="px-4 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {!logoError ? (
              <img src="/branding/logo.png" alt="Encuentra Cartas" onError={() => setLogoError(true)} style={{ height: 40, width: "auto" }} />
            ) : (
              <>
                <Sparkles size={22} color={COLORS.azulPalido} />
                <h1 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-2xl sm:text-3xl font-bold">
                  Encuentra <span style={{ color: COLORS.azulClaro }}>Cartas</span>
                </h1>
              </>
            )}
          </div>
          <nav className="relative flex gap-2 items-center">
            {navEsenciales.map(navButton)}

            <NotificationBell session={session} onNavigate={setView} />

            {/* Todo lo demás (Anuncios, Torneos, Wishlist, Planes, Mis pagos, Mi
                tienda/Vender, Ayuda, Admin, Editar perfil, Cerrar sesión) vive en
                el menú lateral, para no saturar el encabezado con botones. */}
            <button onClick={() => setShowDrawer(true)} style={{ color: COLORS.muted }} className="p-1 rounded-lg flex items-center">
              {session ? <AvatarImg url={perfil?.avatar_url} size={32} /> : <Menu size={20} />}
            </button>
          </nav>
        </div>
      </header>

      {showDrawer && (
        <Drawer
          session={session}
          perfil={perfil}
          secundarios={navSecundarios}
          view={view}
          onNavigate={(id) => { setView(id); setShowDrawer(false); }}
          onEditarPerfil={() => { setShowEditarPerfil(true); setShowDrawer(false); }}
          onLogout={() => { handleLogout(); setShowDrawer(false); }}
          onLogin={() => { setShowAccountModal(true); setShowDrawer(false); }}
          onClose={() => setShowDrawer(false)}
        />
      )}

      {showAccountModal && <AccountModal onClose={() => setShowAccountModal(false)} onAuthed={handleAuthed} />}
      {showEditarPerfil && session && (
        <EditarPerfilModal
          session={session}
          perfil={perfil}
          onClose={() => setShowEditarPerfil(false)}
          onGuardado={() => cargarOCrearPerfil(session)}
        />
      )}
      {chatContext && session && (
        <ChatModal
          session={session}
          otherId={chatContext.otherId}
          otherNombre={chatContext.otherNombre}
          contexto={chatContext.contexto}
          otherWhatsapp={chatContext.otherWhatsapp}
          otherFacebook={chatContext.otherFacebook}
          otherAvatar={chatContext.otherAvatar}
          onClose={() => { setChatContext(null); if (session) cargarInbox(); }}
        />
      )}

      <main style={{ position: "relative", zIndex: 1 }} className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azulPalido}55`, background: `${COLORS.azulPalido}11` }}
          className="rounded-lg px-4 py-2 text-xs mb-6 text-center">
          🔌 Conectado en vivo a tu base de datos real de Supabase
        </div>

        {/* SEARCH */}
        {view === "search" && (
          <div>
            <div className="text-center mb-10" style={{ animation: "fadeUp .5s ease both" }}>
              <div style={{ background: `${COLORS.violeta}1f`, border: `1px solid ${COLORS.violeta}59`, color: "#C9B6FF" }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide mb-5">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.violeta, boxShadow: `0 0 8px ${COLORS.violeta}`, animation: "pulseGlow 1.6s ease-in-out infinite" }} />
                NUEVO · Rangos rediseñados
              </div>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(28px,5vw,44px)", letterSpacing: "-0.5px", lineHeight: 1.08 }} className="font-bold mb-3">
                Encuentra la carta<br />
                <span style={{ background: `linear-gradient(90deg, ${COLORS.azulPalido}, ${COLORS.azulClaro}, ${COLORS.violeta})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                  que estás cazando
                </span>
              </h1>
              <p style={{ color: COLORS.muted }} className="text-sm sm:text-base max-w-md mx-auto mb-7">
                Busca entre cartas publicadas por tiendas y coleccionistas cerca de ti.
              </p>
              <div style={{ background: `${COLORS.surface2}d9`, border: `1px solid ${COLORS.azulClaro}59` }}
                className="max-w-xl mx-auto rounded-2xl p-2 flex items-center gap-2">
                <Search size={20} color={COLORS.azulMedio} className="ml-2 shrink-0" />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Busca una carta..." style={{ color: COLORS.text }}
                  className="bg-transparent outline-none w-full py-2 text-lg" />
              </div>
            </div>

            {searching && <Loading label="Buscando en tiendas y mercado..." />}
            {searchError && <ErrorBox message={searchError} />}

            {!searching && !query.trim() && (
              <div>
                <p className="text-center text-sm mb-10" style={{ color: COLORS.muted }}>
                  Escribe el nombre de una carta para buscar, o explora lo más reciente aquí abajo.
                </p>

                {news.length > 0 && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between mb-3">
                      <h3 style={{ color: COLORS.azulClaro }} className="font-semibold text-sm uppercase">📢 Anuncios recientes</h3>
                      <button onClick={() => setView("news")} style={{ color: COLORS.azulPalido }} className="text-xs font-semibold">Ver todos</button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {news.slice(0, 5).map((n) => (
                        <button key={n.id} onClick={() => setView("news")}
                          style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}`, minWidth: 220, maxWidth: 220 }}
                          className="text-left rounded-xl overflow-hidden shrink-0">
                          {n.imagen_url ? (
                            <img src={n.imagen_url} alt="" style={{ height: 100, objectFit: "cover" }} className="w-full" />
                          ) : (
                            <div style={{ background: COLORS.surface2, height: 100 }} className="flex items-center justify-center">
                              <Megaphone size={24} color={COLORS.muted} />
                            </div>
                          )}
                          <div className="p-3">
                            <p className="text-sm font-semibold line-clamp-1">{n.titulo}</p>
                            <p style={{ color: COLORS.muted }} className="text-xs line-clamp-2 mt-1">{n.contenido}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(loadingMarket || loadingInicio) && market.length === 0 && inicioTienda.length === 0 && (
                  <Loading label="Cargando lo más reciente..." />
                )}

                {(market.length > 0 || inicioTienda.length > 0) && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 style={{ color: COLORS.azulClaro }} className="font-semibold text-sm uppercase">🔥 Recién publicado</h3>
                      <button onClick={() => setView("market")} style={{ color: COLORS.azulPalido }} className="text-xs font-semibold">Ver Mercado</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[...market.map((r) => ({ ...r, _esTienda: false })), ...inicioTienda.map((r) => ({ ...r, _esTienda: true }))]
                        .sort((a, b) => {
                          const da = estaDestacado(a) ? 1 : 0, db = estaDestacado(b) ? 1 : 0;
                          if (da !== db) return db - da;
                          const favoritos = perfil?.pokemon_favoritos;
                          const fa = esCartaFavorita(a.carta, favoritos) ? 1 : 0, fb = esCartaFavorita(b.carta, favoritos) ? 1 : 0;
                          if (fa !== fb) return fb - fa;
                          return new Date(b.created_at) - new Date(a.created_at);
                        })
                        .slice(0, 10)
                        .map((r) => (
                          <button key={`${r._esTienda ? "t" : "m"}-${r.id}`}
                            onClick={() => setView(r._esTienda ? "directory" : "market")}
                            style={{ background: `${COLORS.surface2}99`, border: `1px solid ${estaDestacado(r) ? COLORS.azulPalido + "66" : COLORS.azulClaro + "29"}` }}
                            className="text-left rounded-2xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
                            <div style={{ background: COLORS.surface2 }} className="aspect-[4/5] flex items-center justify-center p-2">
                              {r.imagen_url ? (
                                <img src={r.imagen_url} alt={r.carta} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                              ) : (
                                <Package size={28} color={COLORS.muted} />
                              )}
                            </div>
                            <div className="p-2">
                              <div className="flex items-center gap-1 flex-wrap mb-1">
                                <Badge color={r._esTienda ? COLORS.azulPalido : COLORS.azulClaro}>{r._esTienda ? "Tienda" : "Mercado"}</Badge>
                                <BoostBadge item={r} />
                              </div>
                              <p className="text-xs font-semibold line-clamp-2">{r.carta}</p>
                              <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} size="sm" />
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!searching && query.trim() && searchResults.tiendas.length === 0 && searchResults.mercado.length === 0 && searchResults.sellado.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-center py-16 text-sm">
                Nadie tiene "{query}" registrado todavía.
              </p>
            )}

            <div className="grid gap-4">
              {searchResults.tiendas.map((r) => (
                <div key={r.id} style={{ background: `${COLORS.surface2}8c`, border: `1px solid ${COLORS.azulClaro}29` }}
                  className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap transition-transform duration-200 hover:translate-x-1">
                  <div className="flex items-center gap-3">
                    {r.imagen_url && <img src={r.imagen_url} alt={r.carta} style={{ width: 72, height: 100, objectFit: "contain" }} />}
                    <div>
                      <div className="flex gap-2 items-center mb-1 flex-wrap"><Badge color={COLORS.azulPalido}>Tienda</Badge><p className="font-semibold text-lg">{r.carta}</p><PlanBadge perfil={r.tiendas?.perfiles} /><BoostBadge item={r} /></div>
                      <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <AvatarImg url={r.tiendas?.perfiles?.avatar_url} size={20} />
                        <p style={{ color: COLORS.muted }} className="text-xs">{r.tiendas?.nombre} · {r.tiendas?.zona}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} />
                    {r.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs">ref. mercado: ~${Number(r.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                    <button
                      onClick={() => abrirChat(r.tiendas?.perfil_id, r.tiendas?.nombre, `${r.carta} (${r.set_nombre}) en ${r.tiendas?.nombre}`, null, null, r.tiendas?.perfiles?.avatar_url)}
                      disabled={!r.tiendas?.perfil_id}
                      style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55`, opacity: r.tiendas?.perfil_id ? 1 : 0.4 }}
                      className="text-xs px-3 py-1.5 rounded-lg mt-2 flex items-center gap-1 ml-auto">
                      <MessageCircle size={12} /> Contactar
                    </button>
                  </div>
                </div>
              ))}
              {searchResults.mercado.map((r) => (
                <div key={r.id} style={{ background: `${COLORS.surface2}8c`, border: `1px solid ${COLORS.azulClaro}29` }}
                  className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap transition-transform duration-200 hover:translate-x-1">
                  <div className="flex items-center gap-3">
                    {r.imagen_url && <img src={r.imagen_url} alt={r.carta} style={{ width: 72, height: 100, objectFit: "contain" }} />}
                    <div>
                      <div className="flex gap-2 items-center mb-1 flex-wrap"><Badge color={COLORS.azulClaro}>Vendedor individual</Badge>{r.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}<p className="font-semibold text-lg">{r.carta}</p><PlanBadge perfil={r.perfiles} /><BoostBadge item={r} /></div>
                      <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1">{r.zona}</p>
                      <button onClick={() => verPerfil(r.perfil_id)} className="flex items-center gap-2 mt-2 hover:brightness-125">
                        <AvatarImg url={r.perfiles?.avatar_url} size={22} />
                        <p style={{ color: COLORS.muted }} className="text-xs">{r.perfiles?.nombre || "Usuario"}</p>
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} />
                    {r.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs">ref. mercado: ~${Number(r.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                    <button
                      onClick={() => abrirChat(r.perfil_id, r.perfiles?.nombre, `${r.carta} (${r.set_nombre})`, r.perfiles?.whatsapp, r.perfiles?.facebook, r.perfiles?.avatar_url)}
                      style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                      className="text-xs px-3 py-1.5 rounded-lg mt-2 flex items-center gap-1 ml-auto">
                      <MessageCircle size={12} /> Contactar
                    </button>
                  </div>
                </div>
              ))}
              {searchResults.sellado.map((r) => (
                <div key={`sel-${r.id}`} style={{ background: `${COLORS.surface2}8c`, border: `1px solid ${COLORS.azulClaro}29` }}
                  className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap transition-transform duration-200 hover:translate-x-1">
                  <div className="flex items-center gap-3">
                    {r.imagen_url && <img src={r.imagen_url} alt={r.producto} style={{ width: 72, height: 100, objectFit: "contain" }} />}
                    <div>
                      <div className="flex gap-2 items-center mb-1 flex-wrap"><Badge color={COLORS.azulPalido}>Tienda</Badge><Badge color={COLORS.azulMedio}>Sellado</Badge><p className="font-semibold text-lg">{r.producto}</p><PlanBadge perfil={r.tiendas?.perfiles} /><BoostBadge item={r} /></div>
                      <div className="flex items-center gap-2 mt-1">
                        <AvatarImg url={r.tiendas?.perfiles?.avatar_url} size={20} />
                        <p style={{ color: COLORS.muted }} className="text-xs">{r.tiendas?.nombre} · {r.tiendas?.zona}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} />
                    {r.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs">ref. mercado: ~${Number(r.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                    <button
                      onClick={() => abrirChat(r.tiendas?.perfil_id, r.tiendas?.nombre, `${r.producto} en ${r.tiendas?.nombre}`, null, null, r.tiendas?.perfiles?.avatar_url)}
                      disabled={!r.tiendas?.perfil_id}
                      style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55`, opacity: r.tiendas?.perfil_id ? 1 : 0.4 }}
                      className="text-xs px-3 py-1.5 rounded-lg mt-2 flex items-center gap-1 ml-auto">
                      <MessageCircle size={12} /> Contactar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DIRECTORY */}
        {view === "directory" && (
          <div>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">Directorio de tiendas</h2>
            {loadingTiendas && <Loading label="Cargando tiendas desde Supabase..." />}
            {errorTiendas && <ErrorBox message={errorTiendas} />}
            <div className="grid sm:grid-cols-2 gap-4">
              {tiendas.map((store, i) => (
                <div key={store.id} onClick={() => openStore(store)}
                  style={{ background: `${COLORS.surface2}8c`, border: `1px solid ${planDe(store.perfiles).color}44` }}
                  className="text-left rounded-2xl p-5 cursor-pointer transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <button onClick={(e) => { e.stopPropagation(); verPerfil(store.perfil_id); }} className="flex items-center gap-2 flex-wrap hover:underline">
                      <AvatarImg url={store.perfiles?.avatar_url} size={28} />
                      <p className="font-semibold text-lg">{store.nombre}</p>
                      <PlanBadge perfil={store.perfiles} />
                      <VerificadoBadge perfil={store.perfiles} />
                    </button>
                    {store.zona && <Badge color={colorFor(i)}>{store.zona}</Badge>}
                  </div>
                  <p style={{ color: COLORS.muted }} className="text-sm mt-2 flex items-start gap-1">
                    <MapPin size={14} className="mt-0.5 shrink-0" /> {store.direccion}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MARKET */}
        {view === "market" && (
          <div>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">Mercado entre usuarios</h2>
            {loadingMarket && <Loading label="Cargando publicaciones..." />}
            {!loadingMarket && market.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
                Todavía no hay publicaciones de usuarios en el mercado. En cuanto alguien se registre como cuenta individual y publique una carta, aparecerá aquí automáticamente.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {market.map((r) => (
                <div key={r.id} style={{ background: `${COLORS.surface2}99`, border: `1px solid ${estaDestacado(r) ? COLORS.azulPalido + "66" : COLORS.azulClaro + "29"}` }} className="rounded-2xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
                  <div style={{ background: COLORS.surface2 }} className="aspect-[4/5] flex items-center justify-center p-3">
                    {r.imagen_url ? (
                      <img src={r.imagen_url} alt={r.carta} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                      <Package size={40} color={COLORS.muted} />
                    )}
                  </div>
                  <div className="p-3 flex flex-col flex-1 gap-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {r.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}
                      <PlanBadge perfil={r.perfiles} />
                      <BoostBadge item={r} />
                    </div>
                    <p className="font-semibold text-sm leading-snug line-clamp-2">{r.carta}</p>
                    <p style={{ color: COLORS.muted }} className="text-xs truncate">{r.set_nombre}{r.set_nombre && r.zona ? " · " : ""}{r.zona}</p>
                    <div className="mt-1">
                      <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} size="md" />
                    </div>
                    {r.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs -mt-1">ref. mercado: ~${Number(r.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                    <button onClick={() => verPerfil(r.perfil_id)} className="flex items-center gap-2 mt-auto pt-2 hover:brightness-125">
                      <AvatarImg url={r.perfiles?.avatar_url} size={20} />
                      <p style={{ color: COLORS.muted }} className="text-xs truncate">{r.perfiles?.nombre || "Usuario"}</p>
                    </button>
                    <button
                      onClick={() => abrirChat(r.perfil_id, r.perfiles?.nombre, `${r.carta} (${r.set_nombre})`, r.perfiles?.whatsapp, r.perfiles?.facebook, r.perfiles?.avatar_url)}
                      style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                      className="text-xs px-3 py-1.5 rounded-lg mt-2 flex items-center justify-center gap-1 w-full"
                    >
                      <MessageCircle size={12} /> Contactar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NEWS */}
        {view === "news" && (
          <div>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">Anuncios y noticias</h2>
            {loadingNews && <Loading label="Cargando..." />}
            {!loadingNews && news.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
                Todavía no hay anuncios publicados.
              </p>
            )}
            <div className="grid gap-4">
              {news.map((n) => (
                <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-5">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-2">
                      <AvatarImg url={n.tiendas?.perfiles?.avatar_url} size={24} />
                      <p style={{ color: COLORS.muted }} className="text-xs font-semibold">{n.tiendas?.nombre || "Encuentra Cartas"}</p>
                    </div>
                    <Badge color={n.tipo === "anuncio" ? COLORS.azulPalido : COLORS.azulMedio}>{n.tipo}</Badge>
                  </div>
                  {n.imagen_url && <img src={n.imagen_url} alt="" style={{ maxHeight: 260, objectFit: "cover" }} className="rounded-lg mb-3 w-full" />}
                  <p className="font-semibold text-lg">{n.titulo}</p>
                  <p style={{ color: COLORS.muted }} className="text-sm mt-1">{n.contenido}</p>
                  <p style={{ color: COLORS.muted }} className="text-xs mt-2">
                    {new Date(n.fecha_publicacion || n.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MENSAJES */}
        {view === "inbox" && session && (
          <div>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">Mensajes</h2>
            {loadingInbox && <Loading label="Cargando tus conversaciones..." />}
            {!loadingInbox && conversaciones.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
                Todavía no tienes conversaciones. En cuanto alguien te contacte por una carta, o tú contactes a alguien, va a aparecer aquí.
              </p>
            )}

            {!loadingInbox && conversaciones.length > 0 && (
              <>
                <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Recientes</h3>
                <div className="grid gap-3 mb-8">
                  {conversaciones.slice(0, 3).map((c) => (
                    <button
                      key={`reciente-${c.otherId}::${c.contexto}`}
                      onClick={() => setChatContext(c)}
                      style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulPalido}55` }}
                      className="text-left rounded-xl p-4 flex items-center justify-between gap-4 hover:brightness-110 overflow-hidden"
                    >
                      <div className="min-w-0 overflow-hidden flex items-center gap-3">
                        <AvatarImg url={c.otherAvatar} size={36} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 min-w-0">
                            <p className="font-semibold shrink-0">{c.otherNombre}</p>
                            <Badge color={COLORS.azulClaro}>{c.contexto.length > 26 ? c.contexto.slice(0, 26) + "…" : c.contexto}</Badge>
                          </div>
                          <p style={{ color: COLORS.muted }} className="text-sm truncate">{c.ultimoMensaje}</p>
                        </div>
                      </div>
                      <p style={{ color: COLORS.muted }} className="text-xs whitespace-nowrap shrink-0">
                        {new Date(c.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </p>
                    </button>
                  ))}
                </div>

                <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Todos tus chats</h3>
                <div className="grid gap-3">
                  {conversaciones.map((c) => (
                    <button
                      key={`${c.otherId}::${c.contexto}`}
                      onClick={() => setChatContext(c)}
                      style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                      className="text-left rounded-xl p-4 flex items-center justify-between gap-4 hover:brightness-110 overflow-hidden"
                    >
                      <div className="min-w-0 overflow-hidden flex items-center gap-3">
                        <AvatarImg url={c.otherAvatar} size={36} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 min-w-0">
                            <p className="font-semibold shrink-0">{c.otherNombre}</p>
                            <Badge color={COLORS.azulClaro}>{c.contexto.length > 26 ? c.contexto.slice(0, 26) + "…" : c.contexto}</Badge>
                          </div>
                          <p style={{ color: COLORS.muted }} className="text-sm truncate">{c.ultimoMensaje}</p>
                        </div>
                      </div>
                      <p style={{ color: COLORS.muted }} className="text-xs whitespace-nowrap shrink-0">
                        {new Date(c.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* PLANES */}
        {view === "planes" && (
          <PlanesView session={session} perfil={perfil} onRequireLogin={() => setShowAccountModal(true)} onPlanActualizado={() => cargarOCrearPerfil(session)} />
        )}

        {/* WISHLIST / ALERTAS */}
        {view === "alertas" && session && (
          <AlertasPanel session={session} perfil={perfil} onIrAPlanes={() => setView("planes")} />
        )}

        {/* AYUDA */}
        {view === "ayuda" && <AyudaView perfil={perfil} />}

        {/* TORNEOS */}
        {view === "torneos" && (
          <TorneosView session={session} onRequireLogin={() => setShowAccountModal(true)} />
        )}

        {/* MIS PAGOS */}
        {view === "misPagos" && session && <MisPagosPanel session={session} />}

        {/* ADMIN */}
        {view === "admin" && session && perfil?.es_admin && <AdminPanel session={session} />}

        {/* MI MERCADO */}
        {view === "myMarket" && session && <MyMarketPanel session={session} perfil={perfil} onIrAPlanes={() => setView("planes")} />}

        {/* MI TIENDA */}
        {view === "myStore" && session && <MyStorePanel session={session} perfil={perfil} onIrAPlanes={() => setView("planes")} />}

        {/* STORE DETAIL */}
        {view === "storeDetail" && selectedStore && (
          <div>
            <button onClick={() => setView("directory")} style={{ color: COLORS.muted }} className="flex items-center gap-1 text-sm mb-6">
              <ChevronLeft size={16} /> Volver
            </button>
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl overflow-hidden mb-6">
              <div style={{ height: 110, position: "relative", overflow: "hidden", background: `linear-gradient(120deg, ${COLORS.azul}, ${COLORS.azulMedio} 60%, ${COLORS.azulClaro})` }}>
                <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 22px)" }} />
              </div>
              <div className="p-6 pt-0">
                <div className="flex items-end gap-3 flex-wrap" style={{ marginTop: -34 }}>
                  <HoloAvatar perfil={selectedStore.perfiles} ringSize={78}>
                    <div style={{ border: `4px solid ${COLORS.surface}`, borderRadius: "9999px", background: COLORS.surface, flexShrink: 0 }}>
                      <AvatarImg url={selectedStore.perfiles?.avatar_url} size={72} />
                    </div>
                  </HoloAvatar>
                  <button onClick={() => verPerfil(selectedStore.perfil_id)} className="flex items-center gap-2 flex-wrap hover:underline pb-1" disabled={!selectedStore.perfil_id}>
                    <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-2xl font-bold">{selectedStore.nombre}</h2>
                  </button>
                  <div className="flex items-center gap-2 pb-1.5">
                    <PlanBadge perfil={selectedStore.perfiles} size="lg" />
                    <VerificadoBadge perfil={selectedStore.perfiles} />
                  </div>
                </div>
              <div className="mt-3"><DiamanteEmblema perfil={selectedStore.perfiles} /></div>
              <p style={{ color: COLORS.muted }} className="mt-2 flex items-center gap-1 text-sm"><MapPin size={14} /> {selectedStore.direccion}</p>
              {selectedStore.telefono && <p style={{ color: COLORS.muted }} className="mt-1 flex items-center gap-1 text-sm"><Phone size={14} /> {selectedStore.telefono}</p>}
              {(selectedStore.perfiles?.instagram || selectedStore.perfiles?.google_maps_url) && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {selectedStore.perfiles?.instagram && (
                    <a href={selectedStore.perfiles.instagram} target="_blank" rel="noreferrer"
                      style={{ border: `1px solid ${COLORS.azulMedio}88`, color: COLORS.azulMedio }} className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                      Instagram <ExternalLink size={12} />
                    </a>
                  )}
                  {selectedStore.perfiles?.google_maps_url && (
                    <a href={selectedStore.perfiles.google_maps_url} target="_blank" rel="noreferrer"
                      style={{ border: `1px solid ${COLORS.azulClaro}88`, color: COLORS.azulClaro }} className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1">
                      <MapPin size={12} /> Google Maps
                    </a>
                  )}
                </div>
              )}
              {(selectedStore.direccion || (selectedStore.lat && selectedStore.lng)) && (
                <div className="mt-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${COLORS.surface2}` }}>
                  <iframe
                    title="Ubicación en el mapa"
                    src={`https://www.google.com/maps?q=${
                      selectedStore.lat && selectedStore.lng
                        ? `${selectedStore.lat},${selectedStore.lng}`
                        : encodeURIComponent(`${selectedStore.direccion}, ${selectedStore.nombre}`)
                    }&output=embed`}
                    width="100%"
                    height="220"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}
              </div>
            </div>

            {loadingStoreDetail ? <Loading label="Cargando inventario..." /> : (
              <>
                <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Cartas sueltas</h3>
                <div className="grid gap-3 mb-8">
                  {storeInventory.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Esta tienda todavía no ha subido inventario.</p>}
                  {storeInventory.map((item) => (
                    <div key={item.id} style={{ background: `${COLORS.surface2}8c`, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.azulClaro + "29"}` }} className="rounded-2xl p-4 flex justify-between items-center flex-wrap gap-2 transition-transform duration-200 hover:translate-x-1">
                      <div className="flex items-center gap-3">
                        {item.imagen_url && <img src={item.imagen_url} alt={item.carta} style={{ width: 72, height: 100, objectFit: "contain" }} />}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{item.carta}</p>
                            <BoostBadge item={item} />
                          </div>
                          <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} · {item.condicion} · {item.idioma}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <PrecioConOferta precio={item.precio} precioAntes={item.precio_antes} size="md" />
                        {item.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs">ref. mercado: ~${Number(item.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                        <button
                          onClick={() => abrirChat(selectedStore.perfil_id, selectedStore.nombre, `${item.carta} (${item.set_nombre}) en ${selectedStore.nombre}`, null, null, selectedStore.perfiles?.avatar_url)}
                          disabled={!selectedStore.perfil_id}
                          style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55`, opacity: selectedStore.perfil_id ? 1 : 0.4 }}
                          className="text-xs px-3 py-1.5 rounded-lg mt-1 flex items-center gap-1 ml-auto">
                          <MessageCircle size={12} /> Contactar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <h3 style={{ color: COLORS.azulClaro }} className="font-semibold mb-3 text-sm uppercase">Producto sellado</h3>
                <div className="grid gap-3">
                  {storeSellado.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Sin producto sellado registrado.</p>}
                  {storeSellado.map((item) => (
                    <div key={item.id} style={{ background: `${COLORS.surface2}8c`, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.azulClaro + "29"}` }} className="rounded-2xl p-4 flex justify-between items-center flex-wrap gap-2 transition-transform duration-200 hover:translate-x-1">
                      <div className="flex items-center gap-3">
                        {item.imagen_url && <img src={item.imagen_url} alt={item.producto} style={{ width: 60, height: 84, objectFit: "contain" }} />}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{item.producto}</p>
                          <BoostBadge item={item} />
                        </div>
                      </div>
                      <div className="text-right">
                        <PrecioConOferta precio={item.precio} precioAntes={item.precio_antes} size="md" />
                        {item.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs">ref. mercado: ~${Number(item.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                        <button
                          onClick={() => abrirChat(selectedStore.perfil_id, selectedStore.nombre, `${item.producto} en ${selectedStore.nombre}`, null, null, selectedStore.perfiles?.avatar_url)}
                          disabled={!selectedStore.perfil_id}
                          style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55`, opacity: selectedStore.perfil_id ? 1 : 0.4 }}
                          className="text-xs px-3 py-1.5 rounded-lg mt-1 flex items-center gap-1 ml-auto">
                          <MessageCircle size={12} /> Contactar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {view === "perfilPublico" && selectedPerfilId && (
          <PerfilPublicoView
            perfilId={selectedPerfilId}
            session={session}
            onVolver={() => setView(vistaAntesDePerfil)}
            onAbrirChat={abrirChat}
            onVerTienda={verTiendaDesdePerfil}
          />
        )}
      </main>
    </div>
  );
}
