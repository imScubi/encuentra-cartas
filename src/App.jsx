import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search, MapPin, Phone, Store, Sparkles, Package, ChevronLeft,
  User, Megaphone, Newspaper, ShoppingBag, X, Loader2, AlertCircle,
  MessageCircle, Send, ExternalLink, Shield, Receipt, Menu, Bell, HelpCircle, Calendar, Star, Layers, Palette,
  ArrowUp, ArrowDown, Navigation,
} from "lucide-react";
import {
  VAPID_PUBLIC_KEY,
  setOnSesionRefrescada,
  sb, sbWrite, authSignUp, authSignIn,
  subirAvatar, subirImagenAnuncio, subirImagenABucket, subirImagenCarta,
} from "./lib/supabase.js";
import { setUidActual } from "./lib/errorReporting.jsx";
import {
  pokemonSpriteUrl, randomPokemonAvatar, obtenerListaPokemon,
  parseNumeroYSet, buscarImagenRespaldo, buscarCartaTCGdex, buscarCartasVisual,
} from "./lib/pokemonApi.js";
import {
  FONTS, USD_TO_MXN, COLORS, STORE_COLORS, colorFor, textoSobre,
  PLAN_ORDER, PLAN_INFO, planDe, limiteAlcanzado,
  BOOST_PRECIOS, estaDestacado, esCartaFavorita, conBoostPrimero,
  MODOS_COLOR, TIPOS_POKEMON_INFO, TEMA_MODO_KEY, TEMA_TIPO_KEY, aplicarTema,
  IDIOMA_OPCIONES, IDIOMA_LABEL,
} from "./theme.js";

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

// ---- Insignias por actividad (calculadas al vuelo, sin tabla nueva) ----
function calcularInsignias({ perfil, wishlist = [], carpetas = [] }) {
  const insignias = [];
  if (carpetas.length >= 1) {
    insignias.push({ emoji: "🗂️", label: "Organizado", color: COLORS.azulClaro });
  }
  if (wishlist.length >= 5) {
    insignias.push({ emoji: "📋", label: "Coleccionista", color: COLORS.violeta });
  }
  if (perfil?.created_at) {
    const dias = (Date.now() - new Date(perfil.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (dias >= 180) insignias.push({ emoji: "🕰️", label: "Veterano", color: COLORS.gold });
  }
  return insignias;
}

function InsigniasActividad({ perfil, wishlist, carpetas }) {
  const insignias = calcularInsignias({ perfil, wishlist, carpetas });
  if (!insignias.length) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {insignias.map((i) => (
        <span key={i.label} title={i.label}
          style={{ border: `1px solid ${i.color}`, color: i.color, boxShadow: `0 0 8px ${i.color}66` }}
          className="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap px-2 py-0.5 text-xs">
          {i.emoji} {i.label}
        </span>
      ))}
    </div>
  );
}

// ---- Insignia de vendedor por volumen + calidad de ventas (distinta del "Verificado" de plan pagado) ----
const NIVELES_VENDEDOR = [
  { ventasMin: 20, estrellasMin: 4.5, nombre: "Vendedor Destacado", emoji: "🏆", color: COLORS.gold },
  { ventasMin: 5, estrellasMin: 4.0, nombre: "Vendedor Confiable", emoji: "🎖️", color: COLORS.azulPalido },
];

function VendedorBadge({ ventasCompletadas, resenas, promedioEstrellas }) {
  const promedio = promedioEstrellas ?? (resenas?.length ? resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length : 0);
  const nivel = NIVELES_VENDEDOR.find((n) => ventasCompletadas >= n.ventasMin && promedio >= n.estrellasMin);
  if (!nivel) return null;
  return (
    <span
      title={`${nivel.nombre}: ${ventasCompletadas} ventas completadas, ${promedio.toFixed(1)}★ de promedio`}
      style={{ border: `1px solid ${nivel.color}`, color: nivel.color, boxShadow: `0 0 8px ${nivel.color}66` }}
      className="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap px-2 py-0.5 text-xs"
    >
      {nivel.emoji} {nivel.nombre}
    </span>
  );
}

function MiembroDesde({ perfil }) {
  if (!perfil?.created_at) return null;
  const fecha = new Date(perfil.created_at).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return <p style={{ color: COLORS.muted }} className="text-xs">Miembro desde {fecha}</p>;
}

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
      const res = await fetch("/api/mercadopago/gestionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "crear_boost", perfilId: session.user.id, tabla, listingId: item.id, dias, email: session.user.email }),
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

// ---- Reportar publicaciones o perfiles sospechosos ----
const MOTIVOS_REPORTE = [
  "Precio o publicación sospechosa",
  "Posible estafa",
  "Contenido inapropiado",
  "Cuenta falsa o suplantación",
  "Otro",
];

function ReportarModal({ session, tipo, tablaObjetivo, objetivoId, objetivoPerfilId, objetivoNombre, onClose }) {
  const [motivo, setMotivo] = useState(MOTIVOS_REPORTE[0]);
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    setEnviando(true); setError(null);
    try {
      await sbWrite("POST", "reportes", {
        reportante_perfil_id: session.user.id,
        tipo,
        tabla_objetivo: tablaObjetivo,
        objetivo_id: objetivoId,
        objetivo_perfil_id: objetivoPerfilId || null,
        objetivo_nombre: objetivoNombre || null,
        motivo,
        detalle: detalle.trim() || null,
      }, session);
      setEnviado(true);
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulMedio}66` }} className="w-full max-w-sm rounded-2xl p-6 relative">
        <button onClick={onClose} style={{ color: COLORS.muted }} className="absolute top-4 right-4"><X size={18} /></button>
        {enviado ? (
          <>
            <p className="font-semibold mb-2">🚩 Reporte enviado</p>
            <p style={{ color: COLORS.muted }} className="text-sm">Gracias, el equipo lo va a revisar.</p>
          </>
        ) : (
          <>
            <p className="font-semibold mb-3">Reportar {objetivoNombre ? `"${objetivoNombre}"` : ""}</p>
            {error && <div className="mb-3"><ErrorBox message={error} /></div>}
            <div className="grid gap-2 mb-3">
              {MOTIVOS_REPORTE.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="motivo-reporte" checked={motivo === m} onChange={() => setMotivo(m)} />
                  {m}
                </label>
              ))}
            </div>
            <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Detalle (opcional)"
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3" rows={3} />
            <button onClick={enviar} disabled={enviando} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="w-full rounded-lg py-2 text-sm font-semibold">
              {enviando ? "Enviando..." : "Enviar reporte"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ReportarBoton({ session, tipo, tablaObjetivo, objetivoId, objetivoPerfilId, objetivoNombre }) {
  const [abierto, setAbierto] = useState(false);
  if (!session) return null;
  return (
    <>
      <button onClick={() => setAbierto(true)} title="Reportar" style={{ color: COLORS.muted }} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 hover:brightness-125 whitespace-nowrap">
        🚩 Reportar
      </button>
      {abierto && (
        <ReportarModal session={session} tipo={tipo} tablaObjetivo={tablaObjetivo} objetivoId={objetivoId} objetivoPerfilId={objetivoPerfilId} objetivoNombre={objetivoNombre} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}

// ---- Marcar una publicación como vendida (venta pendiente de confirmar por el comprador) ----
function BuscadorComprador({ session, excluirId, onSelect }) {
  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) { setResultados([]); return; }
    setBuscando(true);
    const t = setTimeout(() => {
      sb(`perfiles?select=id,nombre,avatar_url,tipo&nombre=ilike.*${encodeURIComponent(texto)}*&id=neq.${excluirId}&limit=8`, session)
        .then(setResultados)
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca al comprador por su nombre..."
        style={inputStyle} className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" />
      {buscando && <p style={{ color: COLORS.muted }} className="text-xs">Buscando...</p>}
      {!buscando && q.trim().length >= 2 && resultados.length === 0 && (
        <p style={{ color: COLORS.muted }} className="text-xs">Nadie con ese nombre. Pídele que revise cómo está registrado.</p>
      )}
      <div className="grid gap-1">
        {resultados.map((p) => (
          <button key={p.id} onClick={() => onSelect(p)}
            style={{ border: `1px solid ${COLORS.surface2}` }}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:brightness-125">
            <AvatarImg url={p.avatar_url} size={24} />
            <p className="text-sm">{p.nombre}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function MarcarVendidaModal({ session, tabla, itemId, descripcion, precio, onClose, onVendida }) {
  const [comprador, setComprador] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const confirmar = async () => {
    setEnviando(true); setError(null);
    try {
      await sbWrite("POST", "ventas", {
        vendedor_perfil_id: session.user.id,
        comprador_perfil_id: comprador.id,
        tabla_origen: tabla,
        listing_id: itemId,
        descripcion,
        precio: precio || null,
      }, session);
      await sbWrite("DELETE", `${tabla}?id=eq.${itemId}`, {}, session);
      onVendida?.();
      onClose();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulMedio}66` }} className="w-full max-w-sm rounded-2xl p-6 relative">
        <button onClick={onClose} style={{ color: COLORS.muted }} className="absolute top-4 right-4"><X size={18} /></button>
        <p className="font-semibold mb-1">Marcar como vendida</p>
        <p style={{ color: COLORS.muted }} className="text-sm mb-3">{descripcion}</p>
        {error && <div className="mb-3"><ErrorBox message={error} /></div>}
        {!comprador ? (
          <BuscadorComprador session={session} excluirId={session.user.id} onSelect={setComprador} />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4" style={{ border: `1px solid ${COLORS.surface2}` }}>
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 flex-1">
                <AvatarImg url={comprador.avatar_url} size={24} />
                <p className="text-sm">Vendida a <span className="font-semibold">{comprador.nombre}</span></p>
              </div>
              <button onClick={() => setComprador(null)} style={{ color: COLORS.muted }} className="text-xs px-2">Cambiar</button>
            </div>
            <p style={{ color: COLORS.muted }} className="text-xs mb-3">
              Le mandaremos un aviso a {comprador.nombre} para que confirme la compra. Cuando confirme, contará como venta completada y podrán calificarse mutuamente.
            </p>
            <button onClick={confirmar} disabled={enviando} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="w-full rounded-lg py-2 text-sm font-semibold">
              {enviando ? "Enviando..." : "Confirmar venta"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MarcarVendidaBoton({ session, tabla, itemId, descripcion, precio, onVendida }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="text-xs px-2 py-1 rounded-lg whitespace-nowrap">
        ✅ Vendida
      </button>
      {abierto && (
        <MarcarVendidaModal session={session} tabla={tabla} itemId={itemId} descripcion={descripcion} precio={precio} onClose={() => setAbierto(false)} onVendida={onVendida} />
      )}
    </>
  );
}

// ---- Seguir tiendas o vendedores ----
function SeguirBoton({ session, seguidoPerfilId }) {
  const [siguiendo, setSiguiendo] = useState(null); // null = cargando
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    sb(`seguidores?select=id&perfil_id=eq.${session.user.id}&seguido_perfil_id=eq.${seguidoPerfilId}`, session)
      .then((rows) => setSiguiendo(rows.length > 0))
      .catch(() => setSiguiendo(false));
  }, [session.user.id, seguidoPerfilId]);

  const alternar = async () => {
    setEnviando(true);
    try {
      if (siguiendo) {
        await sbWrite("DELETE", `seguidores?perfil_id=eq.${session.user.id}&seguido_perfil_id=eq.${seguidoPerfilId}`, {}, session);
        setSiguiendo(false);
      } else {
        await sbWrite("POST", "seguidores", { perfil_id: session.user.id, seguido_perfil_id: seguidoPerfilId }, session);
        setSiguiendo(true);
      }
    } catch {} finally { setEnviando(false); }
  };

  if (siguiendo === null) return null;
  return (
    <button onClick={alternar} disabled={enviando}
      style={siguiendo ? { color: COLORS.muted, border: `1px solid ${COLORS.surface2}` } : { background: COLORS.azulClaro, color: COLORS.bg }}
      className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
      {siguiendo ? "Siguiendo ✓" : "+ Seguir"}
    </button>
  );
}

// ---- Reseñas de 1 a 5 estrellas ----
function EstrellasPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} style={{ color: n <= value ? COLORS.gold : COLORS.surface2 }}>
          <Star size={26} fill={n <= value ? COLORS.gold : "none"} />
        </button>
      ))}
    </div>
  );
}

function EstrellasDisplay({ valor, size = 14 }) {
  const redondeado = Math.round(valor || 0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={COLORS.gold} fill={n <= redondeado ? COLORS.gold : "none"} />
      ))}
    </div>
  );
}

