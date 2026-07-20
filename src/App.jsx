import React, { useState, useEffect, useMemo } from "react";
import {
  Search, MapPin, Phone, Store, Sparkles, Package, ChevronLeft,
  User, Megaphone, Newspaper, ShoppingBag, X, Loader2, AlertCircle,
  MessageCircle, Send, ExternalLink, Shield, Receipt,
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
  if (!res.ok) throw new Error(`Error consultando la base de datos (${res.status})`);
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
              onClick={() => { onSelect(pokemonSpriteUrl(p.id)); setQ(""); setOpen(false); }}
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

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
`;

// Tipos de cambio aproximados, solo para calcular un precio de referencia (no es una tasa en tiempo real)
const USD_TO_MXN = 18.5;
const EUR_TO_MXN = 20;

const COLORS = {
  bg: "#000000", surface: "#060B18", surface2: "#0C1830",
  azul: "#002770", azulClaro: "#4F7FD1", azulMedio: "#1B4A9E",
  azulPalido: "#9EC0EE", text: "#FFFFFF", muted: "#7A8BA8",
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
    nombre: "Poké Ball", emoji: "⚪", precio: 0, color: COLORS.muted,
    resumen: "Básico y gratis",
    beneficios: ["Publica hasta 20 cartas/productos activos", "Aparece en búsquedas y en el directorio"],
    limiteCartas: 20, verificado: false, redesExtra: false, wishlistPremium: false, importadorMasivo: false, soloTienda: false,
  },
  superball: {
    nombre: "Super Ball", emoji: "🔵", precio: 49, color: COLORS.azulClaro,
    resumen: "Insignia verificado + redes directas",
    beneficios: ["Todo lo de Poké Ball", "Insignia de perfil verificado", "Enlace directo a Instagram y Google Maps"],
    limiteCartas: 20, verificado: true, redesExtra: true, wishlistPremium: false, importadorMasivo: false, soloTienda: false,
  },
  ultraball: {
    nombre: "Ultra Ball", emoji: "🟣", precio: 89, color: COLORS.azulMedio,
    resumen: "Todo Super Ball + Wishlist Premium",
    beneficios: ["Todo lo de Super Ball", "Alertas de precio con notificación push"],
    limiteCartas: 20, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: false, soloTienda: false,
  },
  masterball: {
    nombre: "Master Ball", emoji: "🟡", precio: 149, color: COLORS.azulPalido,
    resumen: "Todos los beneficios, inventario ilimitado",
    beneficios: ["Todo lo de Ultra Ball", "Publicaciones ilimitadas (una por una)"],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: false, soloTienda: false,
  },
  enteball: {
    nombre: "Ente Ball", emoji: "🔴", precio: 349, color: COLORS.text,
    resumen: "Exclusivo tiendas: todo + importador masivo",
    beneficios: ["Todo lo de Master Ball", "Importador masivo de inventario (texto o Excel)", "Solo disponible para cuentas de tienda"],
    limiteCartas: Infinity, verificado: true, redesExtra: true, wishlistPremium: true, importadorMasivo: true, soloTienda: true,
  },
};

const planDe = (perfil) => {
  if (!perfil) return PLAN_INFO.pokeball;
  // Si venció la suscripción, tratamos al perfil como Poké Ball hasta que pague de nuevo.
  if (perfil.plan_vence && new Date(perfil.plan_vence) < new Date()) return PLAN_INFO.pokeball;
  return PLAN_INFO[perfil.plan] || PLAN_INFO.pokeball;
};
const limiteAlcanzado = (perfil, total) => total >= planDe(perfil).limiteCartas;

// ---- Boost: destacar una publicación por unos días ----
const BOOST_PRECIOS = { 3: 15, 7: 29 };
const estaDestacado = (item) => !!(item?.destacado_hasta && new Date(item.destacado_hasta) > new Date());
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
  return (
    <span
      title={info.nombre}
      style={{ border: `1px solid ${info.color}`, color: info.color, boxShadow: `0 0 8px ${info.color}66` }}
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
      onAuthed(session);
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
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Mi cuenta</h2>
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
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Iniciar sesión</h2>
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

      onSelect({
        name: full.name,
        set_nombre: `${full.set?.name || ""} ${full.localId}${total ? "/" + total : ""}`,
        card_api_id: full.id,
        imagen_url: full.image ? `${full.image}/high.webp` : "",
        precio_ref_mxn: precioRefMxn,
      });
    } catch {
      // si falla el detalle, usamos lo que ya teníamos de la lista
      onSelect({
        name: c.name,
        set_nombre: `#${c.localId}`,
        card_api_id: c.id,
        imagen_url: c.image ? `${c.image}/high.webp` : "",
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

function RedesSocialesEditor({ session, perfil, onIrAPlanes, onUpdated }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const info = planDe(perfil);
  const [instagram, setInstagram] = useState(perfil?.instagram || "");
  const [maps, setMaps] = useState(perfil?.google_maps_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  if (!info.redesExtra) {
    return (
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <p style={{ color: COLORS.muted }} className="text-sm">🔒 Enlaces directos a Instagram y Google Maps disponibles desde Super Ball.</p>
        <button onClick={onIrAPlanes} style={{ color: COLORS.azulClaro, border: `1px solid ${COLORS.azulClaro}55` }} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">Ver planes</button>
      </div>
    );
  }

  const guardar = async () => {
    setSaving(true); setError(null); setOk(false);
    try {
      await sbWrite("PATCH", `perfiles?id=eq.${session.user.id}`, { instagram: instagram || null, google_maps_url: maps || null }, session);
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
        <input placeholder="Enlace de Google Maps" value={maps} onChange={(e) => setMaps(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
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

  const vacio = { tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", precio: "", zona: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null };
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
    if (alLimite) { setError(`Alcanzaste el límite de ${planDe(perfil).limiteCartas} publicaciones de tu plan. Mejora a Master Ball para inventario ilimitado.`); return; }
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
    try { await sbWrite("PATCH", `mercado_listings?id=eq.${id}`, { [campo]: campo === "precio" || campo === "cantidad" ? Number(valor) : valor }, session); }
    catch (e) { setError(e.message); }
  };

  if (loading) return <Loading label="Cargando tus publicaciones..." />;

  return (
    <div>
      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Vender en el Mercado</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Publica cartas sueltas o producto sellado para que otros usuarios te encuentren.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <RedesSocialesEditor session={session} perfil={perfil} onIrAPlanes={onIrAPlanes} />

      <p style={{ color: COLORS.muted }} className="text-xs mb-3">
        {publicaciones.length} / {planDe(perfil).limiteCartas === Infinity ? "∞" : planDe(perfil).limiteCartas} publicaciones usadas
      </p>
      {alLimite && (
        <div style={{ background: `${COLORS.azulPalido}11`, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <p style={{ color: COLORS.azulPalido }} className="text-sm">Alcanzaste el límite de tu plan. Mejora a Master Ball para publicaciones ilimitadas.</p>
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

        <div className="grid sm:grid-cols-3 gap-2">
          <input placeholder="Precio" type="number" value={nueva.precio} onChange={(e) => setNueva({ ...nueva, precio: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
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
      setUsuario({ ...usuario, ...cambios });
      setResultados(resultados.map((r) => (r.id === usuario.id ? { ...r, ...cambios } : r)));
      setOk(`Listo: el plan de ${usuario.nombre} ahora es ${PLAN_INFO[planNuevo].nombre}.`);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">🎚️ Cambiar plan de un usuario</h2>
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
      const creado = await sbWrite("POST", "noticias", {
        tipo: "anuncio",
        titulo: tituloAnuncio.trim(),
        contenido: contenidoAnuncio.trim(),
        tienda_id: null,
        creado_por: session.user.id,
        estado: esProgramado ? "programado" : "publicado",
        publicado: !esProgramado,
        fecha_publicacion: esProgramado ? new Date(programarFecha).toISOString() : new Date().toISOString(),
      }, session);
      const fila = Array.isArray(creado) ? creado[0] : creado;
      if (!esProgramado && fila?.id) await notificarAnuncio(fila.id);
      setTituloAnuncio(""); setContenidoAnuncio(""); setProgramarFecha(""); setModoAnuncio("ahora");
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

  if (loading) return <Loading label="Cargando panel de administración..." />;

  return (
    <div>
      <h1 style={{ fontFamily: "'Cinzel', serif" }} className="text-2xl font-bold mb-6">Panel de administración</h1>

      <CambiarPlanAdmin session={session} />

      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1 mt-10">Vincular tiendas</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Vincula cuentas de tienda registradas con su tienda real en el directorio.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {tiendasSinDueno.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm">Todas las tiendas del directorio ya tienen una cuenta vinculada. 🎉</p>
      ) : (
        <div className="grid gap-3">
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
        <p style={{ color: COLORS.muted }} className="text-xs mt-4">No hay cuentas de tipo tienda registradas todavía para vincular.</p>
      )}

      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1 mt-10">📢 Anuncios</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-4">Crea un anuncio para publicarlo de inmediato o programarlo, y revisa los que proponen las tiendas.</p>
      {errorAnuncio && <div className="mb-4"><ErrorBox message={errorAnuncio} /></div>}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-6 grid gap-3">
        <input placeholder="Título del anuncio" value={tituloAnuncio} onChange={(e) => setTituloAnuncio(e.target.value)}
          style={inputStyleAnuncio} className="rounded-lg px-3 py-2 text-sm" />
        <textarea placeholder="Contenido del anuncio" rows={3} value={contenidoAnuncio} onChange={(e) => setContenidoAnuncio(e.target.value)}
          style={inputStyleAnuncio} className="rounded-lg px-3 py-2 text-sm" />
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
                <p className="font-semibold">{n.titulo}</p>
                <p style={{ color: COLORS.muted }} className="text-sm mt-1">{n.contenido}</p>
              </div>
            ))}
          </div>
        </>
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
      <p style={{ color: COLORS.azulPalido }} className="text-sm font-semibold uppercase">🔴 Importador masivo (Ente Ball)</p>
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

function MyStorePanel({ session, perfil, onIrAPlanes }) {
  const [tienda, setTienda] = useState(undefined); // undefined = cargando, null = no vinculada
  const [inventario, setInventario] = useState([]);
  const [sellado, setSellado] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [nuevaCarta, setNuevaCarta] = useState({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "EN", precio: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
  const [nuevoSellado, setNuevoSellado] = useState({ producto: "", precio: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
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
    if (alLimite) { setError(`Alcanzaste el límite de ${planDe(perfil).limiteCartas} publicaciones de tu plan. Mejora a Master Ball o Ente Ball para inventario ilimitado.`); return; }
    setSavingCarta(true);
    try {
      await sbWrite("POST", "inventario_tienda", {
        ...nuevaCarta,
        precio: Number(nuevaCarta.precio),
        cantidad: Number(nuevaCarta.cantidad),
        tienda_id: tienda.id,
        card_api_id: nuevaCarta.card_api_id || null,
        imagen_url: nuevaCarta.imagen_url || null,
        precio_ref_mxn: nuevaCarta.precio_ref_mxn || null,
      }, session);
      setNuevaCarta({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "EN", precio: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
      cargar();
    } catch (e) { setError(e.message); } finally { setSavingCarta(false); }
  };

  const borrarCarta = async (id) => {
    try { await sbWrite("DELETE", `inventario_tienda?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const actualizarCarta = async (id, campo, valor) => {
    try { await sbWrite("PATCH", `inventario_tienda?id=eq.${id}`, { [campo]: campo === "precio" || campo === "cantidad" ? Number(valor) : valor }, session); }
    catch (e) { setError(e.message); }
  };

  const agregarSellado = async () => {
    if (!nuevoSellado.producto || !nuevoSellado.precio) return;
    if (alLimite) { setError(`Alcanzaste el límite de ${planDe(perfil).limiteCartas} publicaciones de tu plan. Mejora a Master Ball o Ente Ball para inventario ilimitado.`); return; }
    setSavingSellado(true);
    try {
      await sbWrite("POST", "sellado_tienda", {
        ...nuevoSellado,
        precio: Number(nuevoSellado.precio),
        cantidad: Number(nuevoSellado.cantidad),
        tienda_id: tienda.id,
        card_api_id: nuevoSellado.card_api_id || null,
        imagen_url: nuevoSellado.imagen_url || null,
        precio_ref_mxn: nuevoSellado.precio_ref_mxn || null,
      }, session);
      setNuevoSellado({ producto: "", precio: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
      cargar();
    } catch (e) { setError(e.message); } finally { setSavingSellado(false); }
  };

  const borrarSellado = async (id) => {
    try { await sbWrite("DELETE", `sellado_tienda?id=eq.${id}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const actualizarSellado = async (id, campo, valor) => {
    try { await sbWrite("PATCH", `sellado_tienda?id=eq.${id}`, { [campo]: campo === "precio" || campo === "cantidad" ? Number(valor) : valor }, session); }
    catch (e) { setError(e.message); }
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
        <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold">{tienda.nombre}</h2>
        <PlanBadge perfil={perfil} size="lg" />
      </div>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Administra tu inventario y producto sellado.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <RedesSocialesEditor session={session} perfil={perfil} onIrAPlanes={onIrAPlanes} />

      <p style={{ color: COLORS.muted }} className="text-xs mb-3">
        {totalActivos} / {planDe(perfil).limiteCartas === Infinity ? "∞" : planDe(perfil).limiteCartas} publicaciones usadas
      </p>
      {alLimite && (
        <div style={{ background: `${COLORS.azulPalido}11`, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-xl p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
          <p style={{ color: COLORS.azulPalido }} className="text-sm">Alcanzaste el límite de tu plan. Mejora a Master Ball o Ente Ball para inventario ilimitado.</p>
          <button onClick={onIrAPlanes} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">Ver planes</button>
        </div>
      )}

      {planDe(perfil).importadorMasivo && (
        <ImportadorMasivo session={session} tiendaId={tienda.id} onImportado={cargar} />
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
            <input type="number" defaultValue={item.cantidad} onBlur={(e) => actualizarCarta(item.id, "cantidad", e.target.value)}
              style={inputStyle} className="rounded px-2 py-1 text-sm w-16" title="Cantidad" />
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
        <div className="grid sm:grid-cols-2 gap-2">
          <input placeholder="Precio" type="number" value={nuevoSellado.precio} onChange={(e) => setNuevoSellado({ ...nuevoSellado, precio: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
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
            <input type="number" defaultValue={item.cantidad} onBlur={(e) => actualizarSellado(item.id, "cantidad", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-16" />
            <BoostButton session={session} tabla="sellado_tienda" item={item} onBoosted={cargar} />
            <button onClick={() => borrarSellado(item.id)} style={{ color: COLORS.azulPalido }} className="text-xs px-2">Borrar</button>
          </div>
        ))}
      </div>

      <ProponerAnuncio session={session} tiendaId={tienda.id} />
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
      await sbWrite("POST", "noticias", {
        tipo: "anuncio",
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        tienda_id: tiendaId,
        creado_por: session.user.id,
        estado: "pendiente",
        publicado: false,
      }, session);
      setTitulo(""); setContenido("");
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
              <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium text-sm">{n.titulo}</p>
                  <Badge color={info.color}>{info.label}</Badge>
                </div>
                <p style={{ color: COLORS.muted }} className="text-xs mt-1">{n.contenido}</p>
              </div>
            );
          })}
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
        <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-6">Wishlist Premium</h2>
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
      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Wishlist Premium</h2>
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
      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Planes</h2>
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
      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Mis pagos</h2>
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
        <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-4">Editar perfil</h2>

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
              <input placeholder="Enlace de Google Maps" value={googleMaps} onChange={(e) => setGoogleMaps(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm outline-none" />
            </>
          ) : (
            <p style={{ color: COLORS.muted }} className="text-xs">🔒 Enlaces de Instagram y Google Maps disponibles desde Super Ball.</p>
          )}
          <button onClick={guardar} disabled={saving || !nombre.trim()} style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: saving ? 0.6 : 1 }} className="rounded-lg py-2 font-semibold mt-1 flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />} Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountMenu({ session, perfil, onNavigate, onEditarPerfil, onLogout }) {
  const [abierto, setAbierto] = useState(false);

  const item = (label, onClick) => (
    <button
      onClick={() => { setAbierto(false); onClick(); }}
      style={{ color: COLORS.text }}
      className="text-left px-4 py-2 text-sm hover:brightness-125 w-full"
    >
      {label}
    </button>
  );

  return (
    <div className="relative">
      <button onClick={() => setAbierto((v) => !v)} className="flex items-center gap-2">
        <AvatarImg url={perfil?.avatar_url} size={32} />
        <Badge color={COLORS.azulPalido}>{perfil?.nombre || "Mi cuenta"}</Badge>
        <PlanBadge perfil={perfil} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div
            style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66`, boxShadow: `0 0 24px ${COLORS.azulMedio}33` }}
            className="absolute right-0 mt-2 w-56 rounded-xl overflow-hidden z-40 grid py-1"
          >
            {item("Editar perfil", onEditarPerfil)}
            {item("Planes / Suscripción", () => onNavigate("planes"))}
            {item("Mis pagos", () => onNavigate("misPagos"))}
            {perfil?.tipo === "tienda" && item("Mi tienda", () => onNavigate("myStore"))}
            {perfil?.tipo === "individual" && item("Vender en el Mercado", () => onNavigate("myMarket"))}
            {item("Wishlist", () => onNavigate("alertas"))}
            {perfil?.es_admin && item("Admin", () => onNavigate("admin"))}
            <div style={{ borderTop: `1px solid ${COLORS.surface}` }} className="my-1" />
            <button onClick={() => { setAbierto(false); onLogout(); }} style={{ color: COLORS.azulPalido }} className="text-left px-4 py-2 text-sm hover:brightness-125 w-full">
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
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
  const [chatContext, setChatContext] = useState(null);

  // Cuando sb()/sbWrite() renuevan la sesión sola (el token expiró), nos enteramos aquí.
  useEffect(() => {
    onSesionRefrescada = (nueva) => setSession(nueva);
    return () => { onSesionRefrescada = null; };
  }, []);

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

  const handleAuthed = (s) => {
    setSession(s);
    setShowAccountModal(false);
    cargarOCrearPerfil(s);
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
  const [storeInventory, setStoreInventory] = useState([]);
  const [storeSellado, setStoreSellado] = useState([]);
  const [loadingStoreDetail, setLoadingStoreDetail] = useState(false);

  const [market, setMarket] = useState([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);

  // Carga inicial: lista de tiendas reales
  useEffect(() => {
    setLoadingTiendas(true);
    sb("tiendas?select=*,perfiles(plan,plan_vence,instagram,google_maps_url,avatar_url)&order=nombre.asc")
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

  // Mercado y noticias, al entrar a esas pestañas
  useEffect(() => {
    if (view === "market" && market.length === 0) {
      setLoadingMarket(true);
      sb("mercado_listings?select=*,perfiles(nombre,whatsapp,facebook,plan,plan_vence,avatar_url)&order=created_at.desc").then((rows) => setMarket(conBoostPrimero(rows))).finally(() => setLoadingMarket(false));
    }
    if (view === "news" && news.length === 0) {
      setLoadingNews(true);
      sb("noticias?select=*,tiendas(nombre,perfiles(avatar_url))&publicado=eq.true&order=fecha_publicacion.desc").then(setNews).finally(() => setLoadingNews(false));
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

  const navItems = [
    { id: "search", label: "Buscar", icon: Search },
    { id: "directory", label: "Tiendas", icon: Store },
    { id: "market", label: "Mercado", icon: ShoppingBag },
    { id: "news", label: "Anuncios y noticias", icon: Megaphone },
    ...(session ? [{ id: "inbox", label: "Mensajes", icon: MessageCircle }] : []),
    ...(session ? [{ id: "alertas", label: "Wishlist", icon: Sparkles }] : []),
    { id: "planes", label: "Planes", icon: Shield },
    ...(session ? [{ id: "misPagos", label: "Mis pagos", icon: Receipt }] : []),
    ...(perfil?.tipo === "tienda" ? [{ id: "myStore", label: "Mi tienda", icon: Package }] : []),
    ...(perfil?.tipo === "individual" ? [{ id: "myMarket", label: "Vender en el Mercado", icon: ShoppingBag }] : []),
    ...(perfil?.es_admin ? [{ id: "admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div
      style={{
        backgroundColor: COLORS.bg,
        backgroundImage: "url('/branding/fondo.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
        color: COLORS.text,
        minHeight: "100vh",
        fontFamily: "'Rajdhani', sans-serif",
        overflowX: "hidden",
      }}
      className="w-full"
    >
      <style>{FONTS}</style>

      <header style={{ borderBottom: `1px solid ${COLORS.surface2}`, background: `radial-gradient(ellipse at top, ${COLORS.surface} 0%, ${COLORS.bg} 70%)` }}
        className="px-4 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {!logoError ? (
              <img src="/branding/logo.png" alt="Encuentra Cartas" onError={() => setLogoError(true)} style={{ height: 40, width: "auto" }} />
            ) : (
              <>
                <Sparkles size={22} color={COLORS.azulPalido} />
                <h1 style={{ fontFamily: "'Cinzel', serif" }} className="text-2xl sm:text-3xl font-bold">
                  Encuentra <span style={{ color: COLORS.azulClaro }}>Cartas</span>
                </h1>
              </>
            )}
          </div>
          <nav className="flex gap-2 flex-wrap items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button key={item.id} onClick={() => setView(item.id)}
                  style={{ background: active ? COLORS.surface2 : "transparent", border: `1px solid ${active ? COLORS.azulPalido : COLORS.surface2}`, color: active ? COLORS.azulPalido : COLORS.muted }}
                  className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Icon size={15} /> <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
            {session ? (
              <AccountMenu
                session={session}
                perfil={perfil}
                onNavigate={setView}
                onEditarPerfil={() => setShowEditarPerfil(true)}
                onLogout={handleLogout}
              />
            ) : (
              <button onClick={() => setShowAccountModal(true)} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <User size={15} /> Mi cuenta
              </button>
            )}
          </nav>
        </div>
      </header>

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

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azulPalido}55`, background: `${COLORS.azulPalido}11` }}
          className="rounded-lg px-4 py-2 text-xs mb-6 text-center">
          🔌 Conectado en vivo a tu base de datos real de Supabase
        </div>

        {/* SEARCH */}
        {view === "search" && (
          <div>
            <div className="text-center mb-8">
              <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulMedio}`, boxShadow: `0 0 24px ${COLORS.azulMedio}44` }}
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
              <div className="text-center py-16" style={{ color: COLORS.muted }}>
                <Package size={40} className="mx-auto mb-3 opacity-50" />
                <p>Escribe el nombre de una carta para buscar en la base de datos real.</p>
                <p className="text-sm mt-2">
                  Nota: como apenas cargamos las tiendas, todavía no hay cartas de inventario cargadas — las búsquedas estarán vacías hasta que las tiendas suban su inventario.
                </p>
              </div>
            )}

            {!searching && query.trim() && searchResults.tiendas.length === 0 && searchResults.mercado.length === 0 && searchResults.sellado.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-center py-16 text-sm">
                Nadie tiene "{query}" registrado todavía.
              </p>
            )}

            <div className="grid gap-4">
              {searchResults.tiendas.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                  className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
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
                    <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className="text-2xl font-bold">${Number(r.precio).toLocaleString("es-MX")}</p>
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
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                  className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {r.imagen_url && <img src={r.imagen_url} alt={r.carta} style={{ width: 72, height: 100, objectFit: "contain" }} />}
                    <div>
                      <div className="flex gap-2 items-center mb-1 flex-wrap"><Badge color={COLORS.azulClaro}>Vendedor individual</Badge>{r.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}<p className="font-semibold text-lg">{r.carta}</p><PlanBadge perfil={r.perfiles} /><BoostBadge item={r} /></div>
                      <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1">{r.zona}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <AvatarImg url={r.perfiles?.avatar_url} size={22} />
                        <p style={{ color: COLORS.muted }} className="text-xs">{r.perfiles?.nombre || "Usuario"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className="text-2xl font-bold">${Number(r.precio).toLocaleString("es-MX")}</p>
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
                <div key={`sel-${r.id}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                  className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
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
                    <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className="text-2xl font-bold">${Number(r.precio).toLocaleString("es-MX")}</p>
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
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-6">Directorio de tiendas</h2>
            {loadingTiendas && <Loading label="Cargando tiendas desde Supabase..." />}
            {errorTiendas && <ErrorBox message={errorTiendas} />}
            <div className="grid sm:grid-cols-2 gap-4">
              {tiendas.map((store, i) => (
                <button key={store.id} onClick={() => openStore(store)}
                  style={{ background: COLORS.surface, border: `1px solid ${colorFor(i)}66` }}
                  className="text-left rounded-xl p-5 hover:brightness-110">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2 flex-wrap">
                      <AvatarImg url={store.perfiles?.avatar_url} size={28} />
                      <p className="font-semibold text-lg">{store.nombre}</p>
                      <PlanBadge perfil={store.perfiles} />
                      <VerificadoBadge perfil={store.perfiles} />
                    </span>
                    {store.zona && <Badge color={colorFor(i)}>{store.zona}</Badge>}
                  </div>
                  <p style={{ color: COLORS.muted }} className="text-sm mt-2 flex items-start gap-1">
                    <MapPin size={14} className="mt-0.5 shrink-0" /> {store.direccion}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MARKET */}
        {view === "market" && (
          <div>
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-6">Mercado entre usuarios</h2>
            {loadingMarket && <Loading label="Cargando publicaciones..." />}
            {!loadingMarket && market.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
                Todavía no hay publicaciones de usuarios en el mercado. En cuanto alguien se registre como cuenta individual y publique una carta, aparecerá aquí automáticamente.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {market.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(r) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-xl overflow-hidden flex flex-col">
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
                    <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className="text-lg font-bold mt-1">
                      ${Number(r.precio).toLocaleString("es-MX")}
                    </p>
                    {r.precio_ref_mxn && <p style={{ color: COLORS.muted }} className="text-xs -mt-1">ref. mercado: ~${Number(r.precio_ref_mxn).toLocaleString("es-MX")}</p>}
                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <AvatarImg url={r.perfiles?.avatar_url} size={20} />
                      <p style={{ color: COLORS.muted }} className="text-xs truncate">{r.perfiles?.nombre || "Usuario"}</p>
                    </div>
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
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-6">Anuncios y noticias</h2>
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
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-6">Mensajes</h2>
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
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <AvatarImg url={selectedStore.perfiles?.avatar_url} size={48} />
                <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-2xl font-bold">{selectedStore.nombre}</h2>
                <PlanBadge perfil={selectedStore.perfiles} size="lg" />
                <VerificadoBadge perfil={selectedStore.perfiles} />
              </div>
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

            {loadingStoreDetail ? <Loading label="Cargando inventario..." /> : (
              <>
                <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Cartas sueltas</h3>
                <div className="grid gap-3 mb-8">
                  {storeInventory.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Esta tienda todavía no ha subido inventario.</p>}
                  {storeInventory.map((item) => (
                    <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-lg p-4 flex justify-between items-center flex-wrap gap-2">
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
                        <p style={{ color: COLORS.azulPalido }} className="font-bold">${Number(item.precio).toLocaleString("es-MX")}</p>
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
                    <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(item) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-lg p-4 flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        {item.imagen_url && <img src={item.imagen_url} alt={item.producto} style={{ width: 60, height: 84, objectFit: "contain" }} />}
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{item.producto}</p>
                          <BoostBadge item={item} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p style={{ color: COLORS.azulClaro }} className="font-bold">${Number(item.precio).toLocaleString("es-MX")}</p>
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
      </main>
    </div>
  );
}
