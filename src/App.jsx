import React, { useState, useEffect, useMemo } from "react";
import {
  Search, MapPin, Phone, Store, Sparkles, Package, ChevronLeft,
  User, Megaphone, Newspaper, ShoppingBag, X, Loader2, AlertCircle,
} from "lucide-react";

// ---- Conexión a Supabase (usa la anon key, es segura para el navegador) ----
const SUPABASE_URL = "https://nulypgaaekexlbxbxdwq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bHlwZ2FhZWtleGxieGJ4ZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk3OTcsImV4cCI6MjA5OTk3NTc5N30.9qxfcmUx5k1br1CH3DIFI2EplFJWYeRyg6HFeZNN7og";

async function sb(path, session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Error consultando la base de datos (${res.status})`);
  return res.json();
}

async function sbWrite(method, path, body, session) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Error guardando (${res.status})`);
  return data;
}

async function authSignUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
`;

const COLORS = {
  bg: "#0B0713", surface: "#171025", surface2: "#1F1730",
  magenta: "#FF2E9A", cyan: "#29F1FF", violet: "#B14EFF",
  gold: "#FFC94D", text: "#F1EAFF", muted: "#9A8FBF",
};

const STORE_COLORS = [COLORS.magenta, COLORS.cyan, COLORS.violet, COLORS.gold];
const colorFor = (i) => STORE_COLORS[i % STORE_COLORS.length];

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
    <div style={{ color: COLORS.magenta, border: `1px solid ${COLORS.magenta}66`, background: `${COLORS.magenta}11` }}
      className="rounded-lg p-4 flex items-center gap-2 text-sm">
      <AlertCircle size={18} /> {message}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const handleSignUp = async () => {
    setLoading(true); setError(null); setInfo(null);
    try {
      const auth = await authSignUp(email, password);
      if (!auth.access_token) {
        setInfo("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
        setLoading(false);
        return;
      }
      const session = { access_token: auth.access_token, user: auth.user };
      await sbWrite("POST", "perfiles", {
        id: auth.user.id, tipo: accountType, nombre,
        whatsapp: whatsapp || null, facebook: facebook || null,
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
      const session = { access_token: auth.access_token, user: auth.user };
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
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.violet}66`, boxShadow: `0 0 40px ${COLORS.violet}33` }}
        className="w-full max-w-md rounded-2xl p-6 relative">
        <button onClick={onClose} style={{ color: COLORS.muted }} className="absolute top-4 right-4"><X size={20} /></button>

        {mode === "choose" && (
          <>
            <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">Mi cuenta</h2>
            <p style={{ color: COLORS.muted }} className="text-sm mb-5">Crea una cuenta o inicia sesión.</p>
            <div className="grid gap-3">
              <button onClick={() => { setAccountType("tienda"); setMode("signupForm"); }}
                style={{ background: COLORS.surface2, border: `1px solid ${COLORS.magenta}` }} className="rounded-xl p-4 text-left flex items-center gap-3">
                <Store size={22} color={COLORS.magenta} />
                <div><p className="font-semibold">Crear cuenta de tienda</p></div>
              </button>
              <button onClick={() => { setAccountType("individual"); setMode("signupForm"); }}
                style={{ background: COLORS.surface2, border: `1px solid ${COLORS.cyan}` }} className="rounded-xl p-4 text-left flex items-center gap-3">
                <User size={22} color={COLORS.cyan} />
                <div><p className="font-semibold">Crear cuenta individual</p></div>
              </button>
              <button onClick={() => setMode("login")} style={{ color: COLORS.gold }} className="text-sm mt-2">
                Ya tengo cuenta, iniciar sesión
              </button>
            </div>
          </>
        )}

        {mode === "signupForm" && (
          <div className="grid gap-3">
            <Badge color={accountType === "tienda" ? COLORS.magenta : COLORS.cyan}>
              {accountType === "tienda" ? "Cuenta de tienda" : "Cuenta individual"}
            </Badge>
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
            {info && <p style={{ color: COLORS.gold }} className="text-xs">{info}</p>}
            <button onClick={handleSignUp} disabled={loading || !email || !password || !nombre}
              style={{ background: accountType === "tienda" ? COLORS.magenta : COLORS.cyan, color: COLORS.bg, opacity: loading ? 0.6 : 1 }}
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
              style={{ background: COLORS.gold, color: COLORS.bg, opacity: loading ? 0.6 : 1 }}
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
      onSelect({
        name: full.name,
        set_nombre: `${full.set?.name || ""} ${full.localId}${total ? "/" + total : ""}`,
        card_api_id: full.id,
        imagen_url: full.image ? `${full.image}/low.webp` : "",
      });
    } catch {
      // si falla el detalle, usamos lo que ya teníamos de la lista
      onSelect({
        name: c.name,
        set_nombre: `#${c.localId}`,
        card_api_id: c.id,
        imagen_url: c.image ? `${c.image}/low.webp` : "",
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
        <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.violet}66` }}
          className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg shadow-xl">
          {loading && <p style={{ color: COLORS.muted }} className="text-xs p-3">Buscando en el catálogo oficial...</p>}
          {!loading && results.length === 0 && <p style={{ color: COLORS.muted }} className="text-xs p-3">Sin resultados. Prueba con otro nombre.</p>}
          {results.map((c) => (
            <button key={c.id} type="button"
              onClick={() => seleccionar(c)}
              className="flex items-center gap-3 w-full text-left p-2 hover:brightness-125"
              style={{ borderBottom: `1px solid ${COLORS.bg}` }}>
              {c.image && <img src={`${c.image}/low.webp`} alt={c.name} style={{ width: 32, height: 44, objectFit: "contain" }} />}
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

function MyStorePanel({ session, perfil }) {
  const [tienda, setTienda] = useState(undefined); // undefined = cargando, null = no vinculada
  const [inventario, setInventario] = useState([]);
  const [sellado, setSellado] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [nuevaCarta, setNuevaCarta] = useState({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "EN", precio: "", cantidad: "1", card_api_id: "", imagen_url: "" });
  const [nuevoSellado, setNuevoSellado] = useState({ producto: "", precio: "", cantidad: "1" });
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

  const agregarCarta = async () => {
    if (!nuevaCarta.carta || !nuevaCarta.precio) return;
    setSavingCarta(true);
    try {
      await sbWrite("POST", "inventario_tienda", {
        ...nuevaCarta,
        precio: Number(nuevaCarta.precio),
        cantidad: Number(nuevaCarta.cantidad),
        tienda_id: tienda.id,
        card_api_id: nuevaCarta.card_api_id || null,
        imagen_url: nuevaCarta.imagen_url || null,
      }, session);
      setNuevaCarta({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "EN", precio: "", cantidad: "1", card_api_id: "", imagen_url: "" });
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
    setSavingSellado(true);
    try {
      await sbWrite("POST", "sellado_tienda", { ...nuevoSellado, precio: Number(nuevoSellado.precio), cantidad: Number(nuevoSellado.cantidad), tienda_id: tienda.id }, session);
      setNuevoSellado({ producto: "", precio: "", cantidad: "1" });
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
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.magenta}66` }} className="rounded-xl p-6 text-center">
        <Store size={32} color={COLORS.magenta} className="mx-auto mb-3" />
        <p className="font-semibold mb-1">Tu cuenta todavía no está vinculada a una tienda</p>
        <p style={{ color: COLORS.muted }} className="text-sm">
          Pídele al administrador que conecte tu cuenta con tu tienda en el directorio. Necesita tu correo o el ID de tu cuenta ({session.user.id}).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-xl font-bold mb-1">{tienda.nombre}</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Administra tu inventario y producto sellado.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <h3 style={{ color: COLORS.gold }} className="font-semibold mb-3 text-sm uppercase">Cartas sueltas</h3>
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
            })} />
            {nuevaCarta.card_api_id && (
              <div className="flex items-center gap-2 mt-2">
                {nuevaCarta.imagen_url && <img src={nuevaCarta.imagen_url} alt={nuevaCarta.carta} style={{ width: 28, height: 38, objectFit: "contain" }} />}
                <Badge color={COLORS.gold}>{nuevaCarta.carta}</Badge>
                <button type="button" onClick={() => setNuevaCarta({ ...nuevaCarta, carta: "", set_nombre: "", card_api_id: "", imagen_url: "" })} style={{ color: COLORS.muted }} className="text-xs">Cambiar</button>
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
        <button onClick={agregarCarta} disabled={savingCarta} style={{ background: COLORS.gold, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold sm:col-span-6">
          {savingCarta ? "Guardando..." : "+ Agregar carta"}
        </button>
      </div>
      <div className="grid gap-2 mb-8">
        {inventario.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no has agregado cartas.</p>}
        {inventario.map((item) => (
          <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
            {item.imagen_url && <img src={item.imagen_url} alt={item.carta} style={{ width: 32, height: 44, objectFit: "contain" }} />}
            <div className="flex-1 min-w-[140px]">
              <p className="font-medium text-sm">{item.carta}</p>
              <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} · {item.condicion}</p>
            </div>
            <input type="number" defaultValue={item.precio} onBlur={(e) => actualizarCarta(item.id, "precio", e.target.value)}
              style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio" />
            <input type="number" defaultValue={item.cantidad} onBlur={(e) => actualizarCarta(item.id, "cantidad", e.target.value)}
              style={inputStyle} className="rounded px-2 py-1 text-sm w-16" title="Cantidad" />
            <button onClick={() => borrarCarta(item.id)} style={{ color: COLORS.magenta }} className="text-xs px-2">Borrar</button>
          </div>
        ))}
      </div>

      <h3 style={{ color: COLORS.cyan }} className="font-semibold mb-3 text-sm uppercase">Producto sellado</h3>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-4 grid gap-2 sm:grid-cols-4">
        <input placeholder="Nombre del producto" value={nuevoSellado.producto} onChange={(e) => setNuevoSellado({ ...nuevoSellado, producto: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm sm:col-span-2" />
        <input placeholder="Precio" type="number" value={nuevoSellado.precio} onChange={(e) => setNuevoSellado({ ...nuevoSellado, precio: e.target.value })} style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
        <button onClick={agregarSellado} disabled={savingSellado} style={{ background: COLORS.cyan, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold">
          {savingSellado ? "Guardando..." : "+ Agregar"}
        </button>
      </div>
      <div className="grid gap-2">
        {sellado.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Aún no has agregado producto sellado.</p>}
        {sellado.map((item) => (
          <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center gap-3 flex-wrap">
            <p className="flex-1 min-w-[140px] font-medium text-sm">{item.producto}</p>
            <input type="number" defaultValue={item.precio} onBlur={(e) => actualizarSellado(item.id, "precio", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" />
            <input type="number" defaultValue={item.cantidad} onBlur={(e) => actualizarSellado(item.id, "cantidad", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-16" />
            <button onClick={() => borrarSellado(item.id)} style={{ color: COLORS.magenta }} className="text-xs px-2">Borrar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EncuentraCartas() {
  const [view, setView] = useState("search");
  const [query, setQuery] = useState("");
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Restaurar sesión guardada al abrir la app
  useEffect(() => {
    const saved = localStorage.getItem("ec_session");
    if (saved) {
      const s = JSON.parse(saved);
      setSession(s);
      sb(`perfiles?select=*&id=eq.${s.user.id}`, s).then((rows) => setPerfil(rows[0] || null)).catch(() => {});
    }
  }, []);

  const handleAuthed = (s) => {
    setSession(s);
    setShowAccountModal(false);
    sb(`perfiles?select=*&id=eq.${s.user.id}`, s).then((rows) => setPerfil(rows[0] || null)).catch(() => {});
  };

  const handleLogout = () => {
    localStorage.removeItem("ec_session");
    setSession(null);
    setPerfil(null);
  };

  const [tiendas, setTiendas] = useState([]);
  const [loadingTiendas, setLoadingTiendas] = useState(true);
  const [errorTiendas, setErrorTiendas] = useState(null);

  const [searchResults, setSearchResults] = useState({ tiendas: [], mercado: [] });
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
    sb("tiendas?select=*&order=nombre.asc")
      .then(setTiendas)
      .catch((e) => setErrorTiendas(e.message))
      .finally(() => setLoadingTiendas(false));
  }, []);

  // Búsqueda en vivo (tiendas + mercado)
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults({ tiendas: [], mercado: [] });
      return;
    }
    const q = encodeURIComponent(query.trim());
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(() => {
      Promise.all([
        sb(`inventario_tienda?select=*,tiendas(nombre,zona,direccion,telefono)&carta=ilike.*${q}*&order=precio.asc`),
        sb(`mercado_listings?select=*&carta=ilike.*${q}*&order=precio.asc`),
      ])
        .then(([inv, merc]) => setSearchResults({ tiendas: inv, mercado: merc }))
        .catch((e) => { setSearchResults({ tiendas: [], mercado: [] }); setSearchError(e.message); })
        .finally(() => setSearching(false));
    }, 350); // pequeña espera para no saturar mientras escribes
    return () => clearTimeout(t);
  }, [query]);

  // Mercado y noticias, al entrar a esas pestañas
  useEffect(() => {
    if (view === "market" && market.length === 0) {
      setLoadingMarket(true);
      sb("mercado_listings?select=*&order=created_at.desc").then(setMarket).finally(() => setLoadingMarket(false));
    }
    if (view === "news" && news.length === 0) {
      setLoadingNews(true);
      sb("noticias?select=*&order=created_at.desc").then(setNews).finally(() => setLoadingNews(false));
    }
  }, [view]);

  const openStore = (store) => {
    setSelectedStore(store);
    setView("storeDetail");
    setLoadingStoreDetail(true);
    Promise.all([
      sb(`inventario_tienda?select=*&tienda_id=eq.${store.id}`),
      sb(`sellado_tienda?select=*&tienda_id=eq.${store.id}`),
    ])
      .then(([inv, sell]) => { setStoreInventory(inv); setStoreSellado(sell); })
      .finally(() => setLoadingStoreDetail(false));
  };

  const navItems = [
    { id: "search", label: "Buscar", icon: Search },
    { id: "directory", label: "Tiendas", icon: Store },
    { id: "market", label: "Mercado", icon: ShoppingBag },
    { id: "news", label: "Anuncios y noticias", icon: Megaphone },
    ...(perfil?.tipo === "tienda" ? [{ id: "myStore", label: "Mi tienda", icon: Package }] : []),
  ];

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh", fontFamily: "'Rajdhani', sans-serif" }} className="w-full">
      <style>{FONTS}</style>

      <header style={{ borderBottom: `1px solid ${COLORS.surface2}`, background: `radial-gradient(ellipse at top, ${COLORS.surface} 0%, ${COLORS.bg} 70%)` }}
        className="px-4 sm:px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={22} color={COLORS.gold} />
            <h1 style={{ fontFamily: "'Cinzel', serif" }} className="text-2xl sm:text-3xl font-bold">
              Encuentra <span style={{ color: COLORS.cyan }}>Cartas</span>
            </h1>
          </div>
          <nav className="flex gap-2 flex-wrap items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button key={item.id} onClick={() => setView(item.id)}
                  style={{ background: active ? COLORS.surface2 : "transparent", border: `1px solid ${active ? COLORS.magenta : COLORS.surface2}`, color: active ? COLORS.magenta : COLORS.muted }}
                  className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2">
                  <Icon size={15} /> <span className="hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
            {session ? (
              <div className="flex items-center gap-2">
                <Badge color={COLORS.gold}>{perfil?.nombre || "Mi cuenta"}</Badge>
                <button onClick={handleLogout} style={{ color: COLORS.muted, border: `1px solid ${COLORS.surface2}` }} className="px-3 py-2 rounded-lg text-xs">
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAccountModal(true)} style={{ background: COLORS.gold, color: COLORS.bg }} className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <User size={15} /> Mi cuenta
              </button>
            )}
          </nav>
        </div>
      </header>

      {showAccountModal && <AccountModal onClose={() => setShowAccountModal(false)} onAuthed={handleAuthed} />}

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <div style={{ color: COLORS.gold, border: `1px solid ${COLORS.gold}55`, background: `${COLORS.gold}11` }}
          className="rounded-lg px-4 py-2 text-xs mb-6 text-center">
          🔌 Conectado en vivo a tu base de datos real de Supabase
        </div>

        {/* SEARCH */}
        {view === "search" && (
          <div>
            <div className="text-center mb-8">
              <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.violet}`, boxShadow: `0 0 24px ${COLORS.violet}44` }}
                className="max-w-xl mx-auto rounded-2xl p-2 flex items-center gap-2">
                <Search size={20} color={COLORS.violet} className="ml-2 shrink-0" />
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

            {!searching && query.trim() && searchResults.tiendas.length === 0 && searchResults.mercado.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-center py-16 text-sm">
                Nadie tiene "{query}" registrado todavía.
              </p>
            )}

            <div className="grid gap-4">
              {searchResults.tiendas.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                  className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {r.imagen_url && <img src={r.imagen_url} alt={r.carta} style={{ width: 44, height: 60, objectFit: "contain" }} />}
                    <div>
                      <div className="flex gap-2 items-center mb-1"><Badge color={COLORS.gold}>Tienda</Badge><p className="font-semibold text-lg">{r.carta}</p></div>
                      <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1">{r.tiendas?.nombre} · {r.tiendas?.zona}</p>
                    </div>
                  </div>
                  <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.gold }} className="text-2xl font-bold">${Number(r.precio).toLocaleString("es-MX")}</p>
                </div>
              ))}
              {searchResults.mercado.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                  className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {r.imagen_url && <img src={r.imagen_url} alt={r.carta} style={{ width: 44, height: 60, objectFit: "contain" }} />}
                    <div>
                      <div className="flex gap-2 items-center mb-1"><Badge color={COLORS.cyan}>Vendedor individual</Badge><p className="font-semibold text-lg">{r.carta}</p></div>
                      <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1">{r.zona}</p>
                    </div>
                  </div>
                  <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.gold }} className="text-2xl font-bold">${Number(r.precio).toLocaleString("es-MX")}</p>
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
                  <div className="flex items-start justify-between">
                    <p className="font-semibold text-lg">{store.nombre}</p>
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
            <div className="grid gap-3">
              {market.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4">
                  <p className="font-semibold">{r.carta}</p>
                  <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre} · {r.zona}</p>
                  <p style={{ color: COLORS.gold }} className="font-bold mt-1">${Number(r.precio).toLocaleString("es-MX")}</p>
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
                Todavía no has publicado ningún anuncio o noticia. Los agregas desde la tabla "noticias" en Supabase.
              </p>
            )}
            <div className="grid gap-4">
              {news.map((n) => (
                <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-5">
                  <Badge color={n.tipo === "anuncio" ? COLORS.gold : COLORS.violet}>{n.tipo}</Badge>
                  <p className="font-semibold text-lg mt-2">{n.titulo}</p>
                  <p style={{ color: COLORS.muted }} className="text-sm mt-1">{n.contenido}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MI TIENDA */}
        {view === "myStore" && session && <MyStorePanel session={session} perfil={perfil} />}

        {/* STORE DETAIL */}
        {view === "storeDetail" && selectedStore && (
          <div>
            <button onClick={() => setView("directory")} style={{ color: COLORS.muted }} className="flex items-center gap-1 text-sm mb-6">
              <ChevronLeft size={16} /> Volver
            </button>
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl p-6 mb-6">
              <h2 style={{ fontFamily: "'Cinzel', serif" }} className="text-2xl font-bold">{selectedStore.nombre}</h2>
              <p style={{ color: COLORS.muted }} className="mt-2 flex items-center gap-1 text-sm"><MapPin size={14} /> {selectedStore.direccion}</p>
              {selectedStore.telefono && <p style={{ color: COLORS.muted }} className="mt-1 flex items-center gap-1 text-sm"><Phone size={14} /> {selectedStore.telefono}</p>}
            </div>

            {loadingStoreDetail ? <Loading label="Cargando inventario..." /> : (
              <>
                <h3 style={{ color: COLORS.gold }} className="font-semibold mb-3 text-sm uppercase">Cartas sueltas</h3>
                <div className="grid gap-3 mb-8">
                  {storeInventory.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Esta tienda todavía no ha subido inventario.</p>}
                  {storeInventory.map((item) => (
                    <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-4 flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        {item.imagen_url && <img src={item.imagen_url} alt={item.carta} style={{ width: 40, height: 55, objectFit: "contain" }} />}
                        <div>
                          <p className="font-medium">{item.carta}</p>
                          <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} · {item.condicion} · {item.idioma}</p>
                        </div>
                      </div>
                      <p style={{ color: COLORS.gold }} className="font-bold">${Number(item.precio).toLocaleString("es-MX")}</p>
                    </div>
                  ))}
                </div>
                <h3 style={{ color: COLORS.cyan }} className="font-semibold mb-3 text-sm uppercase">Producto sellado</h3>
                <div className="grid gap-3">
                  {storeSellado.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Sin producto sellado registrado.</p>}
                  {storeSellado.map((item) => (
                    <div key={item.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-4 flex justify-between items-center flex-wrap gap-2">
                      <p className="font-medium">{item.producto}</p>
                      <p style={{ color: COLORS.cyan }} className="font-bold">${Number(item.precio).toLocaleString("es-MX")}</p>
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
