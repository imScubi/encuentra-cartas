import React, { useState, useEffect, useMemo } from "react";
import {
  Search, MapPin, Phone, Store, Sparkles, Package, ChevronLeft,
  User, Megaphone, Newspaper, ShoppingBag, X, Loader2, AlertCircle,
} from "lucide-react";

// ---- Conexión a Supabase (usa la anon key, es segura para el navegador) ----
const SUPABASE_URL = "https://nulypgaaekexlbxbxdwq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bHlwZ2FhZWtleGxieGJ4ZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk3OTcsImV4cCI6MjA5OTk3NTc5N30.9qxfcmUx5k1br1CH3DIFI2EplFJWYeRyg6HFeZNN7og";

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Error consultando la base de datos (${res.status})`);
  return res.json();
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

export default function EncuentraCartas() {
  const [view, setView] = useState("search");
  const [query, setQuery] = useState("");
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
          <nav className="flex gap-2 flex-wrap">
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
          </nav>
        </div>
      </header>

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
                  <div>
                    <div className="flex gap-2 items-center mb-1"><Badge color={COLORS.gold}>Tienda</Badge><p className="font-semibold text-lg">{r.carta}</p></div>
                    <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                    <p style={{ color: COLORS.muted }} className="text-xs mt-1">{r.tiendas?.nombre} · {r.tiendas?.zona}</p>
                  </div>
                  <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.gold }} className="text-2xl font-bold">${Number(r.precio).toLocaleString("es-MX")}</p>
                </div>
              ))}
              {searchResults.mercado.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                  className="rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex gap-2 items-center mb-1"><Badge color={COLORS.cyan}>Vendedor individual</Badge><p className="font-semibold text-lg">{r.carta}</p></div>
                    <p style={{ color: COLORS.muted }} className="text-sm">{r.set_nombre}</p>
                    <p style={{ color: COLORS.muted }} className="text-xs mt-1">{r.zona}</p>
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
                      <div>
                        <p className="font-medium">{item.carta}</p>
                        <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} · {item.condicion} · {item.idioma}</p>
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
