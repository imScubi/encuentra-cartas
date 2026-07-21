import React from "react";

// ---- Captura de errores: avisa al admin sin que nadie tenga que reportarlo a mano ----
let uidActual = null; // lo actualiza EncuentraCartas (vía setUidActual) cuando hay sesión, para poder incluirlo en el reporte

export function setUidActual(id) {
  uidActual = id;
}

export function reportarError(mensaje, stack) {
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