function CalificarModal({ session, ventaId, objetivoPerfilId, objetivoNombre, onClose, onCalificado }) {
  const [estrellas, setEstrellas] = useState(5);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const enviar = async () => {
    setEnviando(true); setError(null);
    try {
      await sbWrite("POST", "resenas", {
        venta_id: ventaId,
        autor_perfil_id: session.user.id,
        objetivo_perfil_id: objetivoPerfilId,
        estrellas,
        comentario: comentario.trim() || null,
      }, session);
      onCalificado?.();
      onClose();
    } catch (e) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulMedio}66` }} className="w-full max-w-sm rounded-2xl p-6 relative">
        <button onClick={onClose} style={{ color: COLORS.muted }} className="absolute top-4 right-4"><X size={18} /></button>
        <p className="font-semibold mb-3">Calificar a {objetivoNombre || "esta persona"}</p>
        {error && <div className="mb-3"><ErrorBox message={error} /></div>}
        <div className="mb-3"><EstrellasPicker value={estrellas} onChange={setEstrellas} /></div>
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario (opcional)"
          style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-3" rows={3} />
        <button onClick={enviar} disabled={enviando} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="w-full rounded-lg py-2 text-sm font-semibold">
          {enviando ? "Enviando..." : "Enviar calificación"}
        </button>
      </div>
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

// ---- Selector de idioma de la carta: obligatorio al publicar, para que
// el comprador sepa en qué idioma está sin tener que preguntar ----
function IdiomaSelector({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {IDIOMA_OPCIONES.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          style={{
            background: value === o.key ? COLORS.surface2 : "transparent",
            border: `1px solid ${value === o.key ? COLORS.violeta : COLORS.surface2}`,
            color: value === o.key ? COLORS.violeta : COLORS.muted,
          }}
          className="rounded-lg px-3 py-2 text-sm font-semibold">
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Badge de idioma para mostrar en cualquier publicación que ya tenga el campo lleno.
function IdiomaBadge({ idioma }) {
  if (!idioma || !IDIOMA_LABEL[idioma]) return null;
  return <Badge color={COLORS.violeta}>{IDIOMA_LABEL[idioma]}</Badge>;
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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      buscarCartasVisual(q.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const seleccionar = (c) => {
    onSelect({
      name: c.name,
      set_nombre: `${c.setName} ${c.localId}${c.setTotal ? "/" + c.setTotal : ""}`.trim(),
      card_api_id: c.id,
      imagen_url: c.image || "",
      precio_ref_mxn: c.precioRefMxn,
    });
    setQ(""); setResults([]); setOpen(false);
  };

  return (
    <div className="relative">
      <input
        placeholder='Nombre, número (ej. "016" o "#016") o set (ej. Sprigatito Journey Together)'
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }}
        className="rounded-lg px-2 py-2 text-sm w-full"
      />
      {open && q.trim().length >= 3 && (
        <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66` }}
          className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto rounded-lg shadow-xl p-2">
          {loading && <p style={{ color: COLORS.muted }} className="text-xs p-2">Buscando en el catálogo oficial...</p>}
          {!loading && results.length === 0 && (
            <p style={{ color: COLORS.muted }} className="text-xs p-2">Sin resultados. Prueba con otro nombre, número o set.</p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {results.map((c) => (
              <button key={c.id} type="button"
                onClick={() => seleccionar(c)}
                className="flex flex-col items-center gap-1 rounded-lg p-1.5 text-center hover:brightness-125"
                style={{ background: "transparent" }}>
                <div style={{ background: COLORS.bg }} className="w-full aspect-[63/88] rounded-md overflow-hidden flex items-center justify-center">
                  {c.image ? (
                    <img src={c.image} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} loading="lazy" />
                  ) : (
                    <Package size={20} color={COLORS.muted} />
                  )}
                </div>
                <p className="text-xs font-medium leading-tight line-clamp-2">{c.name}</p>
                <p style={{ color: COLORS.muted }} className="text-[10px] leading-tight line-clamp-1">{c.setName}</p>
                <p style={{ color: COLORS.muted }} className="text-[10px]">#{c.localId}</p>
              </button>
            ))}
          </div>
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

  const vacio = { tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "", precio: "", precio_antes: "", zona: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null };
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
    if (!nueva.carta || !nueva.precio || !nueva.zona || (tipo === "carta" && !nueva.idioma)) return;
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
        ...(tipo === "carta" ? { idioma: nueva.idioma } : {}),
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
            <div>
              <p style={{ color: COLORS.muted }} className="text-xs mb-1">Idioma de la carta (obligatorio)</p>
              <IdiomaSelector value={nueva.idioma} onChange={(v) => setNueva({ ...nueva, idioma: v })} />
            </div>
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
          <button onClick={agregar} disabled={saving || alLimite || (tipo === "carta" && !nueva.idioma)} style={{ background: COLORS.azul, color: COLORS.text, opacity: alLimite ? 0.5 : 1 }} className="rounded-lg py-2 text-sm font-semibold">
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
                {item.tipo !== "sellado" && <IdiomaBadge idioma={item.idioma} />}
                <BoostBadge item={item} />
              </div>
              <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} {item.condicion ? `· ${item.condicion}` : ""} · {item.zona}</p>
            </div>
            <input type="number" defaultValue={item.precio} onBlur={(e) => actualizar(item.id, "precio", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio" />
            <input type="number" defaultValue={item.precio_antes || ""} onBlur={(e) => actualizar(item.id, "precio_antes", e.target.value)} style={inputStyle} className="rounded px-2 py-1 text-sm w-24" title="Precio antes (oferta, deja vacío para quitarla)" placeholder="Antes" />
            {!item.imagen_url && <ReintentarImagen nombre={item.carta} setNombre={item.set_nombre} onEncontrada={async (url) => { await actualizar(item.id, "imagen_url", url); cargar(); }} />}
            <SubirFotoManual session={session} label={item.imagen_url ? "Cambiar foto" : "📷 Sin foto"} onSubido={async (url) => { await actualizar(item.id, "imagen_url", url); cargar(); }} />
            <BoostButton session={session} tabla="mercado_listings" item={item} onBoosted={cargar} />
            <MarcarVendidaBoton session={session} tabla="mercado_listings" itemId={item.id} descripcion={`${item.carta}${item.set_nombre ? ` (${item.set_nombre})` : ""}`} precio={item.precio} onVendida={cargar} />
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

function AdminPanel({ session, onVerPerfil, onEntrarComoSubperfil }) {
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

  // ---- Crear tienda ----
  const tiendaVacia = { nombre: "", direccion: "", zona: "", telefono: "", vincularCon: "", lat: "", lng: "" };
  const [nuevaTienda, setNuevaTienda] = useState(tiendaVacia);
  const [creandoTienda, setCreandoTienda] = useState(false);
  const [errorCrear, setErrorCrear] = useState(null);
  const [okCrear, setOkCrear] = useState(null);
  const [buscandoUbicacionNueva, setBuscandoUbicacionNueva] = useState(false);
  const [buscandoCoordsNueva, setBuscandoCoordsNueva] = useState(false);

  const usarMiUbicacionNuevaTienda = () => {
    if (!navigator.geolocation) { setErrorCrear("Tu navegador no soporta geolocalización."); return; }
    setBuscandoUbicacionNueva(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setNuevaTienda((t) => ({ ...t, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) })); setBuscandoUbicacionNueva(false); },
      () => { setErrorCrear("No pudimos obtener tu ubicación (¿diste permiso?)."); setBuscandoUbicacionNueva(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const buscarCoordsNuevaTienda = async () => {
    if (!nuevaTienda.direccion.trim()) { setErrorCrear("Escribe la dirección primero."); return; }
    setBuscandoCoordsNueva(true); setErrorCrear(null);
    try {
      const { lat, lng } = await buscarCoordenadasPorDireccion(nuevaTienda.direccion.trim());
      setNuevaTienda((t) => ({ ...t, lat: String(lat), lng: String(lng) }));
    } catch (e) { setErrorCrear(e.message); } finally { setBuscandoCoordsNueva(false); }
  };

  const crearTienda = async () => {
    if (!nuevaTienda.nombre.trim() || !nuevaTienda.direccion.trim()) return;
    setCreandoTienda(true); setErrorCrear(null); setOkCrear(null);
    try {
      await sbWrite("POST", "tiendas", {
        nombre: nuevaTienda.nombre.trim(),
        direccion: nuevaTienda.direccion.trim(),
        zona: nuevaTienda.zona.trim() || null,
        telefono: nuevaTienda.telefono.trim() || null,
        perfil_id: nuevaTienda.vincularCon || null,
        lat: nuevaTienda.lat ? Number(nuevaTienda.lat) : null,
        lng: nuevaTienda.lng ? Number(nuevaTienda.lng) : null,
      }, session);
      setOkCrear(`Tienda "${nuevaTienda.nombre.trim()}" creada.`);
      setNuevaTienda(tiendaVacia);
      cargar();
      cargarTodasTiendas();
    } catch (e) { setErrorCrear(e.message); } finally { setCreandoTienda(false); }
  };

  // ---- Editar información de una tienda ya creada (nombre, dirección, zona, teléfono, lat/lng) ----
  const [editandoTienda, setEditandoTienda] = useState(null); // tienda id
  const [tiendaEdit, setTiendaEdit] = useState({ nombre: "", direccion: "", zona: "", telefono: "", lat: "", lng: "" });
  const [guardandoTienda, setGuardandoTienda] = useState(null);

  const abrirEditorTienda = (t) => {
    setEditandoTienda(t.id);
    setTiendaEdit({
      nombre: t.nombre || "",
      direccion: t.direccion || "",
      zona: t.zona || "",
      telefono: t.telefono || "",
      lat: t.lat != null ? String(t.lat) : "",
      lng: t.lng != null ? String(t.lng) : "",
    });
  };

  const usarMiUbicacionEditarTienda = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setTiendaEdit((t) => ({ ...t, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) }));
    });
  };

  const [buscandoCoordsEdit, setBuscandoCoordsEdit] = useState(false);
  const buscarCoordsTiendaEdit = async () => {
    if (!tiendaEdit.direccion.trim()) { setError("Escribe la dirección primero."); return; }
    setBuscandoCoordsEdit(true); setError(null);
    try {
      const { lat, lng } = await buscarCoordenadasPorDireccion(tiendaEdit.direccion.trim());
      setTiendaEdit((t) => ({ ...t, lat: String(lat), lng: String(lng) }));
    } catch (e) { setError(e.message); } finally { setBuscandoCoordsEdit(false); }
  };

  const guardarTiendaEditada = async (tiendaId) => {
    if (!tiendaEdit.nombre.trim() || !tiendaEdit.direccion.trim()) return;
    setGuardandoTienda(tiendaId);
    try {
      await sbWrite("PATCH", `tiendas?id=eq.${tiendaId}`, {
        nombre: tiendaEdit.nombre.trim(),
        direccion: tiendaEdit.direccion.trim(),
        zona: tiendaEdit.zona.trim() || null,
        telefono: tiendaEdit.telefono.trim() || null,
        lat: tiendaEdit.lat ? Number(tiendaEdit.lat) : null,
        lng: tiendaEdit.lng ? Number(tiendaEdit.lng) : null,
      }, session);
      setEditandoTienda(null);
      cargar();
      cargarTodasTiendas();
    } catch (e) { setError(e.message); } finally { setGuardandoTienda(null); }
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

  const [publicados, setPublicados] = useState([]);

  const cargarAnuncios = () => {
    setLoadingAnuncios(true);
    Promise.all([
      sb(`noticias?select=*,tiendas(nombre,perfiles(avatar_url))&estado=eq.pendiente&order=created_at.desc`, session),
      sb(`noticias?select=*,tiendas(nombre,perfiles(avatar_url))&estado=eq.programado&order=fecha_publicacion.asc`, session),
      sb(`noticias?select=*,tiendas(nombre,perfiles(avatar_url))&estado=eq.publicado&order=fecha_publicacion.desc&limit=50`, session),
    ])
      .then(([p, prog, pub]) => { setPendientes(p); setProgramados(prog); setPublicados(pub); })
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

  // ---- Editar o borrar un anuncio ya publicado ----
  const [editandoAnuncio, setEditandoAnuncio] = useState(null); // id
  const [anuncioEdit, setAnuncioEdit] = useState({ titulo: "", contenido: "", imagen_url: "" });
  const [nuevaImagenEdit, setNuevaImagenEdit] = useState(null);
  const [nuevaImagenEditPreview, setNuevaImagenEditPreview] = useState(null);
  const [guardandoAnuncio, setGuardandoAnuncio] = useState(null);
  const [borrandoAnuncio, setBorrandoAnuncio] = useState(null);

  const abrirEditorAnuncio = (n) => {
    setEditandoAnuncio(n.id);
    setAnuncioEdit({ titulo: n.titulo || "", contenido: n.contenido || "", imagen_url: n.imagen_url || "" });
    setNuevaImagenEdit(null);
    setNuevaImagenEditPreview(null);
  };

  const guardarAnuncioEditado = async (id) => {
    if (!anuncioEdit.titulo.trim() || !anuncioEdit.contenido.trim()) return;
    setGuardandoAnuncio(id);
    try {
      const imagen_url = nuevaImagenEdit ? await subirImagenAnuncio(nuevaImagenEdit, session) : anuncioEdit.imagen_url || null;
      await sbWrite("PATCH", `noticias?id=eq.${id}`, {
        titulo: anuncioEdit.titulo.trim(),
        contenido: anuncioEdit.contenido.trim(),
        imagen_url,
      }, session);
      setEditandoAnuncio(null);
      cargarAnuncios();
    } catch (e) { setErrorAnuncio(e.message); } finally { setGuardandoAnuncio(null); }
  };

  const borrarAnuncio = async (n) => {
    if (!window.confirm(`¿Borrar el anuncio "${n.titulo}"? Esto no se puede deshacer.`)) return;
    setBorrandoAnuncio(n.id);
    try {
      await sbWrite("DELETE", `noticias?id=eq.${n.id}`, {}, session);
      if (editandoAnuncio === n.id) setEditandoAnuncio(null);
      cargarAnuncios();
    } catch (e) { setErrorAnuncio(e.message); } finally { setBorrandoAnuncio(null); }
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

  // ---- Reportes de publicaciones/perfiles ----
  const [reportes, setReportes] = useState([]);
  const [loadingReportes, setLoadingReportes] = useState(true);
  const [resolviendoReporte, setResolviendoReporte] = useState(null);

  const cargarReportes = () => {
    setLoadingReportes(true);
    sb(`reportes?select=*,reportante:reportante_perfil_id(nombre,email),objetivo_perfil:objetivo_perfil_id(nombre,email)&estado=eq.pendiente&order=created_at.desc&limit=50`, session)
      .then(setReportes)
      .catch(() => {})
      .finally(() => setLoadingReportes(false));
  };

  useEffect(() => { cargarReportes(); }, []);

  const resolverReporte = async (id, estado) => {
    setResolviendoReporte(id);
    try {
      await sbWrite("PATCH", `reportes?id=eq.${id}`, { estado }, session);
      setReportes((prev) => prev.filter((r) => r.id !== id));
    } catch {} finally { setResolviendoReporte(null); }
  };

  // ---- Vendedores: reseñas y tratos realizados de cada quien ----
  const [vendedores, setVendedores] = useState([]);
  const [loadingVendedores, setLoadingVendedores] = useState(true);

  const cargarVendedores = () => {
    setLoadingVendedores(true);
    Promise.all([
      sb(`perfiles?select=id,nombre,tipo,avatar_url,plan`, session),
      sb(`ventas?select=vendedor_perfil_id&estado=eq.confirmada`, session),
      sb(`resenas?select=objetivo_perfil_id,estrellas`, session),
    ])
      .then(([perfiles, ventas, resenas]) => {
        const ventasPorPerfil = {};
        ventas.forEach((v) => { ventasPorPerfil[v.vendedor_perfil_id] = (ventasPorPerfil[v.vendedor_perfil_id] || 0) + 1; });
        const resenasPorPerfil = {};
        resenas.forEach((r) => {
          if (!resenasPorPerfil[r.objetivo_perfil_id]) resenasPorPerfil[r.objetivo_perfil_id] = [];
          resenasPorPerfil[r.objetivo_perfil_id].push(r.estrellas);
        });
        const combinado = perfiles.map((p) => {
          const misResenas = resenasPorPerfil[p.id] || [];
          return {
            ...p,
            ventasConfirmadas: ventasPorPerfil[p.id] || 0,
            numResenas: misResenas.length,
            promedioEstrellas: misResenas.length ? misResenas.reduce((s, e) => s + e, 0) / misResenas.length : 0,
          };
        });
        combinado.sort((a, b) => b.ventasConfirmadas - a.ventasConfirmadas);
        setVendedores(combinado);
      })
      .catch(() => {})
      .finally(() => setLoadingVendedores(false));
  };

  useEffect(() => { cargarVendedores(); }, []);

  // ---- Todas las tiendas (para detectar duplicadas y borrar) ----
  const [todasTiendas, setTodasTiendas] = useState([]);
  const [loadingTodasTiendas, setLoadingTodasTiendas] = useState(true);
  const [borrandoTienda, setBorrandoTienda] = useState(null);
  const [cambiandoAmatista, setCambiandoAmatista] = useState(null);

  const cargarTodasTiendas = () => {
    setLoadingTodasTiendas(true);
    sb(`tiendas?select=*,perfiles(plan)&order=nombre.asc`, session)
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

  const toggleAmatista = async (t) => {
    if (!t.perfil_id) return;
    const tieneAmatista = t.perfiles?.plan === "ultraball";
    setCambiandoAmatista(t.id);
    try {
      await sbWrite("PATCH", `perfiles?id=eq.${t.perfil_id}`, {
        plan: tieneAmatista ? "pokeball" : "ultraball",
        plan_vence: null,
      }, session);
      setTodasTiendas((prev) => prev.map((x) => (x.id === t.id ? { ...x, perfiles: { ...x.perfiles, plan: tieneAmatista ? "pokeball" : "ultraball" } } : x)));
    } catch (e) { setError(e.message); } finally { setCambiandoAmatista(null); }
  };

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

  // ---- Sub-perfiles: cuentas que este admin administra libremente, sin correo propio ----
  const [subperfiles, setSubperfiles] = useState([]);
  const [loadingSubperfiles, setLoadingSubperfiles] = useState(true);
  const [nombreSubperfil, setNombreSubperfil] = useState("");
  const [tipoSubperfil, setTipoSubperfil] = useState("individual");
  const [creandoSubperfil, setCreandoSubperfil] = useState(false);
  const [errorSubperfil, setErrorSubperfil] = useState(null);
  const [cambiandoPlanSub, setCambiandoPlanSub] = useState(null);
  const [entrandoSub, setEntrandoSub] = useState(null);

  const cargarSubperfiles = () => {
    setLoadingSubperfiles(true);
    sb(`perfiles?select=id,nombre,tipo,plan,plan_vence&gestionado_por=eq.${session.user.id}&order=nombre.asc`, session)
      .then(setSubperfiles)
      .catch((e) => setErrorSubperfil(e.message))
      .finally(() => setLoadingSubperfiles(false));
  };

  useEffect(() => { cargarSubperfiles(); }, []);

  const crearSubperfil = async () => {
    if (!nombreSubperfil.trim()) return;
    setCreandoSubperfil(true); setErrorSubperfil(null);
    try {
      const res = await fetch("/api/admin/subperfiles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ accion: "crear", nombre: nombreSubperfil.trim(), tipo: tipoSubperfil }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el sub-perfil");
      setNombreSubperfil("");
      cargarSubperfiles();
    } catch (e) { setErrorSubperfil(e.message); } finally { setCreandoSubperfil(false); }
  };

  const cambiarPlanSub = async (subperfilId, nuevoPlan) => {
    setCambiandoPlanSub(subperfilId);
    try {
      await sbWrite("PATCH", `perfiles?id=eq.${subperfilId}`, { plan: nuevoPlan, plan_vence: null }, session);
      setSubperfiles((prev) => prev.map((p) => (p.id === subperfilId ? { ...p, plan: nuevoPlan } : p)));
    } catch (e) { setErrorSubperfil(e.message); } finally { setCambiandoPlanSub(null); }
  };

  const entrarComoSub = async (subperfilId) => {
    setEntrandoSub(subperfilId); setErrorSubperfil(null);
    try {
      const res = await fetch("/api/admin/subperfiles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ accion: "entrar", subperfilId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo entrar al sub-perfil");
      onEntrarComoSubperfil(data.session);
    } catch (e) { setErrorSubperfil(e.message); } finally { setEntrandoSub(null); }
  };

  if (loading) return <Loading label="Cargando panel de administración..." />;

  const tabs = [
    { id: "planes", label: "Planes" },
    { id: "tiendas", label: "Tiendas" },
    { id: "subperfiles", label: "Sub-perfiles" },
    { id: "anuncios", label: "Anuncios" },
    { id: "publicaciones", label: "Publicaciones" },
    { id: "reportes", label: `Reportes${reportes.length ? ` (${reportes.length})` : ""}` },
    { id: "vendedores", label: "Vendedores" },
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
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Crear tienda</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-4">
            Da de alta una tienda nueva en el directorio con su nombre y dirección (la dirección se muestra sola en el mapa del perfil de la tienda, no requiere nada más). Opcionalmente puedes vincularla de una vez con una cuenta de tipo tienda.
          </p>
          {errorCrear && <div className="mb-4"><ErrorBox message={errorCrear} /></div>}
          {okCrear && <p style={{ color: COLORS.azulPalido }} className="text-xs mb-3">{okCrear}</p>}
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-8 grid gap-2">
            <input placeholder="Nombre de la tienda" value={nuevaTienda.nombre}
              onChange={(e) => setNuevaTienda({ ...nuevaTienda, nombre: e.target.value })}
              style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Dirección completa (calle, número, colonia, ciudad)" value={nuevaTienda.direccion}
              onChange={(e) => setNuevaTienda({ ...nuevaTienda, direccion: e.target.value })}
              style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
            <div className="grid sm:grid-cols-2 gap-2">
              <input placeholder="Zona (ej. Centro, San Pedro)" value={nuevaTienda.zona}
                onChange={(e) => setNuevaTienda({ ...nuevaTienda, zona: e.target.value })}
                style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
              <input placeholder="Teléfono (opcional)" value={nuevaTienda.telefono}
                onChange={(e) => setNuevaTienda({ ...nuevaTienda, telefono: e.target.value })}
                style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
            </div>
            <button type="button" onClick={buscarCoordsNuevaTienda} disabled={buscandoCoordsNueva || !nuevaTienda.direccion.trim()}
              style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
              className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap">
              📍 {buscandoCoordsNueva ? "Buscando coordenadas..." : "Buscar coordenadas por la dirección"}
            </button>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input placeholder="Latitud (opcional)" value={nuevaTienda.lat}
                onChange={(e) => setNuevaTienda({ ...nuevaTienda, lat: e.target.value })}
                style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
              <input placeholder="Longitud (opcional)" value={nuevaTienda.lng}
                onChange={(e) => setNuevaTienda({ ...nuevaTienda, lng: e.target.value })}
                style={inputStyle} className="rounded-lg px-2 py-2 text-sm" />
              <button type="button" onClick={usarMiUbicacionNuevaTienda} disabled={buscandoUbicacionNueva}
                style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-1 whitespace-nowrap">
                <Navigation size={12} /> {buscandoUbicacionNueva ? "Ubicando..." : "Usar mi ubicación"}
              </button>
            </div>
            <p style={{ color: COLORS.muted }} className="text-xs -mt-1">
              La latitud/longitud sirven para el filtro de "tienda más cercana" (Zafiro+). Escribe la dirección arriba y dale "Buscar coordenadas" para llenarlas solas, o usa "Usar mi ubicación" si estás físicamente en la tienda.
            </p>
            <select value={nuevaTienda.vincularCon} onChange={(e) => setNuevaTienda({ ...nuevaTienda, vincularCon: e.target.value })}
              style={inputStyle} className="rounded-lg px-2 py-2 text-sm">
              <option value="">Vincular con una cuenta ahora (opcional, puedes hacerlo después)</option>
              {perfilesDisponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button onClick={crearTienda} disabled={creandoTienda || !nuevaTienda.nombre.trim() || !nuevaTienda.direccion.trim()}
              style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg py-2 text-sm font-semibold">
              {creandoTienda ? "Creando..." : "Crear tienda"}
            </button>
          </div>

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
                  <div key={t.id} style={{ background: COLORS.surface, border: `1px solid ${esDuplicada ? "#C24444" : COLORS.surface2}` }} className="rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="font-medium text-sm">{t.nombre} {esDuplicada && <span style={{ color: "#C24444" }} className="text-xs font-semibold">· posible duplicado</span>}</p>
                        <p style={{ color: COLORS.muted }} className="text-xs">
                          {t.direccion}{t.zona ? ` · ${t.zona}` : ""}{t.perfil_id ? "" : " · sin cuenta vinculada"}
                          {t.lat && t.lng ? " · 📍 con ubicación" : " · sin ubicación"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => (editandoTienda === t.id ? setEditandoTienda(null) : abrirEditorTienda(t))}
                          style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap flex items-center gap-1">
                          ✏️ Editar
                        </button>
                        {t.perfil_id && (
                          <button onClick={() => toggleAmatista(t)} disabled={cambiandoAmatista === t.id}
                            style={{ color: COLORS.violeta, border: `1px solid ${COLORS.violeta}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                            {cambiandoAmatista === t.id ? "..." : t.perfiles?.plan === "ultraball" ? "🟣 Quitar Amatista" : "🟣 Dar Amatista"}
                          </button>
                        )}
                        <button onClick={() => borrarTienda(t)} disabled={borrandoTienda === t.id}
                          style={{ color: "#C24444", border: "1px solid #C2444455" }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                          {borrandoTienda === t.id ? "Borrando..." : "Borrar tienda"}
                        </button>
                      </div>
                    </div>
                    {editandoTienda === t.id && (
                      <div className="grid gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${COLORS.surface2}` }}>
                        <input placeholder="Nombre de la tienda" value={tiendaEdit.nombre}
                          onChange={(e) => setTiendaEdit({ ...tiendaEdit, nombre: e.target.value })}
                          style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs" />
                        <input placeholder="Dirección completa" value={tiendaEdit.direccion}
                          onChange={(e) => setTiendaEdit({ ...tiendaEdit, direccion: e.target.value })}
                          style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs" />
                        <div className="grid sm:grid-cols-2 gap-2">
                          <input placeholder="Zona" value={tiendaEdit.zona}
                            onChange={(e) => setTiendaEdit({ ...tiendaEdit, zona: e.target.value })}
                            style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs" />
                          <input placeholder="Teléfono" value={tiendaEdit.telefono}
                            onChange={(e) => setTiendaEdit({ ...tiendaEdit, telefono: e.target.value })}
                            style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs" />
                        </div>
                        <button onClick={buscarCoordsTiendaEdit} disabled={buscandoCoordsEdit || !tiendaEdit.direccion.trim()}
                          style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center justify-center gap-1">
                          📍 {buscandoCoordsEdit ? "Buscando coordenadas..." : "Buscar coordenadas por la dirección"}
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <input placeholder="Latitud" value={tiendaEdit.lat}
                            onChange={(e) => setTiendaEdit({ ...tiendaEdit, lat: e.target.value })}
                            style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs w-28" />
                          <input placeholder="Longitud" value={tiendaEdit.lng}
                            onChange={(e) => setTiendaEdit({ ...tiendaEdit, lng: e.target.value })}
                            style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs w-28" />
                          <button onClick={usarMiUbicacionEditarTienda} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-2 py-1.5 text-xs font-semibold flex items-center gap-1">
                            <Navigation size={12} /> Mi ubicación
                          </button>
                          <button onClick={() => guardarTiendaEditada(t.id)} disabled={guardandoTienda === t.id || !tiendaEdit.nombre.trim() || !tiendaEdit.direccion.trim()}
                            style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                            {guardandoTienda === t.id ? "Guardando..." : "Guardar cambios"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tabAdmin === "subperfiles" && (
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Sub-perfiles</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-6">
            Cuentas de verdad que tú administras, sin necesitar un correo propio para cada una. Sirven, por ejemplo, para poblar el Mercado con publicaciones orgánicas. Puedes cambiarles el plan y "entrar" a usarlas como si fueras esa cuenta.
          </p>
          {errorSubperfil && <div className="mb-4"><ErrorBox message={errorSubperfil} /></div>}

          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-8 grid gap-2 sm:grid-cols-[1fr_auto_auto] items-start">
            <input placeholder="Nombre del sub-perfil" value={nombreSubperfil} onChange={(e) => setNombreSubperfil(e.target.value)}
              style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
            <select value={tipoSubperfil} onChange={(e) => setTipoSubperfil(e.target.value)} style={inputStyle} className="rounded-lg px-2 py-2 text-sm">
              <option value="individual">Individual</option>
              <option value="tienda">Tienda</option>
            </select>
            <button onClick={crearSubperfil} disabled={creandoSubperfil || !nombreSubperfil.trim()}
              style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
              {creandoSubperfil ? "Creando..." : "Crear sub-perfil"}
            </button>
          </div>

          {loadingSubperfiles ? <Loading label="Cargando sub-perfiles..." /> : subperfiles.length === 0 ? (
            <p style={{ color: COLORS.muted }} className="text-sm">Todavía no has creado ningún sub-perfil.</p>
          ) : (
            <div className="grid gap-2">
              {subperfiles.map((s) => (
                <div key={s.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-sm">{s.nombre}</p>
                    <p style={{ color: COLORS.muted }} className="text-xs capitalize">{s.tipo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={s.plan} onChange={(e) => cambiarPlanSub(s.id, e.target.value)} disabled={cambiandoPlanSub === s.id}
                      style={inputStyle} className="rounded-lg px-2 py-1.5 text-xs">
                      {PLAN_ORDER.map((p) => <option key={p} value={p}>{PLAN_INFO[p].nombre}</option>)}
                    </select>
                    <button onClick={() => entrarComoSub(s.id)} disabled={entrandoSub === s.id}
                      style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                      {entrandoSub === s.id ? "Entrando..." : "Entrar como"}
                    </button>
                  </div>
                </div>
              ))}
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
          {programados.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm mb-8">No hay anuncios programados.</p>}
          <div className="grid gap-3 mb-8">
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

          <h3 style={{ color: COLORS.gold }} className="font-semibold mb-3 text-sm uppercase">Publicados</h3>
          {publicados.length === 0 && <p style={{ color: COLORS.muted }} className="text-sm">Todavía no hay anuncios publicados.</p>}
          <div className="grid gap-3">
            {publicados.map((n) => (
              <div key={n.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4">
                {editandoAnuncio === n.id ? (
                  <div className="grid gap-2">
                    <input placeholder="Título del anuncio" value={anuncioEdit.titulo}
                      onChange={(e) => setAnuncioEdit({ ...anuncioEdit, titulo: e.target.value })}
                      style={inputStyleAnuncio} className="rounded-lg px-3 py-2 text-sm" />
                    <textarea placeholder="Contenido del anuncio" rows={3} value={anuncioEdit.contenido}
                      onChange={(e) => setAnuncioEdit({ ...anuncioEdit, contenido: e.target.value })}
                      style={inputStyleAnuncio} className="rounded-lg px-3 py-2 text-sm" />
                    <div className="flex items-center gap-3">
                      {(nuevaImagenEditPreview || anuncioEdit.imagen_url) && (
                        <img src={nuevaImagenEditPreview || anuncioEdit.imagen_url} alt="" style={{ width: 70, height: 70, objectFit: "cover" }} className="rounded-lg" />
                      )}
                      <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer">
                        Cambiar imagen
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setNuevaImagenEdit(file);
                          setNuevaImagenEditPreview(URL.createObjectURL(file));
                        }} />
                      </label>
                      {(nuevaImagenEditPreview || anuncioEdit.imagen_url) && (
                        <button type="button" onClick={() => { setNuevaImagenEdit(null); setNuevaImagenEditPreview(null); setAnuncioEdit({ ...anuncioEdit, imagen_url: "" }); }}
                          style={{ color: COLORS.muted }} className="text-xs">Quitar</button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => guardarAnuncioEditado(n.id)} disabled={guardandoAnuncio === n.id || !anuncioEdit.titulo.trim() || !anuncioEdit.contenido.trim()}
                        style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                        {guardandoAnuncio === n.id ? "Guardando..." : "Guardar cambios"}
                      </button>
                      <button onClick={() => setEditandoAnuncio(null)} style={{ color: COLORS.muted }} className="text-xs px-3 py-1.5">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ color: COLORS.muted }} className="text-xs mb-1">
                      Publicado: {new Date(n.fecha_publicacion).toLocaleString("es-MX")}
                    </p>
                    {n.imagen_url && <img src={n.imagen_url} alt="" style={{ maxHeight: 140, objectFit: "cover" }} className="rounded-lg mb-2 w-full" />}
                    <p className="font-semibold">{n.titulo}</p>
                    <p style={{ color: COLORS.muted }} className="text-sm mt-1">{n.contenido}</p>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => abrirEditorAnuncio(n)}
                        style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                        ✏️ Editar
                      </button>
                      <button onClick={() => borrarAnuncio(n)} disabled={borrandoAnuncio === n.id}
                        style={{ color: "#C24444", border: "1px solid #C2444455" }} className="rounded-lg px-3 py-1.5 text-xs font-semibold">
                        {borrandoAnuncio === n.id ? "Borrando..." : "Borrar"}
                      </button>
                    </div>
                  </>
                )}
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

      {tabAdmin === "reportes" && (
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🚩 Reportes</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-4">Publicaciones o perfiles reportados por usuarios. Revisa y márcalos como resueltos o descartados.</p>
          {loadingReportes ? <Loading label="Cargando reportes..." /> : reportes.length === 0 ? (
            <p style={{ color: COLORS.muted }} className="text-sm">Sin reportes pendientes. 🎉</p>
          ) : (
            <div className="grid gap-3">
              {reportes.map((r) => (
                <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.azulPalido}55` }} className="rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {r.tipo === "perfil" ? "Perfil/tienda reportado: " : "Publicación reportada: "}
                        {r.objetivo_nombre || r.objetivo_perfil?.nombre || r.objetivo_id}
                      </p>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1">Motivo: {r.motivo}</p>
                      {r.detalle && <p style={{ color: COLORS.muted }} className="text-xs mt-1">Detalle: {r.detalle}</p>}
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1">
                        Reportado por {r.reportante?.nombre || "alguien"} ({r.reportante?.email || "sin correo"}) · {new Date(r.created_at).toLocaleString("es-MX")}
                      </p>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-1 break-all">Tabla: {r.tabla_objetivo} · ID: {r.objetivo_id}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => resolverReporte(r.id, "revisado")} disabled={resolviendoReporte === r.id}
                        style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                        {resolviendoReporte === r.id ? "..." : "Marcar revisado"}
                      </button>
                      <button onClick={() => resolverReporte(r.id, "descartado")} disabled={resolviendoReporte === r.id}
                        style={{ color: COLORS.muted, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tabAdmin === "vendedores" && (
        <div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Vendedores</h2>
          <p style={{ color: COLORS.muted }} className="text-sm mb-4">Tratos realizados (ventas confirmadas) y reseñas de cada perfil, ordenado de más a menos ventas.</p>
          {loadingVendedores ? <Loading label="Cargando vendedores..." /> : (
            <div className="grid gap-2">
              {vendedores.map((v) => (
                <div key={v.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <AvatarImg url={v.avatar_url} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{v.nombre}</p>
                        <Badge color={v.tipo === "tienda" ? COLORS.azulPalido : COLORS.azulClaro}>{v.tipo === "tienda" ? "Tienda" : "Individual"}</Badge>
                        <VendedorBadge ventasCompletadas={v.ventasConfirmadas} promedioEstrellas={v.promedioEstrellas} />
                      </div>
                      <p style={{ color: COLORS.muted }} className="text-xs mt-0.5">Plan: {PLAN_INFO[v.plan]?.nombre || v.plan}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-center">
                      <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className="text-lg font-bold">{v.ventasConfirmadas}</p>
                      <p style={{ color: COLORS.muted }} className="text-[10px] uppercase">Ventas</p>
                    </div>
                    <div className="text-center">
                      {v.numResenas > 0 ? (
                        <>
                          <div className="flex items-center gap-1"><EstrellasDisplay valor={v.promedioEstrellas} size={12} /></div>
                          <p style={{ color: COLORS.muted }} className="text-[10px]">{v.promedioEstrellas.toFixed(1)} ({v.numResenas})</p>
                        </>
                      ) : (
                        <p style={{ color: COLORS.muted }} className="text-[10px]">Sin reseñas</p>
                      )}
                    </div>
                    <button onClick={() => onVerPerfil?.(v.id)} style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
                      Ver perfil
                    </button>
                  </div>
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
  const [idiomaLote, setIdiomaLote] = useState(""); // idioma de todas las cartas de este lote

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
    if (!idiomaLote) { setError("Elige el idioma de estas cartas antes de importar."); return; }
    setImportando(true); setError(null); setResultado(null);
    try {
      await sbWrite("POST", "inventario_tienda", validas.map((f) => ({
        tienda_id: tiendaId,
        tcg: "pokemon",
        carta: f.carta,
        set_nombre: f.set_nombre,
        condicion: f.condicion,
        idioma: idiomaLote,
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
      <div>
        <p style={{ color: COLORS.muted }} className="text-xs mb-1">Idioma de estas cartas (obligatorio — se aplica a todo este lote)</p>
        <IdiomaSelector value={idiomaLote} onChange={setIdiomaLote} />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => importar(filasDeTexto())} disabled={importando || !texto.trim() || !idiomaLote}
          style={{ background: COLORS.azul, color: COLORS.text }} className="rounded-lg px-4 py-2 text-sm font-semibold">
          {importando ? "Importando..." : "Importar lista de texto"}
        </button>
        <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido, opacity: idiomaLote ? 1 : 0.5, pointerEvents: idiomaLote ? "auto" : "none" }} className="rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer">
          Subir CSV / Excel
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArchivo} className="hidden" disabled={importando || !idiomaLote} />
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
  const [idiomaCarpeta, setIdiomaCarpeta] = useState(""); // idioma de todas las cartas de esta revisión

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
        nombre: c.nombre, set: c.set || "", numero: c.numero || "", confianza: c.confianza || null,
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

  // Modo "una foto por carta": más lento de subir, pero mucho más preciso — cada
  // carta se ve grande y de cerca, en vez de compartir una sola foto de la página
  // completa entre varias cartas chiquitas. Los resultados de todas las fotos se
  // acumulan en la misma pantalla de revisión.
  const subirVariasFotos = async (carpetaId, files) => {
    if (!files.length) return;
    setSubiendoFotoPara(carpetaId); setError(null);
    let filasAcumuladas = [];
    setRevision({ carpetaId, filas: [] });
    try {
      for (const file of files) {
        const url = await subirImagenABucket("carpetas", file, session);
        await sbWrite("POST", "carpeta_fotos", { carpeta_id: carpetaId, imagen_url: url }, session);
        const res = await fetch("/api/carpetas/detectar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfilId: session.user.id, imagenUrl: url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo procesar una de las fotos.");
        const detectadas = data.cartas || [];
        const offset = filasAcumuladas.length;
        const nuevasFilas = detectadas.map((c) => ({
          nombre: c.nombre, set: c.set || "", numero: c.numero || "", confianza: c.confianza || null,
          cargando: true, encontrada: null, incluir: true, precio: "", cantidad: "1", condicion: "NM",
        }));
        filasAcumuladas = [...filasAcumuladas, ...nuevasFilas];
        setRevision({ carpetaId, filas: filasAcumuladas });
        nuevasFilas.forEach((fila, localIdx) => {
          const idx = offset + localIdx;
          buscarCartaTCGdex(fila.nombre, fila.numero || null).then((encontrada) => {
            setRevision((prev) => {
              if (!prev || prev.carpetaId !== carpetaId) return prev;
              const nf = [...prev.filas];
              if (nf[idx]) nf[idx] = { ...nf[idx], cargando: false, encontrada };
              return { ...prev, filas: nf };
            });
          });
        });
      }
      cargar();
      if (!filasAcumuladas.length) setError("No se detectó ninguna carta en esas fotos. Intenta con fotos más claras o de más cerca.");
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
    if (!idiomaCarpeta) { setError("Elige el idioma de estas cartas antes de publicar."); return; }
    setPublicando(true); setError(null);
    try {
      const filas = validas.map((f) => ({
        tcg: "pokemon",
        carta: f.encontrada?.name || f.nombre || f.nombreManual,
        set_nombre: f.encontrada?.set_nombre || f.set || null,
        condicion: f.condicion,
        idioma: idiomaCarpeta,
        precio: Number(f.precio),
        cantidad: Number(f.cantidad) || 1,
        card_api_id: f.encontrada?.card_api_id || null,
        imagen_url: f.imagenManual || f.encontrada?.imagen_url,
        carpeta_id: revision.carpetaId,
        ...(contexto === "tienda"
          ? { tienda_id: tiendaId }
          : { perfil_id: session.user.id, tipo: "carta", zona: zonaMercado.trim() }),
      }));
      await sbWrite("POST", contexto === "tienda" ? "inventario_tienda" : "mercado_listings", filas, session);
      setRevision(null);
      setIdiomaCarpeta("");
      onPublicado?.();
    } catch (e) { setError(e.message); } finally { setPublicando(false); }
  };

  if (loading) return <Loading label="Cargando tus carpetas..." />;

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-6 grid gap-3">
      <p style={{ color: COLORS.azulPalido }} className="text-sm font-semibold uppercase">📁 Carpetas</p>
      <p style={{ color: COLORS.muted }} className="text-xs -mt-2">
        Organiza tu inventario en carpetas (álbumes). Sube una foto de una página completa (rápido) o una foto por cada
        carta (más lento, pero mucho más preciso) y la IA intenta identificar cada carta — tú revisas, le pones precio
        y publicas en bloque.
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
              <div className="flex items-center gap-2 flex-wrap">
                <label style={{ border: `1px solid ${COLORS.azul}66`, color: COLORS.azulPalido }} className="rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap">
                  {subiendoFotoPara === c.id ? "Procesando..." : "📷 Foto de la página"}
                  <input type="file" accept="image/*" className="hidden" disabled={subiendoFotoPara === c.id}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFoto(c.id, f); e.target.value = ""; }} />
                </label>
                <label style={{ border: `1px solid ${COLORS.azulPalido}66`, color: COLORS.azulPalido }} className="rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  title="Sube una foto de cada carta por separado — más lento, pero mucho más preciso que una foto de toda la página.">
                  {subiendoFotoPara === c.id ? "Procesando..." : "📸 Foto por carta (más preciso)"}
                  <input type="file" accept="image/*" multiple className="hidden" disabled={subiendoFotoPara === c.id}
                    onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) subirVariasFotos(c.id, fs); e.target.value = ""; }} />
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
          <div>
            <p style={{ color: COLORS.muted }} className="text-xs mb-1">Idioma de estas cartas (obligatorio — se aplica a todas las de esta revisión)</p>
            <IdiomaSelector value={idiomaCarpeta} onChange={setIdiomaCarpeta} />
          </div>
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
                      <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                        {f.encontrada?.name || f.nombre}
                        {f.confianza === "baja" && (
                          <span style={{ color: "#C24444", border: "1px solid #C2444455" }} title="La IA no está segura de esta lectura — revísala antes de publicar."
                            className="text-[10px] font-semibold rounded px-1 py-0.5 whitespace-nowrap">⚠️ Revisar</span>
                        )}
                        {f.confianza === "media" && (
                          <span style={{ color: COLORS.gold, border: `1px solid ${COLORS.gold}55` }} title="La IA tuvo que inferir parte de esta carta — vale la pena confirmarla."
                            className="text-[10px] font-semibold rounded px-1 py-0.5 whitespace-nowrap">confianza media</span>
                        )}
                      </p>
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
            <button onClick={publicarRevision} disabled={publicando || !idiomaCarpeta}
              style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold">
              {publicando ? "Publicando..." : "Publicar cartas incluidas"}
            </button>
            <button onClick={() => { setRevision(null); setIdiomaCarpeta(""); }} style={{ color: COLORS.muted }} className="text-sm">Cancelar</button>
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

  const [nuevaCarta, setNuevaCarta] = useState({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "", precio: "", precio_antes: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
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
    if (!nuevaCarta.carta || !nuevaCarta.precio || !nuevaCarta.idioma) return;
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
      setNuevaCarta({ tcg: "pokemon", carta: "", set_nombre: "", condicion: "NM", idioma: "", precio: "", precio_antes: "", cantidad: "1", card_api_id: "", imagen_url: "", precio_ref_mxn: null });
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
        <div className="sm:col-span-6">
          <p style={{ color: COLORS.muted }} className="text-xs mb-1">Idioma de la carta (obligatorio)</p>
          <IdiomaSelector value={nuevaCarta.idioma} onChange={(v) => setNuevaCarta({ ...nuevaCarta, idioma: v })} />
        </div>
        <button onClick={agregarCarta} disabled={savingCarta || alLimite || !nuevaCarta.idioma} style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: alLimite ? 0.5 : 1 }} className="rounded-lg py-2 text-sm font-semibold sm:col-span-6">
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
                <IdiomaBadge idioma={item.idioma} />
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
            <MarcarVendidaBoton session={session} tabla="inventario_tienda" itemId={item.id} descripcion={`${item.carta}${item.set_nombre ? ` (${item.set_nombre})` : ""}`} precio={item.precio} onVendida={cargar} />
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
            <MarcarVendidaBoton session={session} tabla="sellado_tienda" itemId={item.id} descripcion={item.producto} precio={item.precio} onVendida={cargar} />
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

// ---- Destellos ✨: recompensas por actividad real (ventas, reseñas, publicar, perfil completo) ----
// Este es el "rango de participación" del usuario (novato → leyenda): mide
// actividad real en la web, no tiene nada que ver con el plan de tienda/perfil.
const NIVELES_DESTELLOS = [
  { min: 0, nombre: "Novato", slug: "novato", emoji: "🌱", color: COLORS.muted },
  { min: 50, nombre: "Buscador", slug: "buscador", emoji: "🔍", color: COLORS.azulClaro },
  { min: 200, nombre: "Cazador", slug: "cazador", emoji: "🎯", color: COLORS.violeta },
  { min: 500, nombre: "Maestro Cazador", slug: "maestro-cazador", emoji: "🏹", color: COLORS.azulPalido },
  { min: 1000, nombre: "Leyenda", slug: "leyenda", emoji: "👑", color: COLORS.gold },
];

// Ícono del nivel de participación (con respaldo a emoji si la imagen no carga).
function NivelIcon({ slug, emoji, size = 16 }) {
  const [iconError, setIconError] = useState(false);
  if (iconError) return <>{emoji}</>;
  return (
    <img
      src={`/branding/nivel-${slug}.png`}
      alt=""
      onError={() => setIconError(true)}
      style={{ width: size, height: size, display: "inline-block", objectFit: "contain" }}
    />
  );
}

function nivelDestellos(total) {
  let actual = NIVELES_DESTELLOS[0];
  let siguiente = null;
  for (let i = 0; i < NIVELES_DESTELLOS.length; i++) {
    if (total >= NIVELES_DESTELLOS[i].min) actual = NIVELES_DESTELLOS[i];
    else { siguiente = NIVELES_DESTELLOS[i]; break; }
  }
  return { actual, siguiente };
}

// ---- Tutorial de bienvenida (onboarding): 5 pasos animados, se guarda en
// localStorage para no volver a mostrarse solo; se puede relanzar desde el menú. ----
const ONBOARDING_SEEN_KEY = "ec_onboarding_seen";
const ONBOARDING_STEPS = [
  { title: "Bienvenido a Encuentra Cartas", body: "Descubre, compra y vende cartas coleccionables con tiendas y coleccionistas de todo México. Te mostramos lo esencial en unos segundos." },
  { title: "Busca cualquier carta al instante", body: "Escribe un nombre, número o set y encuentra justo lo que buscas entre tiendas y el Mercado entre usuarios." },
  { title: "Gemas que indican confianza", body: "Cada tienda tiene una gema —de Cuarzo a Aurora— según su trayectoria y calidad en la plataforma." },
  { title: "Chatea directo con el vendedor", body: "Pregunta, negocia y cierra el trato sin salir de la conversación." },
  { title: "Gana tu propio rango de participación", body: "Con cada compra, venta o reseña ganas Destellos ✨ y subes de Novato a Leyenda." },
];

function OnboardingTutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const typedRef = useRef(null);

  useEffect(() => {
    if (step !== 1) return;
    const el = typedRef.current;
    if (!el) return;
    const texto = "Charizard ex";
    let i = 0;
    el.textContent = "";
    const id = setInterval(() => {
      i++;
      el.textContent = texto.slice(0, i);
      if (i >= texto.length) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [step]);

  const finalizar = () => {
    try { localStorage.setItem(ONBOARDING_SEEN_KEY, "1"); } catch {}
    onClose();
  };
  const ir = (i) => setStep(Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, i)));
  const siguiente = () => (step >= ONBOARDING_STEPS.length - 1 ? finalizar() : ir(step + 1));
  const actual = ONBOARDING_STEPS[step];

  return createPortal(
    <div style={{ background: "#00000099" }} className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div
        style={{ background: "rgba(10,19,48,0.92)", border: `1px solid ${COLORS.azulMedio}44`, boxShadow: "0 30px 80px rgba(0,0,0,0.5)", backdropFilter: "blur(18px)" }}
        className="w-full max-w-md rounded-[28px] relative"
      >
        <button onClick={finalizar} style={{ color: COLORS.muted }} className="absolute top-5 right-5 z-10 text-sm font-semibold">
          Omitir
        </button>

        <div className="flex flex-col px-8 sm:px-10 pt-14 pb-8" style={{ minHeight: 460 }}>
          <div className="flex-1 flex flex-col items-center text-center justify-start">
            <div className="flex items-center justify-center" style={{ height: 110 }}>
              {step === 0 && (
                <img src="/branding/logo-icon.png" alt="" style={{ width: 80, height: 80, animation: "badgePop .5s ease both" }} />
              )}
              {step === 1 && (
                <div className="w-full" style={{ maxWidth: 320 }}>
                  <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66`, borderRadius: 16 }}
                    className="flex items-center gap-2 px-4 py-3 text-sm">
                    <Search size={16} color={COLORS.azulPalido} />
                    <span ref={typedRef} />
                    <span style={{ display: "inline-block", width: 2, height: 15, background: COLORS.azulPalido, animation: "typeBlink 1s step-end infinite" }} />
                  </div>
                  <div className="flex items-end justify-center gap-3 mt-5">
                    {[
                      { a: "floatCard1", g: `linear-gradient(135deg, ${COLORS.azulClaro}, ${COLORS.azulMedio})` },
                      { a: "floatCard2", g: `linear-gradient(135deg, ${COLORS.violeta}, #5B2FBF)` },
                      { a: "floatCard3", g: `linear-gradient(135deg, ${COLORS.gold}, #C98F00)` },
                    ].map((c, i) => (
                      <div key={i} style={{ width: 42, height: 58, borderRadius: 8, background: c.g, border: "1px solid rgba(255,255,255,0.25)", boxShadow: "0 6px 16px rgba(0,0,0,.35)", animation: `${c.a} 3.2s ease-in-out ${i * 0.15}s infinite` }}
                        className="flex items-center justify-center">
                        <Sparkles size={14} color="#fff" style={{ opacity: 0.85 }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="flex items-end justify-center gap-3" style={{ height: 90 }}>
                  {PLAN_ORDER.map((key, i) => {
                    const info = PLAN_INFO[key];
                    const size = 30 + i * 8;
                    return (
                      <div key={key} style={{ animation: `gemPop .5s ease ${i * 0.12}s both`, filter: i > 0 ? `drop-shadow(0 0 ${8 + i * 2}px ${info.color}77)` : "none" }}>
                        <RankIcon plan={key} emoji={info.emoji} size={size} />
                      </div>
                    );
                  })}
                </div>
              )}
              {step === 3 && (
                <div className="w-full flex flex-col gap-2.5" style={{ maxWidth: 300 }}>
                  <div style={{ alignSelf: "flex-start", background: `${COLORS.azulClaro}33`, borderRadius: "14px 14px 14px 4px", padding: "10px 14px", fontSize: 14, animation: "chatIn1 .4s ease both", textAlign: "left" }}>
                    ¿Sigue disponible la Charizard ex?
                  </div>
                  <div style={{ alignSelf: "flex-end", background: `linear-gradient(135deg, ${COLORS.azulClaro}, ${COLORS.azulMedio})`, color: "#fff", borderRadius: "14px 14px 4px 14px", padding: "10px 14px", fontSize: 14, animation: "chatIn2 .75s ease both", textAlign: "left" }}>
                    ¡Sí! Te la aparto 🙌
                  </div>
                </div>
              )}
              {step === 4 && (
                <div className="relative flex items-center justify-center" style={{ height: 100, width: 100 }}>
                  <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${COLORS.gold}`, animation: "ringPulse 1.8s ease-out infinite" }} />
                  <div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${COLORS.gold}`, animation: "ringPulse 1.8s ease-out .6s infinite" }} />
                  <div style={{ width: 70, height: 70, borderRadius: 18, background: `linear-gradient(135deg, ${COLORS.azulPalido}, ${COLORS.azulClaro})`, boxShadow: `0 0 26px ${COLORS.gold}55`, animation: "badgePop .5s ease both" }}
                    className="flex items-center justify-center">
                    <NivelIcon slug="leyenda" emoji="👑" size={38} />
                  </div>
                </div>
              )}
            </div>

            <h2 key={`t${step}`} style={{ fontFamily: "'Space Grotesk', sans-serif", animation: "fadeUp .45s ease both" }} className="text-xl font-bold mt-6 mb-2">
              {actual.title}
            </h2>
            <p key={`b${step}`} style={{ color: COLORS.muted, animation: "fadeUp .45s ease .05s both", maxWidth: 340 }} className="text-sm leading-relaxed mx-auto">
              {actual.body}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 my-6">
            {ONBOARDING_STEPS.map((_, i) => (
              <div key={i} onClick={() => ir(i)} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, cursor: "pointer", transition: "all .25s ease", background: i === step ? COLORS.azulClaro : `${COLORS.muted}55` }} />
            ))}
          </div>

          <div className="flex gap-3">
            {step > 0 && (
              <button onClick={() => ir(step - 1)} style={{ background: "rgba(255,255,255,0.06)", color: COLORS.text, border: `1px solid ${COLORS.muted}44` }}
                className="rounded-xl px-5 py-3 text-sm font-semibold flex-shrink-0">
                Atrás
              </button>
            )}
            <button onClick={siguiente} style={{ background: `linear-gradient(135deg, ${COLORS.azulClaro}, ${COLORS.azulMedio})`, color: "#fff", boxShadow: `0 8px 24px ${COLORS.azulMedio}66` }}
              className="flex-1 rounded-xl py-3 text-sm font-bold">
              {step === ONBOARDING_STEPS.length - 1 ? "Empezar a explorar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const MOTIVO_DESTELLOS_LABEL = {
  venta_confirmada_vendedor: "Venta confirmada",
  venta_confirmada_comprador: "Compra confirmada",
  primera_venta: "🎉 Bono: tu primera venta",
  primera_compra: "🎉 Bono: tu primera compra",
  resena_dejada: "Dejaste una reseña",
  resena_5_estrellas: "Te calificaron con 5 estrellas",
  publicacion: "Publicaste algo nuevo",
  perfil_completo: "🎉 Bono: completaste tu perfil",
  canje_boost_3d: "Canjeado: Boost 3 días",
  canje_boost_7d: "Canjeado: Boost 7 días",
};

// Insignia pública de nivel (se ve en el perfil, no se puede ocultar).
function NivelBadge({ total, size = "sm" }) {
  const { actual } = nivelDestellos(total);
  const iconPx = size === "lg" ? 18 : 14;
  return (
    <span
      title={`Nivel de Destellos: ${actual.nombre}`}
      style={{ border: `1px solid ${actual.color}`, color: actual.color, boxShadow: `0 0 8px ${actual.color}66` }}
      className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}
    >
      <NivelIcon slug={actual.slug} emoji={actual.emoji} size={iconPx} /> {actual.nombre}
    </span>
  );
}

function RecompensasView({ session, perfil }) {
  const [movimientos, setMovimientos] = useState([]);
  const [publicaciones, setPublicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canjeando, setCanjeando] = useState(null);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const cargar = () => {
    setLoading(true); setError(null);
    const tareas = [sb(`destellos_movimientos?select=*&perfil_id=eq.${session.user.id}&order=created_at.desc`, session).then(setMovimientos)];
    if (perfil?.tipo === "individual") {
      tareas.push(sb(`mercado_listings?select=id,carta,destacado_hasta&perfil_id=eq.${session.user.id}&order=created_at.desc`, session)
        .then((filas) => setPublicaciones(filas.map((f) => ({ ...f, tabla: "mercado_listings", nombre: f.carta })))));
    } else if (perfil?.tipo === "tienda") {
      tareas.push(
        sb(`tiendas?select=id&perfil_id=eq.${session.user.id}`, session).then(async (rows) => {
          const tiendaId = rows[0]?.id;
          if (!tiendaId) return;
          const [inv, sell] = await Promise.all([
            sb(`inventario_tienda?select=id,carta,destacado_hasta&tienda_id=eq.${tiendaId}`, session),
            sb(`sellado_tienda?select=id,producto,destacado_hasta&tienda_id=eq.${tiendaId}`, session),
          ]);
          setPublicaciones([
            ...inv.map((f) => ({ ...f, tabla: "inventario_tienda", nombre: f.carta })),
            ...sell.map((f) => ({ ...f, tabla: "sellado_tienda", nombre: f.producto })),
          ]);
        })
      );
    }
    Promise.all(tareas).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [session.user.id, perfil?.tipo]);

  const canjear = async (item, dias) => {
    setCanjeando(`${item.id}-${dias}`); setError(null); setOk(null);
    try {
      const res = await fetch("/api/recompensas/canjear", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ tabla: item.tabla, listingId: item.id, dias }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo canjear");
      setOk(`Listo, "${item.nombre}" quedó destacada ${dias} días.`);
      cargar();
    } catch (e) { setError(e.message); } finally { setCanjeando(null); }
  };

  if (loading) return <Loading label="Cargando tus Destellos..." />;

  const total = movimientos.reduce((s, m) => s + m.cantidad, 0);
  const { actual, siguiente } = nivelDestellos(total);
  const progreso = siguiente ? Math.min(100, Math.round(((total - actual.min) / (siguiente.min - actual.min)) * 100)) : 100;

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🏆 Recompensas</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Gana Destellos ✨ vendiendo, comprando, calificando y publicando — cánjialos por Boost gratis.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {ok && <p style={{ color: COLORS.azulPalido }} className="text-sm mb-4">{ok}</p>}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="flex items-center gap-2">
            <NivelBadge total={total} size="lg" />
            <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.gold }} className="text-2xl font-bold">{total} ✨</p>
          </div>
          {siguiente && <p style={{ color: COLORS.muted }} className="text-xs">Faltan {siguiente.min - total} para {siguiente.emoji} {siguiente.nombre}</p>}
        </div>
        <div style={{ background: COLORS.surface2 }} className="rounded-full h-2 overflow-hidden">
          <div style={{ width: `${progreso}%`, background: `linear-gradient(90deg, ${COLORS.azulClaro}, ${COLORS.gold})` }} className="h-full rounded-full transition-all" />
        </div>
      </div>

      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Canjear por Boost gratis</h3>
      {publicaciones.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm mb-6">Publica algo para poder canjear un Boost gratis en ella.</p>
      ) : (
        <div className="grid gap-2 mb-6">
          {publicaciones.map((item) => {
            const yaDestacado = item.destacado_hasta && new Date(item.destacado_hasta) > new Date();
            return (
              <div key={`${item.tabla}-${item.id}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">{item.nombre}</p>
                {yaDestacado ? (
                  <p style={{ color: COLORS.azulPalido }} className="text-xs">🚀 Ya destacada</p>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => canjear(item, 3)} disabled={total < 150 || canjeando !== null}
                      style={{ color: COLORS.gold, border: `1px solid ${COLORS.gold}55`, opacity: total < 150 ? 0.4 : 1 }} className="text-xs px-2 py-1 rounded-lg whitespace-nowrap">
                      {canjeando === `${item.id}-3` ? "..." : "3 días · 150✨"}
                    </button>
                    <button onClick={() => canjear(item, 7)} disabled={total < 300 || canjeando !== null}
                      style={{ color: COLORS.gold, border: `1px solid ${COLORS.gold}55`, opacity: total < 300 ? 0.4 : 1 }} className="text-xs px-2 py-1 rounded-lg whitespace-nowrap">
                      {canjeando === `${item.id}-7` ? "..." : "7 días · 300✨"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Historial</h3>
      {movimientos.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm">Todavía no tienes movimientos.</p>
      ) : (
        <div className="grid gap-1">
          {movimientos.slice(0, 30).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-sm py-1.5" style={{ borderBottom: `1px solid ${COLORS.surface2}` }}>
              <p>{MOTIVO_DESTELLOS_LABEL[m.motivo] || m.motivo}</p>
              <p style={{ color: m.cantidad >= 0 ? COLORS.azulPalido : COLORS.muted }} className="font-semibold whitespace-nowrap">
                {m.cantidad >= 0 ? "+" : ""}{m.cantidad} ✨
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Comunidad: feed simple de fotos (pulls, aperturas, logros) ----
const TIPO_COMUNIDAD_LABEL = { pull: "🎉 Pull", apertura: "📦 Apertura", logro: "🏅 Logro", otro: "📸 Otro" };

function ComunidadView({ session, onVerPerfil }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [misLikes, setMisLikes] = useState(new Set());

  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("otro");
  const [publicando, setPublicando] = useState(false);

  const cargar = () => {
    setLoading(true); setError(null);
    sb(`publicaciones_comunidad?select=*,perfiles(nombre,avatar_url),comunidad_likes(perfil_id)&order=created_at.desc&limit=30`, session)
      .then((filas) => {
        setPosts(filas);
        if (session) {
          const mias = new Set();
          filas.forEach((p) => { if (p.comunidad_likes?.some((l) => l.perfil_id === session.user.id)) mias.add(p.id); });
          setMisLikes(mias);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [session?.user?.id]);

  const elegirFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setPreview(URL.createObjectURL(file));
  };

  const publicar = async () => {
    if (!archivo || !session) return;
    setPublicando(true); setError(null);
    try {
      const imagen_url = await subirImagenABucket("comunidad", archivo, session);
      await sbWrite("POST", "publicaciones_comunidad", { perfil_id: session.user.id, imagen_url, texto: texto.trim() || null, tipo }, session);
      setArchivo(null); setPreview(null); setTexto(""); setTipo("otro");
      cargar();
    } catch (e) { setError(e.message); } finally { setPublicando(false); }
  };

  const alternarLike = async (postId) => {
    if (!session) return;
    const yaLike = misLikes.has(postId);
    setMisLikes((prev) => { const s = new Set(prev); if (yaLike) s.delete(postId); else s.add(postId); return s; });
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const likes = p.comunidad_likes || [];
      return { ...p, comunidad_likes: yaLike ? likes.filter((l) => l.perfil_id !== session.user.id) : [...likes, { perfil_id: session.user.id }] };
    }));
    try {
      if (yaLike) await sbWrite("DELETE", `comunidad_likes?post_id=eq.${postId}&perfil_id=eq.${session.user.id}`, {}, session);
      else await sbWrite("POST", "comunidad_likes", { post_id: postId, perfil_id: session.user.id }, session);
    } catch {}
  };

  const borrar = async (postId) => {
    if (!window.confirm("¿Borrar esta publicación?")) return;
    try { await sbWrite("DELETE", `publicaciones_comunidad?id=eq.${postId}`, {}, session); cargar(); } catch (e) { setError(e.message); }
  };

  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };

  if (loading) return <Loading label="Cargando el feed..." />;

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">📸 Comunidad</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Comparte tus pulls, aperturas de sobres y logros — lo ve toda la comunidad.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {session ? (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl p-4 mb-6 grid gap-3">
          {preview ? (
            <div className="relative">
              <img src={preview} alt="" style={{ maxHeight: 240, objectFit: "contain" }} className="rounded-lg mx-auto" />
              <button onClick={() => { setArchivo(null); setPreview(null); }} style={{ color: COLORS.muted }} className="text-xs mt-2">Quitar foto</button>
            </div>
          ) : (
            <label style={{ border: `1px dashed ${COLORS.surface2}`, color: COLORS.muted }} className="rounded-lg px-3 py-6 text-sm text-center cursor-pointer">
              📷 Elegir foto
              <input type="file" accept="image/*" className="hidden" onChange={elegirFoto} />
            </label>
          )}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TIPO_COMUNIDAD_LABEL).map(([key, label]) => (
              <button key={key} onClick={() => setTipo(key)}
                style={{ background: tipo === key ? COLORS.surface2 : "transparent", border: `1px solid ${tipo === key ? COLORS.azulPalido : COLORS.surface2}`, color: tipo === key ? COLORS.azulPalido : COLORS.muted }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold">
                {label}
              </button>
            ))}
          </div>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cuéntanos algo (opcional)"
            style={inputStyle} className="w-full rounded-lg px-3 py-2 text-sm outline-none" rows={2} />
          <button onClick={publicar} disabled={!archivo || publicando} style={{ background: COLORS.azulClaro, color: COLORS.bg, opacity: archivo ? 1 : 0.5 }} className="rounded-lg py-2 text-sm font-semibold w-fit px-4">
            {publicando ? "Publicando..." : "Publicar"}
          </button>
        </div>
      ) : (
        <p style={{ color: COLORS.muted }} className="text-sm mb-6">Inicia sesión para publicar en el feed.</p>
      )}

      {posts.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">Todavía no hay publicaciones. ¡Sé el primero!</p>
      ) : (
        <div className="grid gap-4 max-w-lg mx-auto">
          {posts.map((p) => {
            const likeCount = p.comunidad_likes?.length || 0;
            const yaLike = misLikes.has(p.id);
            return (
              <div key={p.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between gap-2 p-3">
                  <button onClick={() => onVerPerfil?.(p.perfil_id)} className="flex items-center gap-2 hover:brightness-125">
                    <AvatarImg url={p.perfiles?.avatar_url} size={28} />
                    <p className="text-sm font-semibold">{p.perfiles?.nombre || "Usuario"}</p>
                  </button>
                  <Badge color={COLORS.azulPalido}>{TIPO_COMUNIDAD_LABEL[p.tipo] || TIPO_COMUNIDAD_LABEL.otro}</Badge>
                </div>
                <img src={p.imagen_url} alt="" style={{ maxHeight: 420, objectFit: "contain", width: "100%", background: COLORS.surface2 }} />
                <div className="p-3">
                  {p.texto && <p className="text-sm mb-2">{p.texto}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <button onClick={() => alternarLike(p.id)} disabled={!session} style={{ color: yaLike ? COLORS.gold : COLORS.muted }} className="text-xs flex items-center gap-1">
                        {yaLike ? "❤️" : "🤍"} {likeCount}
                      </button>
                      {session && session.user.id !== p.perfil_id && (
                        <ReportarBoton session={session} tipo="publicacion" tablaObjetivo="publicaciones_comunidad" objetivoId={p.id} objetivoPerfilId={p.perfil_id} objetivoNombre={p.texto || "Publicación de comunidad"} />
                      )}
                    </div>
                    {session?.user?.id === p.perfil_id && (
                      <button onClick={() => borrar(p.id)} style={{ color: COLORS.muted }} className="text-xs">Borrar</button>
                    )}
                  </div>
                  <p style={{ color: COLORS.muted }} className="text-[10px] mt-2">
                    {new Date(p.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Armar mazo: encuentra qué tiendas/vendedores tienen las cartas que te faltan ----
// Reglas oficiales del Pokémon TCG que validamos (sin bloquear la búsqueda,
// solo avisamos): máximo 4 copias de una carta que no sea Energía Básica —
// la Energía Básica no tiene límite de copias en un mazo legal.
const ENERGIAS_BASICAS_REGEX = /\b(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy)\s+energy\b|\benerg[íi]a\s+b[áa]sica\b/i;
const esEnergiaBasica = (nombre) => ENERGIAS_BASICAS_REGEX.test(nombre || "");

function parsearDecklist(texto) {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      // Acepta "4 Charizard ex", "Charizard ex x4", "Charizard ex x 4" o solo "Charizard ex" (implica 1).
      let m = linea.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) return { cantidad: Number(m[1]), carta: m[2].trim() };
      m = linea.match(/^(.+?)\s*[xX]\s*(\d+)$/);
      if (m) return { cantidad: Number(m[2]), carta: m[1].trim() };
      return { cantidad: 1, carta: linea };
    })
    .filter((f) => f.carta);
}

function coincideCarta(nombreListado, nombreBuscado) {
  const a = (nombreListado || "").toLowerCase();
  const b = (nombreBuscado || "").toLowerCase();
  return a.includes(b) || b.includes(a);
}

function ArmarMazoView({ session, onAbrirChat, onVerTienda }) {
  const [texto, setTexto] = useState("");
  const [decklist, setDecklist] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState(null); // [{ vendedorKey, tipo, nombre, avatar, perfilId, tiendaId, items: [...], countMatched }]
  const [error, setError] = useState(null);

  const buscar = async () => {
    const lista = parsearDecklist(texto);
    if (!lista.length) return;
    setDecklist(lista);
    setBuscando(true); setError(null); setResultados(null);
    try {
      const [mercado, inventario] = await Promise.all([
        sb(`mercado_listings?select=*,perfiles(nombre,avatar_url)&order=precio.asc`),
        sb(`inventario_tienda?select=*,tiendas(id,nombre,perfil_id,perfiles(avatar_url))&order=precio.asc`),
      ]);

      const vendedores = {}; // key -> { tipo, nombre, avatar, perfilId, tiendaId, coincidencias: Map(carta -> mejor item) }

      mercado.forEach((r) => {
        lista.forEach((item) => {
          if (!coincideCarta(r.carta, item.carta)) return;
          const key = `individual-${r.perfil_id}`;
          if (!vendedores[key]) {
            vendedores[key] = { tipo: "individual", nombre: r.perfiles?.nombre || "Usuario", avatar: r.perfiles?.avatar_url, perfilId: r.perfil_id, coincidencias: new Map() };
          }
          const actual = vendedores[key].coincidencias.get(item.carta);
          if (!actual || Number(r.precio) < Number(actual.precio)) {
            vendedores[key].coincidencias.set(item.carta, { carta: r.carta, precio: r.precio, cantidadNecesaria: item.cantidad, cantidadDisponible: r.cantidad || 1 });
          }
        });
      });

      inventario.forEach((r) => {
        lista.forEach((item) => {
          if (!coincideCarta(r.carta, item.carta)) return;
          const tiendaId = r.tiendas?.id;
          if (!tiendaId) return;
          const key = `tienda-${tiendaId}`;
          if (!vendedores[key]) {
            vendedores[key] = { tipo: "tienda", nombre: r.tiendas?.nombre || "Tienda", avatar: r.tiendas?.perfiles?.avatar_url, perfilId: r.tiendas?.perfil_id, tiendaId, coincidencias: new Map() };
          }
          const actual = vendedores[key].coincidencias.get(item.carta);
          if (!actual || Number(r.precio) < Number(actual.precio)) {
            vendedores[key].coincidencias.set(item.carta, { carta: r.carta, precio: r.precio, cantidadNecesaria: item.cantidad, cantidadDisponible: r.cantidad || 1 });
          }
        });
      });

      const lista2 = Object.values(vendedores)
        .map((v) => ({ ...v, items: [...v.coincidencias.values()], countMatched: v.coincidencias.size }))
        .sort((a, b) => b.countMatched - a.countMatched);

      setResultados(lista2);
    } catch (e) { setError(e.message); } finally { setBuscando(false); }
  };

  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };
  const advertenciaExceso = decklist?.filter((f) => f.cantidad > 4 && !esEnergiaBasica(f.carta)) || [];

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🃏 Armar mazo</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">
        Escribe las cartas que te faltan (una por línea, ej. "4 Charizard ex" o "Charizard ex x4") y te decimos qué tiendas o vendedores te las pueden completar.
      </p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder={"4 Charizard ex\n2 Pikachu VMAX\n3 Iono\n10 Basic Fire Energy"}
        style={inputStyle} className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" rows={8} />

      {advertenciaExceso.length > 0 && (
        <div style={{ background: `${COLORS.gold}11`, border: `1px solid ${COLORS.gold}55`, color: COLORS.gold }} className="rounded-lg p-3 mb-3 text-xs">
          ⚠️ Un mazo oficial de Pokémon TCG permite máximo 4 copias de una carta que no sea Energía Básica — revisa: {advertenciaExceso.map((f) => f.carta).join(", ")}.
        </div>
      )}

      <button onClick={buscar} disabled={buscando || !texto.trim()} style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold mb-6">
        {buscando ? "Buscando..." : "Buscar en el mercado"}
      </button>

      {resultados && (
        <>
          <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">
            {resultados.length === 0 ? "Sin coincidencias" : `${resultados.length} vendedor${resultados.length === 1 ? "" : "es"} tienen algo de tu lista`}
          </h3>
          <div className="grid gap-3">
            {resultados.map((v) => (
              <div key={`${v.tipo}-${v.tiendaId || v.perfilId}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <button onClick={() => (v.tipo === "tienda" ? onVerTienda?.(v.tiendaId) : null)} className="flex items-center gap-2 hover:brightness-125" disabled={v.tipo !== "tienda"}>
                    <AvatarImg url={v.avatar} size={28} />
                    <p className="text-sm font-semibold">{v.nombre}</p>
                    <Badge color={v.tipo === "tienda" ? COLORS.azulPalido : COLORS.azulClaro}>{v.tipo === "tienda" ? "Tienda" : "Vendedor"}</Badge>
                  </button>
                  <p style={{ color: COLORS.azulPalido }} className="text-sm font-semibold whitespace-nowrap">
                    {v.countMatched} / {decklist.length} cartas de tu lista
                  </p>
                </div>
                <div className="grid gap-1 mb-3">
                  {v.items.map((it) => (
                    <div key={it.carta} className="flex items-center justify-between gap-2 text-xs">
                      <p className="truncate">{it.carta} {it.cantidadDisponible < it.cantidadNecesaria && <span style={{ color: COLORS.muted }}>(solo tiene {it.cantidadDisponible} de {it.cantidadNecesaria})</span>}</p>
                      <p style={{ fontFamily: "'Space Mono', monospace", color: COLORS.azulPalido }} className="whitespace-nowrap">${Number(it.precio).toLocaleString("es-MX")}</p>
                    </div>
                  ))}
                </div>
                {session && (
                  <button
                    onClick={() => onAbrirChat(v.perfilId, v.nombre, "Armar mazo", null, null, v.avatar)}
                    style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                    className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <MessageCircle size={12} /> Contactar
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Mis mazos: deck builder visual (Amatista+) ----
// Varios mazos por usuario, cada uno con nombre y etiquetas propias;
// las cartas se agregan con el mismo CardPicker que usa el resto de la
// app (buscador con imagen y precio de referencia) y cada una lleva su
// propia cantidad, incrementable/decrementable.
function MazosView({ session, perfil, onIrAPlanes }) {
  const info = planDe(perfil);
  const [mazos, setMazos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mazoAbierto, setMazoAbierto] = useState(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [etiquetasNuevo, setEtiquetasNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [borrandoMazo, setBorrandoMazo] = useState(null);
  const [guardandoCarta, setGuardandoCarta] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [etiquetasEdit, setEtiquetasEdit] = useState("");

  const inputStyle = { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` };

  const cargar = () => {
    setLoading(true); setError(null);
    sb(`mazos?select=*,mazo_cartas(*)&perfil_id=eq.${session.user.id}&order=created_at.desc`, session)
      .then(setMazos)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (info.mazoBuilder) cargar(); }, []);

  if (!info.mazoBuilder) {
    return (
      <div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">🧩 Mis mazos</h2>
        <UpsellCard requiere={PLAN_INFO.ultraball} plan="ultraball" onIrAPlanes={onIrAPlanes}>
          Arma varios mazos con un selector visual de cartas: elige la cantidad de cada una y ponles nombre y etiquetas propias.
        </UpsellCard>
      </div>
    );
  }

  if (loading) return <Loading label="Cargando tus mazos..." />;

  const crearMazo = async () => {
    if (!nombreNuevo.trim()) return;
    setCreando(true); setError(null);
    try {
      const etiquetas = etiquetasNuevo.split(",").map((s) => s.trim()).filter(Boolean);
      const creados = await sbWrite("POST", "mazos", { perfil_id: session.user.id, nombre: nombreNuevo.trim(), etiquetas }, session);
      setNombreNuevo(""); setEtiquetasNuevo("");
      cargar();
      if (creados?.[0]?.id) setMazoAbierto(creados[0].id);
    } catch (e) { setError(e.message); } finally { setCreando(false); }
  };

  const borrarMazo = async (id) => {
    setBorrandoMazo(id);
    try {
      await sbWrite("DELETE", `mazos?id=eq.${id}`, {}, session);
      if (mazoAbierto === id) setMazoAbierto(null);
      cargar();
    } catch (e) { setError(e.message); } finally { setBorrandoMazo(null); }
  };

  const actual = mazos.find((m) => m.id === mazoAbierto);

  const agregarCarta = async (c) => {
    if (!actual) return;
    setGuardandoCarta(true);
    try {
      const existente = actual.mazo_cartas.find((mc) => (c.card_api_id && mc.card_api_id === c.card_api_id) || mc.nombre === c.name);
      if (existente) {
        await sbWrite("PATCH", `mazo_cartas?id=eq.${existente.id}`, { cantidad: existente.cantidad + 1 }, session);
      } else {
        await sbWrite("POST", "mazo_cartas", {
          mazo_id: actual.id, nombre: c.name, set_nombre: c.set_nombre, card_api_id: c.card_api_id, imagen_url: c.imagen_url, cantidad: 1,
        }, session);
      }
      cargar();
    } catch (e) { setError(e.message); } finally { setGuardandoCarta(false); }
  };

  const cambiarCantidad = async (mc, delta) => {
    const nueva = mc.cantidad + delta;
    try {
      if (nueva <= 0) await sbWrite("DELETE", `mazo_cartas?id=eq.${mc.id}`, {}, session);
      else await sbWrite("PATCH", `mazo_cartas?id=eq.${mc.id}`, { cantidad: nueva }, session);
      cargar();
    } catch (e) { setError(e.message); }
  };

  const guardarNombreEtiquetas = async () => {
    if (!actual || !nombreEdit.trim()) return;
    try {
      const etiquetas = etiquetasEdit.split(",").map((s) => s.trim()).filter(Boolean);
      await sbWrite("PATCH", `mazos?id=eq.${actual.id}`, { nombre: nombreEdit.trim(), etiquetas }, session);
      setEditandoNombre(false);
      cargar();
    } catch (e) { setError(e.message); }
  };

  // ---- Vista de un mazo abierto ----
  if (actual) {
    const totalCartas = actual.mazo_cartas.reduce((s, mc) => s + mc.cantidad, 0);
    const exceso = actual.mazo_cartas.filter((mc) => mc.cantidad > 4 && !esEnergiaBasica(mc.nombre));
    return (
      <div>
        <button onClick={() => setMazoAbierto(null)} style={{ color: COLORS.azulPalido }} className="text-sm mb-4 flex items-center gap-1">← Mis mazos</button>
        {error && <div className="mb-4"><ErrorBox message={error} /></div>}

        {editandoNombre ? (
          <div className="flex flex-wrap gap-2 mb-3">
            <input value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} placeholder="Nombre del mazo" style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
            <input value={etiquetasEdit} onChange={(e) => setEtiquetasEdit(e.target.value)} placeholder="Etiquetas separadas por coma" style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
            <button onClick={guardarNombreEtiquetas} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-3 py-2 text-sm font-semibold">Guardar</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold">{actual.nombre}</h2>
            <button onClick={() => { setEditandoNombre(true); setNombreEdit(actual.nombre); setEtiquetasEdit((actual.etiquetas || []).join(", ")); }}
              style={{ color: COLORS.muted }} className="text-xs underline">Editar</button>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {(actual.etiquetas || []).map((e) => <Badge key={e} color={COLORS.violeta}>{e}</Badge>)}
          <p style={{ color: COLORS.muted }} className="text-xs">{totalCartas} carta{totalCartas === 1 ? "" : "s"}</p>
        </div>

        {exceso.length > 0 && (
          <div style={{ background: `${COLORS.gold}11`, border: `1px solid ${COLORS.gold}55`, color: COLORS.gold }} className="rounded-lg p-3 mb-4 text-xs">
            ⚠️ Un mazo oficial de Pokémon TCG permite máximo 4 copias de una carta que no sea Energía Básica — revisa: {exceso.map((mc) => mc.nombre).join(", ")}.
          </div>
        )}

        <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-2 text-sm uppercase">Agregar carta</p>
        <div className="mb-6"><CardPicker onSelect={agregarCarta} /></div>
        {guardandoCarta && <p style={{ color: COLORS.muted }} className="text-xs mb-4">Guardando...</p>}

        {actual.mazo_cartas.length === 0 ? (
          <p style={{ color: COLORS.muted }} className="text-sm text-center py-12">Todavía no agregas cartas a este mazo. Búscalas arriba.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {actual.mazo_cartas.map((mc) => (
              <div key={mc.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl overflow-hidden flex flex-col">
                <div style={{ background: COLORS.surface2 }} className="aspect-[4/5] flex items-center justify-center p-2">
                  {mc.imagen_url ? (
                    <img src={mc.imagen_url} alt={mc.nombre} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  ) : (
                    <Package size={32} color={COLORS.muted} />
                  )}
                </div>
                <div className="p-2 flex flex-col gap-1 flex-1">
                  <p className="text-xs font-semibold leading-snug line-clamp-2">{mc.nombre}</p>
                  <p style={{ color: COLORS.muted }} className="text-xs truncate">{mc.set_nombre}</p>
                  <div className="flex items-center justify-between gap-1 mt-auto pt-1">
                    <button onClick={() => cambiarCantidad(mc, -1)} style={{ background: COLORS.surface2, color: COLORS.text }} className="w-6 h-6 rounded-md text-sm font-bold">−</button>
                    <span style={{ fontFamily: "'Space Mono', monospace" }} className="text-sm font-semibold">{mc.cantidad}</span>
                    <button onClick={() => cambiarCantidad(mc, 1)} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="w-6 h-6 rounded-md text-sm font-bold">+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Lista de mazos ----
  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🧩 Mis mazos</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Arma tus mazos con un selector visual de cartas: elige la cantidad de cada una y ponles nombre y etiquetas.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.azul}66` }} className="rounded-xl p-4 mb-8 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input placeholder="Nombre del mazo (ej. Charizard ex)" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Etiquetas (ej. Estándar, Torneo)" value={etiquetasNuevo} onChange={(e) => setEtiquetasNuevo(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm" />
        <button onClick={crearMazo} disabled={creando || !nombreNuevo.trim()} style={{ background: COLORS.azulPalido, color: COLORS.bg }} className="rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap">
          {creando ? "Creando..." : "+ Nuevo mazo"}
        </button>
      </div>

      {mazos.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm text-center py-12">Todavía no tienes mazos. Crea el primero arriba.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mazos.map((m) => {
            const total = (m.mazo_cartas || []).reduce((s, mc) => s + mc.cantidad, 0);
            return (
              <div key={m.id} onClick={() => setMazoAbierto(m.id)}
                style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }}
                className="rounded-xl p-4 cursor-pointer transition-transform duration-200 hover:-translate-y-1">
                <p className="font-semibold mb-1">{m.nombre}</p>
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {(m.etiquetas || []).map((e) => <Badge key={e} color={COLORS.violeta}>{e}</Badge>)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p style={{ color: COLORS.muted }} className="text-xs">{total} carta{total === 1 ? "" : "s"} · {(m.mazo_cartas || []).length} única{(m.mazo_cartas || []).length === 1 ? "" : "s"}</p>
                  <button onClick={(e) => { e.stopPropagation(); borrarMazo(m.id); }} disabled={borrandoMazo === m.id} style={{ color: "#C24444" }} className="text-xs font-semibold whitespace-nowrap">
                    {borrandoMazo === m.id ? "..." : "Borrar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Envoltura de "Armar mazo": pestaña de deck builder (Mis mazos) +
// la pestaña original de buscar decklist contra el mercado ----
function ArmarMazoSection({ session, perfil, onAbrirChat, onVerTienda, onIrAPlanes }) {
  const [tab, setTab] = useState("mios");
  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("mios")}
          style={{
            background: tab === "mios" ? COLORS.surface2 : "transparent",
            border: `1px solid ${tab === "mios" ? COLORS.azulPalido : COLORS.surface2}`,
            color: tab === "mios" ? COLORS.azulPalido : COLORS.muted,
          }}
          className="rounded-lg px-4 py-2 text-sm font-semibold">🧩 Mis mazos</button>
        <button onClick={() => setTab("buscar")}
          style={{
            background: tab === "buscar" ? COLORS.surface2 : "transparent",
            border: `1px solid ${tab === "buscar" ? COLORS.azulPalido : COLORS.surface2}`,
            color: tab === "buscar" ? COLORS.azulPalido : COLORS.muted,
          }}
          className="rounded-lg px-4 py-2 text-sm font-semibold">🃏 Buscar en el mercado</button>
      </div>
      {tab === "mios" ? (
        session ? (
          <MazosView session={session} perfil={perfil} onIrAPlanes={onIrAPlanes} />
        ) : (
          <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">Inicia sesión para armar y guardar tus mazos.</p>
        )
      ) : (
        <ArmarMazoView session={session} onAbrirChat={onAbrirChat} onVerTienda={onVerTienda} />
      )}
    </div>
  );
}

// ---- Siguiendo: tiendas/vendedores que sigo + sus publicaciones nuevas ----
function SiguiendoView({ session, onVerPerfil, onVerTienda }) {
  const [seguidos, setSeguidos] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dejandoDeSeguir, setDejandoDeSeguir] = useState(null);

  const cargar = () => {
    setLoading(true); setError(null);
    sb(`seguidores?select=seguido_perfil_id,seguido:seguido_perfil_id(nombre,avatar_url,tipo)&perfil_id=eq.${session.user.id}&order=created_at.desc`, session)
      .then(async (filas) => {
        setSeguidos(filas);
        const individuales = filas.filter((f) => f.seguido?.tipo === "individual").map((f) => f.seguido_perfil_id);
        const tiendas = filas.filter((f) => f.seguido?.tipo === "tienda").map((f) => f.seguido_perfil_id);

        const tareas = [];
        if (individuales.length) {
          tareas.push(
            sb(`mercado_listings?select=*,perfiles(nombre,avatar_url)&perfil_id=in.(${individuales.join(",")})&order=created_at.desc&limit=20`)
          );
        }
        let tiendaIds = [];
        if (tiendas.length) {
          const filasT = await sb(`tiendas?select=id,nombre,perfil_id,perfiles(avatar_url)&perfil_id=in.(${tiendas.join(",")})`);
          tiendaIds = filasT;
        }
        const idsSoloTiendas = tiendaIds.map((t) => t.id);
        if (idsSoloTiendas.length) {
          tareas.push(
            Promise.all([
              sb(`inventario_tienda?select=*&tienda_id=in.(${idsSoloTiendas.join(",")})&order=created_at.desc&limit=20`),
              sb(`sellado_tienda?select=*&tienda_id=in.(${idsSoloTiendas.join(",")})&order=created_at.desc&limit=20`),
            ]).then(([inv, sell]) => {
              const mapaTienda = Object.fromEntries(tiendaIds.map((t) => [t.id, t]));
              return [
                ...inv.map((f) => ({ ...f, _origen: "tienda", _nombre: mapaTienda[f.tienda_id]?.nombre, _perfilId: mapaTienda[f.tienda_id]?.perfil_id, _avatar: mapaTienda[f.tienda_id]?.perfiles?.avatar_url, _titulo: f.carta })),
                ...sell.map((f) => ({ ...f, _origen: "tienda", _nombre: mapaTienda[f.tienda_id]?.nombre, _perfilId: mapaTienda[f.tienda_id]?.perfil_id, _avatar: mapaTienda[f.tienda_id]?.perfiles?.avatar_url, _titulo: f.producto })),
              ];
            })
          );
        }
        const resultados = await Promise.all(tareas);
        const deIndividuales = individuales.length
          ? resultados[0].map((f) => ({ ...f, _origen: "individual", _nombre: f.perfiles?.nombre, _perfilId: f.perfil_id, _avatar: f.perfiles?.avatar_url, _titulo: f.carta || f.producto }))
          : [];
        const deTiendas = idsSoloTiendas.length ? resultados[individuales.length ? 1 : 0] : [];
        const combinado = [...deIndividuales, ...deTiendas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setFeed(combinado.slice(0, 30));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [session.user.id]);

  const dejarDeSeguir = async (seguidoPerfilId) => {
    setDejandoDeSeguir(seguidoPerfilId);
    try {
      await sbWrite("DELETE", `seguidores?perfil_id=eq.${session.user.id}&seguido_perfil_id=eq.${seguidoPerfilId}`, {}, session);
      cargar();
    } catch (e) { setError(e.message); } finally { setDejandoDeSeguir(null); }
  };

  if (loading) return <Loading label="Cargando..." />;

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Siguiendo</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Tiendas y vendedores que sigues, y lo último que han publicado.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {seguidos.length === 0 ? (
        <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
          Todavía no sigues a nadie. Desde el perfil de una tienda o vendedor, toca "+ Seguir".
        </p>
      ) : (
        <>
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {seguidos.map((s) => (
              <div key={s.seguido_perfil_id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}`, width: 100 }} className="rounded-xl p-3 flex flex-col items-center gap-1 shrink-0">
                <button onClick={() => (s.seguido?.tipo === "tienda" ? onVerTienda?.(s.seguido_perfil_id) : onVerPerfil?.(s.seguido_perfil_id))} className="flex flex-col items-center gap-1">
                  <AvatarImg url={s.seguido?.avatar_url} size={40} />
                  <p className="text-xs text-center line-clamp-1" style={{ maxWidth: 90 }}>{s.seguido?.nombre}</p>
                </button>
                <button onClick={() => dejarDeSeguir(s.seguido_perfil_id)} disabled={dejandoDeSeguir === s.seguido_perfil_id} style={{ color: COLORS.muted }} className="text-[10px]">
                  {dejandoDeSeguir === s.seguido_perfil_id ? "..." : "Dejar de seguir"}
                </button>
              </div>
            ))}
          </div>

          <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Publicado recientemente</h3>
          {feed.length === 0 ? (
            <p style={{ color: COLORS.muted }} className="text-sm">Nadie que sigues ha publicado algo todavía.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {feed.map((r) => (
                <div key={`${r._origen}-${r.id}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl overflow-hidden flex flex-col">
                  <div style={{ background: COLORS.surface2 }} className="aspect-[4/5] flex items-center justify-center p-2">
                    {r.imagen_url ? <img src={r.imagen_url} alt={r._titulo} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <Package size={28} color={COLORS.muted} />}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-semibold line-clamp-2">{r._titulo}</p>
                    <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} size="sm" />
                    <button onClick={() => (r._origen === "tienda" ? onVerTienda?.(r._perfilId) : onVerPerfil?.(r._perfilId))} className="flex items-center gap-1 mt-1 hover:brightness-125">
                      <AvatarImg url={r._avatar} size={16} />
                      <p style={{ color: COLORS.muted }} className="text-[10px] truncate">{r._nombre}</p>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Mis compras y ventas: confirmar/rechazar ventas pendientes y calificar tras confirmarse ----
function AparienciaView({ perfil, onCambio, onIrAPlanes }) {
  const info = planDe(perfil);
  const [modo, setModo] = useState(() => localStorage.getItem(TEMA_MODO_KEY) || "noche");
  const [tipo, setTipo] = useState(() => localStorage.getItem(TEMA_TIPO_KEY) || "default");

  if (!info.redesExtra) {
    return (
      <div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-6">🎨 Apariencia</h2>
        <UpsellCard requiere={PLAN_INFO.superball} plan="superball" onIrAPlanes={onIrAPlanes}>
          Elige entre modo día y modo noche, y desde Amatista también puedes cambiar los colores de la página según tipos de Pokémon.
        </UpsellCard>
      </div>
    );
  }

  const cambiarModo = (nuevo) => {
    setModo(nuevo);
    localStorage.setItem(TEMA_MODO_KEY, nuevo);
    aplicarTema(nuevo, tipo);
    onCambio();
  };

  const cambiarTipo = (nuevo) => {
    setTipo(nuevo);
    localStorage.setItem(TEMA_TIPO_KEY, nuevo);
    aplicarTema(modo, nuevo);
    onCambio();
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">🎨 Apariencia</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Personaliza los colores de la página. Se guarda en este dispositivo.</p>

      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Modo día / noche</h3>
      <div className="flex gap-2 mb-8">
        {Object.entries(MODOS_COLOR).map(([key]) => (
          <button key={key} onClick={() => cambiarModo(key)}
            style={{
              background: modo === key ? COLORS.surface2 : "transparent",
              border: `1px solid ${modo === key ? COLORS.azulPalido : COLORS.surface2}`,
              color: modo === key ? COLORS.azulPalido : COLORS.muted,
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold">
            {key === "noche" ? "🌙 Noche" : "☀️ Día"}
          </button>
        ))}
      </div>

      <h3 style={{ color: COLORS.azulPalido }} className="font-semibold mb-3 text-sm uppercase">Color según tipo de Pokémon</h3>
      {!info.wishlistPremium ? (
        <UpsellCard requiere={PLAN_INFO.ultraball} plan="ultraball" onIrAPlanes={onIrAPlanes}>
          Los temas por tipo de Pokémon (agua, fuego, psíquico, etc.) son exclusivos de Amatista en adelante.
        </UpsellCard>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {Object.entries(TIPOS_POKEMON_INFO).map(([key, t]) => (
            <button key={key} onClick={() => cambiarTipo(key)}
              style={{
                background: tipo === key ? COLORS.surface2 : "transparent",
                border: `1px solid ${tipo === key ? COLORS.azulPalido : COLORS.surface2}`,
                color: tipo === key ? COLORS.azulPalido : COLORS.muted,
              }}
              className="rounded-lg px-2 py-2 text-xs font-semibold flex flex-col items-center gap-1">
              <span className="text-lg">{t.emoji}</span> {t.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComprasVentasView({ session }) {
  const [tab, setTab] = useState("compras");
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [misResenas, setMisResenas] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(null);
  const [calificando, setCalificando] = useState(null); // { ventaId, objetivoPerfilId, objetivoNombre }

  const cargar = () => {
    setLoading(true); setError(null);
    Promise.all([
      sb(`ventas?select=*,vendedor:vendedor_perfil_id(nombre,avatar_url)&comprador_perfil_id=eq.${session.user.id}&order=created_at.desc`, session),
      sb(`ventas?select=*,comprador:comprador_perfil_id(nombre,avatar_url)&vendedor_perfil_id=eq.${session.user.id}&order=created_at.desc`, session),
      sb(`resenas?select=venta_id&autor_perfil_id=eq.${session.user.id}`, session),
    ])
      .then(([c, v, r]) => { setCompras(c); setVentas(v); setMisResenas(new Set(r.map((x) => x.venta_id))); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [session.user.id]);

  const resolver = async (id, estado) => {
    setProcesando(id);
    try {
      await sbWrite("PATCH", `ventas?id=eq.${id}`, { estado, confirmada_at: estado === "confirmada" ? new Date().toISOString() : null }, session);
      cargar();
    } catch (e) { setError(e.message); } finally { setProcesando(null); }
  };

  const ESTADO_LABEL = { pendiente: "Por confirmar", confirmada: "Confirmada", rechazada: "Rechazada" };
  const ESTADO_COLOR = { pendiente: COLORS.azulClaro, confirmada: COLORS.gold, rechazada: COLORS.muted };

  if (loading) return <Loading label="Cargando tus compras y ventas..." />;

  const lista = tab === "compras" ? compras : ventas;

  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold mb-1">Mis compras y ventas</h2>
      <p style={{ color: COLORS.muted }} className="text-sm mb-6">Cuando marcas o te marcan una publicación como vendida, aparece aquí hasta que la otra parte la confirme.</p>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("compras")}
          style={{ background: tab === "compras" ? COLORS.surface2 : "transparent", border: `1px solid ${tab === "compras" ? COLORS.azulPalido : COLORS.surface2}`, color: tab === "compras" ? COLORS.azulPalido : COLORS.muted }}
          className="px-3 py-1.5 rounded-full text-sm font-semibold">Compras</button>
        <button onClick={() => setTab("ventas")}
          style={{ background: tab === "ventas" ? COLORS.surface2 : "transparent", border: `1px solid ${tab === "ventas" ? COLORS.azulPalido : COLORS.surface2}`, color: tab === "ventas" ? COLORS.azulPalido : COLORS.muted }}
          className="px-3 py-1.5 rounded-full text-sm font-semibold">Ventas</button>
      </div>

      {lista.length === 0 && (
        <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">
          {tab === "compras" ? "Todavía no tienes compras registradas." : "Todavía no has marcado ninguna publicación como vendida."}
        </p>
      )}

      <div className="grid gap-3">
        {lista.map((v) => {
          const otraParte = tab === "compras" ? v.vendedor : v.comprador;
          const objetivoPerfilId = tab === "compras" ? v.vendedor_perfil_id : v.comprador_perfil_id;
          const yaCalifique = misResenas.has(v.id);
          return (
            <div key={v.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <AvatarImg url={otraParte?.avatar_url} size={36} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{v.descripcion}</p>
                  <p style={{ color: COLORS.muted }} className="text-xs">
                    {tab === "compras" ? "Vendedor" : "Comprador"}: {otraParte?.nombre || "—"} {v.precio ? `· $${Number(v.precio).toLocaleString("es-MX")}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ color: ESTADO_COLOR[v.estado], border: `1px solid ${ESTADO_COLOR[v.estado]}55` }} className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                  {ESTADO_LABEL[v.estado]}
                </span>
                {tab === "compras" && v.estado === "pendiente" && (
                  <>
                    <button onClick={() => resolver(v.id, "confirmada")} disabled={procesando === v.id}
                      style={{ background: COLORS.azulClaro, color: COLORS.bg }} className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                      {procesando === v.id ? "..." : "Confirmar compra"}
                    </button>
                    <button onClick={() => resolver(v.id, "rechazada")} disabled={procesando === v.id}
                      style={{ color: COLORS.muted, border: `1px solid ${COLORS.surface2}` }} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">
                      No fue así
                    </button>
                  </>
                )}
                {v.estado === "confirmada" && !yaCalifique && (
                  <button onClick={() => setCalificando({ ventaId: v.id, objetivoPerfilId, objetivoNombre: otraParte?.nombre })}
                    style={{ color: COLORS.gold, border: `1px solid ${COLORS.gold}55` }} className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                    ⭐ Calificar
                  </button>
                )}
                {v.estado === "confirmada" && yaCalifique && (
                  <span style={{ color: COLORS.muted }} className="text-xs whitespace-nowrap">Ya calificaste</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {calificando && (
        <CalificarModal
          session={session}
          ventaId={calificando.ventaId}
          objetivoPerfilId={calificando.objetivoPerfilId}
          objetivoNombre={calificando.objetivoNombre}
          onClose={() => setCalificando(null)}
          onCalificado={cargar}
        />
      )}
    </div>
  );
}

function PerfilPublicoView({ perfilId, session, onVolver, onAbrirChat, onVerTienda }) {
  const [perfil, setPerfil] = useState(undefined); // undefined = cargando, null = no existe
  const [cartas, setCartas] = useState([]);
  const [sellado, setSellado] = useState([]);
  const [tienda, setTienda] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [resenas, setResenas] = useState([]);
  const [ventasCompletadas, setVentasCompletadas] = useState(0);
  const [totalDestellos, setTotalDestellos] = useState(0);
  const [numSeguidores, setNumSeguidores] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true); setError(null);
    setPerfil(undefined); setCartas([]); setSellado([]); setTienda(null); setWishlist([]); setCarpetas([]); setResenas([]); setVentasCompletadas(0); setTotalDestellos(0); setNumSeguidores(0);
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
        // Las reseñas y el contador de ventas NUNCA se ocultan, así que van fuera del objeto `vis`.
        tareas.push(
          sb(`resenas?select=*,autor:autor_perfil_id(nombre,avatar_url)&objetivo_perfil_id=eq.${perfilId}&order=created_at.desc&limit=20`).then(setResenas)
        );
        tareas.push(
          sb(`ventas?select=id&vendedor_perfil_id=eq.${perfilId}&estado=eq.confirmada`).then((filas) => setVentasCompletadas(filas.length))
        );
        tareas.push(
          sb(`destellos_movimientos?select=cantidad&perfil_id=eq.${perfilId}`).then((filas) => setTotalDestellos(filas.reduce((s, m) => s + m.cantidad, 0)))
        );
        tareas.push(
          sb(`seguidores?select=id&seguido_perfil_id=eq.${perfilId}`).then((filas) => setNumSeguidores(filas.length))
        );
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
  const acento = perfil.color_acento || COLORS.azulPalido;

  return (
    <div>
      <button onClick={onVolver} style={{ color: COLORS.muted }} className="flex items-center gap-1 text-sm mb-6"><ChevronLeft size={16} /> Volver</button>

      <div style={{ background: COLORS.surface, border: `1px solid ${perfil.color_acento || COLORS.surface2}` }} className="rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <HoloAvatar perfil={perfil} ringSize={62}>
            <AvatarImg url={perfil.avatar_url} size={56} />
          </HoloAvatar>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold">{perfil.nombre}</h2>
              <PlanBadge perfil={perfil} />
              <VerificadoBadge perfil={perfil} />
              <NivelBadge total={totalDestellos} />
              <VendedorBadge ventasCompletadas={ventasCompletadas} resenas={resenas} />
            </div>
            {tienda?.zona && <p style={{ color: COLORS.muted }} className="text-sm">{tienda.zona}</p>}
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <MiembroDesde perfil={perfil} />
              {ventasCompletadas > 0 && <p style={{ color: COLORS.muted }} className="text-xs">🛒 {ventasCompletadas} venta{ventasCompletadas === 1 ? "" : "s"} completada{ventasCompletadas === 1 ? "" : "s"}</p>}
              <p style={{ color: COLORS.muted }} className="text-xs">👥 {numSeguidores} seguidor{numSeguidores === 1 ? "" : "es"}</p>
            </div>
          </div>
          {session && session.user.id !== perfilId && (
            <div className="ml-auto flex items-center gap-2">
              <SeguirBoton session={session} seguidoPerfilId={perfilId} />
              <button
                onClick={() => onAbrirChat(perfilId, perfil.nombre, "Perfil", perfil.whatsapp, perfil.facebook, perfil.avatar_url)}
                style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 whitespace-nowrap">
                <MessageCircle size={12} /> Contactar
              </button>
              <ReportarBoton session={session} tipo="perfil" tablaObjetivo="perfiles" objetivoId={perfilId} objetivoPerfilId={perfilId} objetivoNombre={perfil.nombre} />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <DiamanteEmblema perfil={perfil} />
          <InsigniasActividad perfil={perfil} wishlist={wishlist} carpetas={carpetas} />
        </div>

        {perfil.bio && <p className="mt-3 text-sm" style={{ color: COLORS.text }}>{perfil.bio}</p>}

        {vis.favoritos !== false && favoritos.length > 0 && (
          <div className="mt-4">
            <p style={{ color: acento }} className="text-xs font-semibold uppercase mb-2">Pokémon favoritos</p>
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

        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <p style={{ color: acento }} className="text-xs font-semibold uppercase">Reseñas</p>
            {resenas.length > 0 && (
              <>
                <EstrellasDisplay valor={resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length} />
                <p style={{ color: COLORS.muted }} className="text-xs">
                  {(resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length).toFixed(1)} ({resenas.length} reseña{resenas.length === 1 ? "" : "s"})
                </p>
              </>
            )}
          </div>
          {resenas.length === 0 ? (
            <p style={{ color: COLORS.muted }} className="text-xs">Todavía no tiene reseñas.</p>
          ) : (
            <div className="grid gap-2">
              {resenas.slice(0, 5).map((r) => (
                <div key={r.id} style={{ background: `${COLORS.surface2}80` }} className="rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AvatarImg url={r.autor?.avatar_url} size={20} />
                    <p className="text-xs font-medium">{r.autor?.nombre || "Usuario"}</p>
                    <EstrellasDisplay valor={r.estrellas} size={12} />
                  </div>
                  {r.comentario && <p style={{ color: COLORS.muted }} className="text-xs">{r.comentario}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

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

      {(() => {
        const bloques = {
          publicaciones: perfil.tipo === "individual" && vis.publicaciones !== false && (cartas.length > 0 || sellado.length > 0) && (
            <div key="publicaciones" className="mb-8">
              <h3 style={{ color: acento }} className="font-semibold mb-3 text-sm uppercase">En venta</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {[...cartas, ...sellado].map((r) => (
                  <div key={r.id} style={{ background: COLORS.surface, border: `1px solid ${estaDestacado(r) ? COLORS.azulPalido + "66" : COLORS.surface2}` }} className="rounded-xl overflow-hidden flex flex-col">
                    <div style={{ background: COLORS.surface2 }} className="aspect-[4/5] flex items-center justify-center p-2">
                      {r.imagen_url ? <img src={r.imagen_url} alt={r.carta} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <Package size={28} color={COLORS.muted} />}
                    </div>
                    <div className="p-2">
                      <div className="flex items-center gap-1 flex-wrap mb-1">
                        {r.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}
                        {r.tipo !== "sellado" && <IdiomaBadge idioma={r.idioma} />}
                        <BoostBadge item={r} />
                      </div>
                      <p className="text-xs font-semibold line-clamp-2">{r.carta}</p>
                      <PrecioConOferta precio={r.precio} precioAntes={r.precio_antes} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ),
          wishlist: vis.wishlist !== false && wishlist.length > 0 && (
            <div key="wishlist" className="mb-8">
              <h3 style={{ color: acento }} className="font-semibold mb-3 text-sm uppercase">Wishlist</h3>
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
          ),
          carpetas: vis.carpetas !== false && carpetas.length > 0 && (
            <div key="carpetas">
              <h3 style={{ color: acento }} className="font-semibold mb-3 text-sm uppercase">📁 Carpetas</h3>
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
          ),
        };
        const orden = Array.isArray(perfil.orden_secciones) && perfil.orden_secciones.length === 3
          ? perfil.orden_secciones
          : SECCIONES_PERFIL_ORDEN_DEFAULT;
        return orden.map((key) => bloques[key] || null);
      })()}
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
      const res = await fetch("/api/mercadopago/gestionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "crear_suscripcion", perfilId: session.user.id, plan, email: session.user.email }),
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
      const res = await fetch("/api/mercadopago/gestionar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "cancelar_suscripcion", perfilId: session.user.id }),
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

const SECCIONES_PERFIL_LABEL = {
  publicaciones: "Mis cartas y producto sellado en venta",
  wishlist: "Mi Wishlist",
  carpetas: "Mis carpetas",
};
const SECCIONES_PERFIL_ORDEN_DEFAULT = ["publicaciones", "wishlist", "carpetas"];

function EditarPerfilModal({ session, perfil, onClose, onGuardado, onVerMiPerfil }) {
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
  const [bio, setBio] = useState(perfil?.bio || "");
  const [colorAcento, setColorAcento] = useState(perfil?.color_acento || "");
  const [orden, setOrden] = useState(() => {
    const guardado = perfil?.orden_secciones;
    if (Array.isArray(guardado) && guardado.length === SECCIONES_PERFIL_ORDEN_DEFAULT.length) return guardado;
    return SECCIONES_PERFIL_ORDEN_DEFAULT;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const moverSeccion = (i, dir) => {
    setOrden((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

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
        ...(info.redesExtra ? { bio: bio.trim() || null, color_acento: colorAcento || null, orden_secciones: orden } : {}),
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

          {info.redesExtra ? (
            <>
              <div>
                <p style={{ color: COLORS.azulPalido }} className="text-xs font-semibold uppercase mb-1">Biografía</p>
                <textarea placeholder="Cuéntale a los demás algo sobre ti o tu tienda..." rows={3} maxLength={280}
                  value={bio} onChange={(e) => setBio(e.target.value)} style={inputStyle} className="rounded-lg px-3 py-2 text-sm w-full outline-none" />
                <p style={{ color: COLORS.muted }} className="text-xs mt-0.5">{bio.length}/280</p>
              </div>

              <div>
                <p style={{ color: COLORS.azulPalido }} className="text-xs font-semibold uppercase mb-1">Color de acento de tu perfil</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={colorAcento || "#9EC0EE"} onChange={(e) => setColorAcento(e.target.value)}
                    className="rounded-lg h-9 w-14 cursor-pointer" style={{ background: "transparent", border: `1px solid ${COLORS.surface2}` }} />
                  {colorAcento && (
                    <button type="button" onClick={() => setColorAcento("")} style={{ color: COLORS.muted }} className="text-xs">Quitar</button>
                  )}
                </div>
              </div>

              <div>
                <p style={{ color: COLORS.azulPalido }} className="text-xs font-semibold uppercase mb-1">Orden de tus secciones</p>
                <div className="grid gap-1">
                  {orden.map((key, i) => (
                    <div key={key} style={{ background: COLORS.bg, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-3 py-1.5 flex items-center justify-between gap-2">
                      <p className="text-sm">{SECCIONES_PERFIL_LABEL[key]}</p>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => moverSeccion(i, -1)} disabled={i === 0} style={{ color: COLORS.muted, opacity: i === 0 ? 0.3 : 1 }}><ArrowUp size={14} /></button>
                        <button type="button" onClick={() => moverSeccion(i, 1)} disabled={i === orden.length - 1} style={{ color: COLORS.muted, opacity: i === orden.length - 1 ? 0.3 : 1 }}><ArrowDown size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {onVerMiPerfil && (
                <button type="button" onClick={onVerMiPerfil} style={{ color: COLORS.azulClaro, border: `1px solid ${COLORS.azulClaro}55` }} className="rounded-lg py-2 text-sm font-semibold">
                  Ver mi perfil público
                </button>
              )}
            </>
          ) : (
            <p style={{ color: COLORS.muted }} className="text-xs">
              🔒 Biografía, color de acento y orden de secciones disponibles desde Zafiro.
            </p>
          )}

          <button onClick={guardar} disabled={saving || !nombre.trim()} style={{ background: COLORS.azulPalido, color: COLORS.bg, opacity: saving ? 0.6 : 1 }} className="rounded-lg py-2 font-semibold mt-1 flex items-center justify-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />} Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Aviso de privacidad / Términos de uso ----
// Contenido genérico de referencia, no es asesoría legal — antes de
// publicar de verdad, vale la pena que un abogado lo revise y lo adapte
// a tu caso (razón social, domicilio fiscal, etc.).
function LegalView({ tipo, onVolver }) {
  const hoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  return (
    <div>
      <button onClick={onVolver} style={{ color: COLORS.muted }} className="flex items-center gap-1 text-sm mb-6"><ChevronLeft size={16} /> Volver</button>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-2xl p-6 grid gap-4 text-sm">
        {tipo === "privacidad" ? (
          <>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold">Aviso de Privacidad</h1>
            <p style={{ color: COLORS.muted }}>Última actualización: {hoy}</p>
            <p>Encuentra Cartas ("la plataforma") es responsable del tratamiento de tus datos personales conforme a este aviso.</p>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">¿Qué datos recabamos?</p>
              <p>Nombre, correo electrónico, contraseña (cifrada), y de forma opcional: WhatsApp, enlaces a Instagram/Facebook, foto de perfil, ubicación de tu tienda (si tienes una) y tus Pokémon favoritos.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">¿Para qué los usamos?</p>
              <p>Para crear y mostrar tu perfil público, permitir que otros usuarios te contacten, procesar pagos de planes y Boost, enviarte notificaciones (correo y push) sobre tu Wishlist, tus pagos y anuncios de la plataforma, y para moderar contenido reportado.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">¿Con quién los compartimos?</p>
              <p>No vendemos tus datos. Usamos proveedores que procesan datos en nuestro nombre: Supabase (base de datos y autenticación), Mercado Pago (pagos), un proveedor de correo (avisos por email) y Google (notificaciones push y sprites de Pokémon). Tu nombre, foto, plan y lo que publiques son visibles públicamente para otros usuarios, según lo que elijas mostrar en "Editar perfil".</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Cookies y almacenamiento local</p>
              <p>Usamos el almacenamiento local de tu navegador para mantener tu sesión iniciada y recordar qué notificaciones ya viste. No usamos cookies de publicidad ni de rastreo de terceros.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Tus derechos (ARCO)</p>
              <p>Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos personales, o pedir que se elimine tu cuenta, escribiéndonos desde el chat de la app o al correo de contacto de la plataforma.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Cambios a este aviso</p>
              <p>Podemos actualizar este aviso; si hay cambios importantes, lo anunciaremos dentro de la app.</p>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-xl font-bold">Términos de Uso</h1>
            <p style={{ color: COLORS.muted }}>Última actualización: {hoy}</p>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Qué es Encuentra Cartas</p>
              <p>Es una plataforma que conecta a compradores y vendedores de cartas coleccionables y producto sellado. No somos dueños del inventario publicado ni parte de ninguna compraventa entre usuarios.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Responsabilidad sobre las transacciones</p>
              <p>Las compras, ventas e intercambios ocurren directamente entre usuarios. Encuentra Cartas no garantiza la autenticidad, condición, precio ni la entrega de ninguna carta o producto, y no es responsable de disputas entre comprador y vendedor. Recomendamos verificar la reputación del vendedor y acordar los detalles antes de pagar.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Tu cuenta</p>
              <p>Eres responsable de que la información de tu cuenta sea verdadera y de mantener segura tu contraseña. Debes ser mayor de edad, o usar la plataforma bajo supervisión de un adulto responsable.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Contenido prohibido</p>
              <p>No se permite publicar productos falsificados, contenido ilegal, spam, ni suplantar la identidad de otra persona o tienda. Las publicaciones o cuentas reportadas se revisan y pueden ser eliminadas o suspendidas si incumplen estos términos.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Planes de pago</p>
              <p>Los planes pagados se cobran de forma recurrente mensual a través de Mercado Pago. Puedes cancelar la renovación automática cuando quieras desde "Planes"; cancelar detiene el próximo cobro, no reembolsa el periodo ya pagado.</p>
            </div>
            <div>
              <p style={{ color: COLORS.azulPalido }} className="font-semibold mb-1">Sin garantías</p>
              <p>La plataforma se ofrece "tal cual", sin garantías de disponibilidad continua o de que esté libre de errores.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TIPO_NOTIFICACION_ICONO = { wishlist: Sparkles, anuncio: Megaphone, mensaje: MessageCircle, torneo: Calendar, plan: Shield, boost: Sparkles, error: AlertCircle, venta: Star, seguido_publico: User };

// Las notificaciones "globales" (perfil_id null, ej. Anuncios) no tienen
// dueño en la base de datos, así que no se pueden marcar "leida" ahí — se
// guarda el set de IDs ya vistas en este navegador. Las personales sí usan
// la columna `leida` de la base de datos (así se sincronizan entre
// dispositivos), y además se reflejan aquí también.
const NOTIS_LEIDAS_KEY = "ec_notis_leidas_v2";
function leerNotisLeidas() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIS_LEIDAS_KEY) || "[]")); } catch { return new Set(); }
}
function guardarNotisLeidas(set) {
  try { localStorage.setItem(NOTIS_LEIDAS_KEY, JSON.stringify([...set])); } catch {}
}

function NotificationBell({ session, onNavigate }) {
  const [abierto, setAbierto] = useState(false);
  const [notis, setNotis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [leidasLocal, setLeidasLocal] = useState(() => leerNotisLeidas());
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

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

  const esNoLeida = (n) => (n.perfil_id ? !n.leida : !leidasLocal.has(n.id));
  const noLeidas = notis.filter(esNoLeida).length;

  // Calcula la posición a partir del botón real (en vez de depender de que
  // algún ancestro tenga el ancho/posición "correcta"). El panel se manda
  // por portal a document.body (ver más abajo) precisamente porque el
  // <header> tiene backdrop-filter: blur(...), y eso convierte a cualquier
  // descendiente "position: fixed" en fijo respecto al header en vez del
  // viewport real (una regla del CSS, no un bug de este componente) — por
  // más que las coordenadas se calcularan bien, se aplicaban en el marco de
  // referencia equivocado y el panel terminaba cortado en varios celulares.
  // Con el portal, el panel ya no es descendiente del header, así que
  // "fixed" vuelve a significar "fijo respecto a la pantalla" de verdad.
  const posicionar = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const margen = 8;
    const ancho = Math.min(320, window.innerWidth - margen * 2);
    // Ancla el borde derecho del panel al del botón, pero SIEMPRE lo recorta
    // para que quede dentro de la pantalla — si solo se ancla al botón sin
    // este límite, en celulares donde la campanita no está pegada al borde
    // derecho (hay más íconos después, como el menú) el panel se sale por
    // la izquierda en vez de quedar cortado por la derecha.
    let left = r.right - ancho;
    left = Math.max(margen, Math.min(left, window.innerWidth - ancho - margen));
    setPos({ top: r.bottom + 8, left, ancho });
  };

  const abrir = () => {
    const vaAbrir = !abierto;
    setAbierto(vaAbrir);
    if (vaAbrir) {
      cargar();
      posicionar();
    }
  };

  // Vuelve a calcular la posición si cambia el tamaño de la pantalla (girar
  // el celular, aparecer/ocultarse la barra de direcciones) mientras el
  // panel sigue abierto.
  useEffect(() => {
    if (!abierto) return;
    const onResize = () => posicionar();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const VISTA_POR_TIPO = { wishlist: "alertas", anuncio: "news", mensaje: "inbox", venta: "comprasVentas", seguido_publico: "siguiendo" };

  // Marca como leídas todas las que están en pantalla — ver la lista ya
  // cuenta como "leído", así el numerito no depende de acertarle al click
  // exacto en cada una ni se vuelve a poner tras recargar.
  const marcarTodasLeidas = async (lista) => {
    const globales = lista.filter((n) => !n.perfil_id && !leidasLocal.has(n.id));
    if (globales.length) {
      const nuevo = new Set(leidasLocal);
      globales.forEach((n) => nuevo.add(n.id));
      setLeidasLocal(nuevo);
      guardarNotisLeidas(nuevo);
    }
    const pendientes = lista.filter((n) => n.perfil_id && !n.leida);
    if (pendientes.length) {
      setNotis((prev) => prev.map((n) => (n.perfil_id && !n.leida ? { ...n, leida: true } : n)));
      if (session) {
        await Promise.allSettled(
          pendientes.map((n) => sbWrite("PATCH", `notificaciones?id=eq.${n.id}`, { leida: true }, session).catch((e) => console.error("No se pudo marcar leída:", e)))
        );
      }
    }
  };

  useEffect(() => {
    if (abierto && !loading && notis.length > 0) marcarTodasLeidas(notis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, loading]);

  const irA = (n) => {
    const vista = VISTA_POR_TIPO[n.tipo];
    if (vista) onNavigate?.(vista);
    setAbierto(false);
  };

  return (
    <>
      <button ref={btnRef} onClick={abrir} style={{ color: COLORS.muted }} className="relative p-2 rounded-lg">
        <Bell size={18} />
        {noLeidas > 0 && (
          <span style={{ background: COLORS.azulPalido, color: COLORS.bg }}
            className="absolute -top-1 -right-1 rounded-full text-[10px] font-bold w-4 h-4 flex items-center justify-center">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setAbierto(false)} />
          {/* Portal a document.body + position:fixed calculado desde el botón
              real: así el panel nunca es descendiente del <header> (que tiene
              backdrop-filter, y por lo tanto redefine el marco de referencia
              de "fixed" para sus descendientes) y nunca se sale de la
              pantalla, sea cual sea el ancho del header o del dispositivo.
              z-index por encima del header (que usa 50) porque, al vivir en
              el portal, ya no comparten el mismo contexto de apilamiento. */}
          <div
            style={{
              background: COLORS.surface2, border: `1px solid ${COLORS.azulMedio}66`, boxShadow: `0 0 24px ${COLORS.azulMedio}33`,
              position: "fixed", top: pos.top, left: pos.left, width: pos.ancho,
            }}
            className="rounded-xl overflow-hidden z-[91]"
          >
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${COLORS.bg}` }}>
              <p className="text-sm font-semibold">Notificaciones</p>
              {noLeidas > 0 && <p style={{ color: COLORS.muted }} className="text-xs">Se marcan leídas al verlas</p>}
            </div>
            <div style={{ maxHeight: "min(320px, 60vh)", overflowY: "auto" }}>
              {loading && <p style={{ color: COLORS.muted }} className="text-xs p-4 text-center">Cargando...</p>}
              {!loading && notis.length === 0 && <p style={{ color: COLORS.muted }} className="text-xs p-4 text-center">Sin notificaciones todavía.</p>}
              {!loading && notis.map((n) => {
                const Icon = TIPO_NOTIFICACION_ICONO[n.tipo] || Bell;
                return (
                  <button key={n.id} onClick={() => irA(n)}
                    style={{ background: esNoLeida(n) ? `${COLORS.azul}22` : "transparent", borderBottom: `1px solid ${COLORS.bg}` }}
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
        </>,
        document.body
      )}
    </>
  );
}

function Drawer({ session, perfil, secundarios, view, onNavigate, onEditarPerfil, onVerTutorial, onLogout, onLogin, onClose }) {
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
          <button onClick={onVerTutorial} style={{ color: COLORS.text }} className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium hover:brightness-125">
            <Sparkles size={18} /> Ver tutorial
          </button>
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

// ---- Distancia en línea recta entre dos coordenadas (fórmula de Haversine) ----
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const formatoDistancia = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

// ---- Búsqueda del Mercado/tiendas por palabras sueltas contra nombre y set ----
// Para que "Sprigatito 016", "Sprigatito #016" o "Sprigatito Journey Together"
// encuentren una publicación sin importar el orden: cada palabra debe aparecer
// en el nombre de la carta O en su set_nombre (que ya guarda cosas como
// "Journey Together 016/159"), sin exigir que toda la frase esté en un solo campo.
function filtroPalabrasCartaOSet(texto) {
  const palabras = (texto || "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^#/, ""))
    .filter(Boolean);
  if (!palabras.length) return "";
  const grupos = palabras.map((w) => `or(carta.ilike.*${encodeURIComponent(w)}*,set_nombre.ilike.*${encodeURIComponent(w)}*)`);
  return `and=(${grupos.join(",")})`;
}

// ---- Geocodificación: convierte una dirección en texto a lat/lng ----
// Usa Nominatim (OpenStreetMap), gratis y sin necesitar API key.
async function buscarCoordenadasPorDireccion(direccion) {
  const q = encodeURIComponent(direccion);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${q}`);
  if (!res.ok) throw new Error("No se pudo buscar la dirección.");
  const data = await res.json();
  if (!data?.length) throw new Error("No se encontró esa dirección. Prueba escribirla más completa (calle, número, colonia, ciudad).");
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [, setTemaVersion] = useState(0);
  const [chatContext, setChatContext] = useState(null);
  const [adminStash, setAdminStash] = useState(() => {
    const s = localStorage.getItem("ec_session_admin_stash");
    return s ? JSON.parse(s) : null;
  });

  // Cuando sb()/sbWrite() renuevan la sesión sola (el token expiró), nos enteramos aquí.
  useEffect(() => {
    setOnSesionRefrescada((nueva) => setSession(nueva));
    return () => { setOnSesionRefrescada(null); };
  }, []);

  // Para poder incluir quién estaba conectado si algo truena (reportarError).
  useEffect(() => {
    setUidActual(session?.user?.id || null);
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

  // Tutorial de bienvenida: se muestra una sola vez, la primera vez que alguien
  // abre la web (con o sin cuenta); se puede volver a ver desde el menú lateral.
  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARDING_SEEN_KEY)) setShowOnboarding(true);
    } catch {}
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
    localStorage.removeItem("ec_session_admin_stash");
    setAdminStash(null);
    setSession(null);
    setPerfil(null);
  };

  // Un admin puede "entrar" a un sub-perfil que administra (ver AdminPanel > Sub-perfiles):
  // guardamos su propia sesión aparte para poder regresar a ella después.
  const entrarComoSubperfil = (subSession) => {
    localStorage.setItem("ec_session_admin_stash", JSON.stringify(session));
    localStorage.setItem("ec_session", JSON.stringify(subSession));
    setAdminStash(session);
    setSession(subSession);
    cargarOCrearPerfil(subSession);
    setView("myMarket");
  };

  const volverAMiCuentaAdmin = () => {
    if (!adminStash) return;
    localStorage.setItem("ec_session", JSON.stringify(adminStash));
    localStorage.removeItem("ec_session_admin_stash");
    setSession(adminStash);
    cargarOCrearPerfil(adminStash);
    setAdminStash(null);
    setView("admin");
  };

  const [tiendas, setTiendas] = useState([]);
  const [loadingTiendas, setLoadingTiendas] = useState(true);
  const [errorTiendas, setErrorTiendas] = useState(null);

  // ---- Directorio: filtro por zona + tienda más cercana (Zafiro+) ----
  const [filtroZona, setFiltroZona] = useState("");
  const [ubicacionUsuario, setUbicacionUsuario] = useState(null); // { lat, lng }
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState(null);

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) { setErrorUbicacion("Tu navegador no soporta geolocalización."); return; }
    setBuscandoUbicacion(true); setErrorUbicacion(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUbicacionUsuario({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setBuscandoUbicacion(false); },
      () => { setErrorUbicacion("No pudimos obtener tu ubicación (¿diste permiso en el navegador?)."); setBuscandoUbicacion(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const zonasDisponibles = [...new Set(tiendas.map((t) => t.zona).filter(Boolean))].sort();
  const tiendasConDistancia = tiendas.map((t) => ({
    ...t,
    _distanciaKm: ubicacionUsuario && t.lat != null && t.lng != null ? distanciaKm(ubicacionUsuario.lat, ubicacionUsuario.lng, t.lat, t.lng) : null,
  }));
  const tiendasFiltradas = tiendasConDistancia
    .filter((t) => !filtroZona || t.zona === filtroZona)
    .sort((a, b) => {
      if (!ubicacionUsuario) return 0;
      if (a._distanciaKm == null && b._distanciaKm == null) return 0;
      if (a._distanciaKm == null) return 1;
      if (b._distanciaKm == null) return -1;
      return a._distanciaKm - b._distanciaKm;
    });
  const tiendaMasCercana = ubicacionUsuario ? tiendasFiltradas.find((t) => t._distanciaKm != null) : null;

  const [searchResults, setSearchResults] = useState({ tiendas: [], mercado: [], sellado: [] });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [selectedStore, setSelectedStore] = useState(null);
  const [selectedPerfilId, setSelectedPerfilId] = useState(null);
  const [vistaAntesDePerfil, setVistaAntesDePerfil] = useState("search");
  const [vistaAntesLegal, setVistaAntesLegal] = useState("search");
  const irALegal = (id) => { setVistaAntesLegal(view); setView(id); };
  const [storeInventory, setStoreInventory] = useState([]);
  const [storeSellado, setStoreSellado] = useState([]);
  const [loadingStoreDetail, setLoadingStoreDetail] = useState(false);
  const [storeResenas, setStoreResenas] = useState([]);
  const [storeVentasCompletadas, setStoreVentasCompletadas] = useState(0);
  const [storeDestellos, setStoreDestellos] = useState(0);
  const [storeSeguidores, setStoreSeguidores] = useState(0);

  const [market, setMarket] = useState([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [news, setNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [inicioTienda, setInicioTienda] = useState([]);
  const [loadingInicio, setLoadingInicio] = useState(false);

  // Carga inicial: lista de tiendas reales
  useEffect(() => {
    setLoadingTiendas(true);
    sb("tiendas?select=*,perfiles(plan,plan_vence,instagram,google_maps_url,avatar_url,diamante_desde,created_at)&order=nombre.asc")
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
    const filtroCartaSet = filtroPalabrasCartaOSet(query);
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(() => {
      Promise.all([
        sb(`inventario_tienda?select=*,tiendas(nombre,zona,direccion,telefono,perfil_id,perfiles(plan,plan_vence,avatar_url))&${filtroCartaSet}&order=precio.asc`),
        sb(`mercado_listings?select=*,perfiles(nombre,whatsapp,facebook,plan,plan_vence,avatar_url)&${filtroCartaSet}&order=precio.asc`),
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
    setStoreResenas([]); setStoreVentasCompletadas(0); setStoreDestellos(0); setStoreSeguidores(0);
    Promise.all([
      sb(`inventario_tienda?select=*&tienda_id=eq.${store.id}`),
      sb(`sellado_tienda?select=*&tienda_id=eq.${store.id}`),
    ])
      .then(([inv, sell]) => { setStoreInventory(conBoostPrimero(inv)); setStoreSellado(conBoostPrimero(sell)); })
      .finally(() => setLoadingStoreDetail(false));
    if (store.perfil_id) {
      sb(`resenas?select=*,autor:autor_perfil_id(nombre,avatar_url)&objetivo_perfil_id=eq.${store.perfil_id}&order=created_at.desc&limit=20`).then(setStoreResenas).catch(() => {});
      sb(`ventas?select=id&vendedor_perfil_id=eq.${store.perfil_id}&estado=eq.confirmada`).then((filas) => setStoreVentasCompletadas(filas.length)).catch(() => {});
      sb(`destellos_movimientos?select=cantidad&perfil_id=eq.${store.perfil_id}`).then((filas) => setStoreDestellos(filas.reduce((s, m) => s + m.cantidad, 0))).catch(() => {});
      sb(`seguidores?select=id&seguido_perfil_id=eq.${store.perfil_id}`).then((filas) => setStoreSeguidores(filas.length)).catch(() => {});
    }
  };

  const verPerfil = (perfilId) => {
    if (!perfilId) return;
    setVistaAntesDePerfil(view);
    setSelectedPerfilId(perfilId);
    setView("perfilPublico");
  };

  const verTiendaDesdePerfil = (tiendaId) => {
    sb(`tiendas?select=*,perfiles(plan,plan_vence,instagram,google_maps_url,avatar_url,diamante_desde,created_at)&id=eq.${tiendaId}`)
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
    { id: "armarMazo", label: "Armar mazo", icon: Layers },
    { id: "comunidad", label: "Comunidad", icon: Newspaper },
    ...(session ? [{ id: "alertas", label: "Wishlist", icon: Sparkles }] : []),
    ...(session ? [{ id: "siguiendo", label: "Siguiendo", icon: User }] : []),
    ...(session ? [{ id: "comprasVentas", label: "Mis compras y ventas", icon: Star }] : []),
    ...(session ? [{ id: "recompensas", label: "Recompensas", icon: Sparkles }] : []),
    ...(session ? [{ id: "apariencia", label: "Apariencia", icon: Palette }] : []),
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

      {adminStash && (
        <div style={{ position: "relative", zIndex: 10, background: COLORS.gold, color: COLORS.bg }}
          className="px-4 py-2 text-sm font-semibold flex items-center justify-center gap-3 flex-wrap text-center">
          <span>🔀 Estás usando el sub-perfil "{perfil?.nombre}"</span>
          <button onClick={volverAMiCuentaAdmin} className="underline whitespace-nowrap">Volver a mi cuenta admin</button>
        </div>
      )}

      {showDrawer && (
        <Drawer
          session={session}
          perfil={perfil}
          secundarios={navSecundarios}
          view={view}
          onNavigate={(id) => { setView(id); setShowDrawer(false); }}
          onEditarPerfil={() => { setShowEditarPerfil(true); setShowDrawer(false); }}
          onVerTutorial={() => { setShowOnboarding(true); setShowDrawer(false); }}
          onLogout={() => { handleLogout(); setShowDrawer(false); }}
          onLogin={() => { setShowAccountModal(true); setShowDrawer(false); }}
          onClose={() => setShowDrawer(false)}
        />
      )}

      {showOnboarding && <OnboardingTutorial onClose={() => setShowOnboarding(false)} />}

      {showAccountModal && <AccountModal onClose={() => setShowAccountModal(false)} onAuthed={handleAuthed} />}
      {showEditarPerfil && session && (
        <EditarPerfilModal
          session={session}
          perfil={perfil}
          onClose={() => setShowEditarPerfil(false)}
          onGuardado={() => cargarOCrearPerfil(session)}
          onVerMiPerfil={() => { setShowEditarPerfil(false); verPerfil(session.user.id); }}
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
                                {r.tipo !== "sellado" && <IdiomaBadge idioma={r.idioma} />}
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
                      <div className="flex gap-2 items-center mb-1 flex-wrap"><Badge color={COLORS.azulPalido}>Tienda</Badge><p className="font-semibold text-lg">{r.carta}</p><IdiomaBadge idioma={r.idioma} /><PlanBadge perfil={r.tiendas?.perfiles} /><BoostBadge item={r} /></div>
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
                      <div className="flex gap-2 items-center mb-1 flex-wrap"><Badge color={COLORS.azulClaro}>Vendedor individual</Badge>{r.tipo === "sellado" && <Badge color={COLORS.azulMedio}>Sellado</Badge>}<p className="font-semibold text-lg">{r.carta}</p>{r.tipo !== "sellado" && <IdiomaBadge idioma={r.idioma} />}<PlanBadge perfil={r.perfiles} /><BoostBadge item={r} /></div>
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

            {!planDe(perfil).ubicacion ? (
              <div className="mb-6">
                <UpsellCard requiere={PLAN_INFO.superball} plan="superball" onIrAPlanes={() => setView("planes")}>
                  Filtra tiendas por zona y encuentra la más cercana con tu ubicación.
                </UpsellCard>
              </div>
            ) : (
              <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.surface2}` }} className="rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
                <select value={filtroZona} onChange={(e) => setFiltroZona(e.target.value)}
                  style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.surface2}` }} className="rounded-lg px-2 py-2 text-sm">
                  <option value="">Todas las zonas</option>
                  {zonasDisponibles.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <button onClick={usarMiUbicacion} disabled={buscandoUbicacion}
                  style={{ color: COLORS.azulPalido, border: `1px solid ${COLORS.azul}55` }}
                  className="rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-1">
                  <Navigation size={14} /> {buscandoUbicacion ? "Buscando tu ubicación..." : ubicacionUsuario ? "📍 Ubicación activa" : "Usar mi ubicación"}
                </button>
                {ubicacionUsuario && (
                  <button onClick={() => setUbicacionUsuario(null)} style={{ color: COLORS.muted }} className="text-xs underline">Quitar</button>
                )}
                {errorUbicacion && <p style={{ color: "#C24444" }} className="text-xs">{errorUbicacion}</p>}
              </div>
            )}

            {tiendaMasCercana && (
              <div style={{ background: `${COLORS.gold}15`, border: `1px solid ${COLORS.gold}55` }} className="rounded-xl p-4 mb-6 text-sm">
                📍 Tu tienda más cercana es <strong>{tiendaMasCercana.nombre}</strong>, a {formatoDistancia(tiendaMasCercana._distanciaKm)}.
              </div>
            )}

            {!loadingTiendas && tiendasFiltradas.length === 0 && (
              <p style={{ color: COLORS.muted }} className="text-sm text-center py-16">No hay tiendas en esa zona todavía.</p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              {tiendasFiltradas.map((store, i) => (
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
                    <div className="flex items-center gap-1 flex-wrap">
                      {store._distanciaKm != null && <Badge color={COLORS.gold}>📍 {formatoDistancia(store._distanciaKm)}</Badge>}
                      {store.zona && <Badge color={colorFor(i)}>{store.zona}</Badge>}
                    </div>
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
                      {r.tipo !== "sellado" && <IdiomaBadge idioma={r.idioma} />}
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
        {view === "admin" && session && perfil?.es_admin && <AdminPanel session={session} onVerPerfil={verPerfil} onEntrarComoSubperfil={entrarComoSubperfil} />}

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
                    <NivelBadge total={storeDestellos} />
                    <VendedorBadge ventasCompletadas={storeVentasCompletadas} resenas={storeResenas} />
                  </div>
                  {session && session.user.id !== selectedStore.perfil_id && (
                    <div className="ml-auto pb-1.5 flex items-center gap-2">
                      <SeguirBoton session={session} seguidoPerfilId={selectedStore.perfil_id} />
                      <ReportarBoton session={session} tipo="perfil" tablaObjetivo="tiendas" objetivoId={selectedStore.id} objetivoPerfilId={selectedStore.perfil_id} objetivoNombre={selectedStore.nombre} />
                    </div>
                  )}
                </div>
              <div className="mt-3"><DiamanteEmblema perfil={selectedStore.perfiles} /></div>
              <div className="flex items-center gap-3 flex-wrap">
                <p style={{ color: COLORS.muted }} className="text-xs">👥 {storeSeguidores} seguidor{storeSeguidores === 1 ? "" : "es"}</p>
                <MiembroDesde perfil={selectedStore.perfiles} />
                {storeVentasCompletadas > 0 && <p style={{ color: COLORS.muted }} className="text-xs">🛒 {storeVentasCompletadas} venta{storeVentasCompletadas === 1 ? "" : "s"} completada{storeVentasCompletadas === 1 ? "" : "s"}</p>}
                {storeResenas.length > 0 && (
                  <div className="flex items-center gap-1">
                    <EstrellasDisplay valor={storeResenas.reduce((s, r) => s + r.estrellas, 0) / storeResenas.length} size={12} />
                    <p style={{ color: COLORS.muted }} className="text-xs">
                      {(storeResenas.reduce((s, r) => s + r.estrellas, 0) / storeResenas.length).toFixed(1)} ({storeResenas.length})
                    </p>
                  </div>
                )}
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
                            <IdiomaBadge idioma={item.idioma} />
                            <BoostBadge item={item} />
                          </div>
                          <p style={{ color: COLORS.muted }} className="text-xs">{item.set_nombre} · {item.condicion}</p>
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

        {(view === "privacidad" || view === "terminos") && (
          <LegalView tipo={view === "privacidad" ? "privacidad" : "terminos"} onVolver={() => setView(vistaAntesLegal)} />
        )}

        {view === "armarMazo" && (
          <ArmarMazoSection session={session} perfil={perfil} onAbrirChat={abrirChat} onVerTienda={verTiendaDesdePerfil} onIrAPlanes={() => setView("planes")} />
        )}
        {view === "comunidad" && <ComunidadView session={session} onVerPerfil={verPerfil} />}
        {view === "siguiendo" && session && <SiguiendoView session={session} onVerPerfil={verPerfil} onVerTienda={verTiendaDesdePerfil} />}
        {view === "comprasVentas" && session && <ComprasVentasView session={session} />}
        {view === "recompensas" && session && <RecompensasView session={session} perfil={perfil} />}
        {view === "apariencia" && session && (
          <AparienciaView perfil={perfil} onCambio={() => setTemaVersion((v) => v + 1)} onIrAPlanes={() => setView("planes")} />
        )}
      </main>

      <footer style={{ position: "relative", zIndex: 1, borderTop: `1px solid ${COLORS.surface2}` }} className="px-4 sm:px-8 py-6 mt-10">
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-4 flex-wrap text-xs" style={{ color: COLORS.muted }}>
          <button onClick={() => irALegal("privacidad")} className="hover:underline">Aviso de Privacidad</button>
          <span>·</span>
          <button onClick={() => irALegal("terminos")} className="hover:underline">Términos de Uso</button>
          <span>·</span>
          <span>© {new Date().getFullYear()} Encuentra Cartas</span>
        </div>
      </footer>
    </div>
  );
}
