// Canjea Destellos (el sistema de recompensas) por Boost gratis en una
// publicación propia. Valida la sesión de verdad (no confía en el
// perfilId que mande el navegador) y revisa el saldo con la service role
// key antes de descontar, para que nadie pueda inventarse puntos.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
const TABLAS_VALIDAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];
const COSTOS = { 3: 150, 7: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer /, "");
  const { tabla, listingId, dias } = req.body || {};
  if (!token || !listingId || !TABLAS_VALIDAS.includes(tabla) || !COSTOS[dias]) {
    return res.status(400).json({ error: "Datos incompletos o inválidos" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    const user = await userRes.json();
    if (!userRes.ok || !user?.id) return res.status(401).json({ error: "Sesión inválida" });
    const perfilId = user.id;

    const dueno = await obtenerDuenoDeLista(supabaseUrl, headers, tabla, listingId);
    if (dueno !== perfilId) return res.status(403).json({ error: "Esta publicación no te pertenece" });

    const costo = COSTOS[dias];
    const movRes = await fetch(`${supabaseUrl}/rest/v1/destellos_movimientos?select=cantidad&perfil_id=eq.${perfilId}`, { headers });
    const movimientos = await movRes.json();
    const saldo = movimientos.reduce((s, m) => s + m.cantidad, 0);
    if (saldo < costo) {
      return res.status(403).json({ error: `Te faltan Destellos: tienes ${saldo}, necesitas ${costo}.` });
    }

    const destacado_hasta = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

    await fetch(`${supabaseUrl}/rest/v1/${tabla}?id=eq.${listingId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ destacado_hasta }),
    });

    await fetch(`${supabaseUrl}/rest/v1/destellos_movimientos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        perfil_id: perfilId,
        cantidad: -costo,
        motivo: `canje_boost_${dias}d`,
        referencia_tabla: tabla,
        referencia_id: listingId,
      }),
    });

    res.status(200).json({ ok: true, destacado_hasta, saldo_restante: saldo - costo });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo canjear." });
  }
}

async function obtenerDuenoDeLista(supabaseUrl, headers, tabla, listingId) {
  if (tabla === "mercado_listings") {
    const r = await fetch(`${supabaseUrl}/rest/v1/mercado_listings?select=perfil_id&id=eq.${listingId}`, { headers });
    const rows = await r.json();
    return rows[0]?.perfil_id || null;
  }
  const r = await fetch(`${supabaseUrl}/rest/v1/${tabla}?select=tiendas(perfil_id)&id=eq.${listingId}`, { headers });
  const rows = await r.json();
  return rows[0]?.tiendas?.perfil_id || null;
}
