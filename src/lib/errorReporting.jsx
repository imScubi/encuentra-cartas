import React from "react";

// ---- Captura de errores: avisa al admin sin que nadie tenga que reportarlo a mano ----
let uidActual = null; // lo actualiza EncuentraCartas (vía setUidActual) cuando hay sesión, para poder incluirlo en el reporte

export function setUidActual(id) {
  uidActual = id;
}

// Ruido conocido que no tiene nada que ver con nuestro código -- nunca vale
// la pena despertar al admin por esto, así que se descarta antes de mandar
// el reporte (ni siquiera gasta la llamada de red). Cada patrón es un caso
// real que ya llegó por correo:
const RUIDO_CONOCIDO = [
  // Navegador integrado de apps Android (Gmail, Facebook, Instagram, etc.):
  // su propio script de medición de navegación revienta cuando cierran esa
  // vista antes de que termine de llamar a su puente Java -- no es nuestro
  // código ni algo que podamos arreglar del lado de la web.
  /iabjs:\/\//i,
  /Java object is gone/i,
  // Advertencia inofensiva y muy común de Chrome/Safari sobre el timing de
  // ResizeObserver -- no rompe nada visible.
  /ResizeObserver loop/i,
  // El navegador manda este mensaje genérico (sin archivo ni línea) cuando
  // el script que falló es de otro origen -- casi siempre una extensión
  // instalada en el navegador de quien visita, nunca nuestro propio bundle.
  /^Script error\.?$/i,
  // Extensiones del navegador (bloqueadores de anuncios, gestores de
  // contraseñas, etc.) inyectando su propio script en la página.
  /chrome-extension:\/\/|moz-extension:\/\/|safari-extension:\/\//i,
];
function esRuidoConocido(texto) {
  return RUIDO_CONOCIDO.some((patron) => patron.test(String(texto || "")));
}

export function reportarError(mensaje, stack) {
  if (!mensaje || esRuidoConocido(mensaje) || esRuidoConocido(stack)) return;
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

export class ErrorBoundary extends React.Component {
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
