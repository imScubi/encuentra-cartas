// Junta crear-boost / crear-suscripcion / cancelar-suscripcion en un solo
// archivo (con "accion" en el body) — Vercel Hobby limita a 12 funciones
// serverless por despliegue, y separarlos en 3 archivos ya no cabía.
// El webhook (api/mercadopago/webhook.js) se queda aparte porque su URL
// está fija en la configuración de Mercado Pago.
//
// Requiere: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { MercadoPagoConfig, Preference } from "mercadopago";

const TABLAS_VALIDAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];
const PRECIOS_BOOST_MXN = { 3: 15, 7: 29 };
const PRECIOS_PLAN_MXN = { superball: 49, ultraball: 89, masterball: 149, enteball: 349 };
// Plan anual: pago único (no una suscripción recurrente) -- por eso vive
// separado de PRECIOS_PLAN_MXN/crearSuscripcion. Debe coincidir con
// `precioAnual` en src/theme.js (PLAN_INFO) -- no hay una sola fuente de
// verdad compartida entre cliente y servidor para esto, igual que ya
// pasa con PRECIOS_PLAN_MXN de arriba.
const PRECIOS_PLAN_ANUAL_MXN = { superball: 499, ultraball: 899, masterball: 1499, enteball: 2999 };

async function obtenerDuenoDeLista(tabla, listingId) {
  const supabaseUrl = process.env.SUPABASE_URL || "https://nulypgaaekexlbxbxdwq.supabase.co";
  const anonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bHlwZ2FhZWtleGxieGJ4ZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk3OTcsImV4cCI6MjA5OTk3NTc5N30.9qxfcmUx5k1br1CH3DIFI2EplFJWYeRyg6HFeZNN7og";
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

  if (tabla === "mercado_listings") {
    const r = await fetch(`${supabaseUrl}/rest/v1/mercado_listings?select=perfil_id&id=eq.${listingId}`, { headers });
    const rows = await r.json();
    return rows[0]?.perfil_id || null;
  }

  const r = await fetch(`${supabaseUrl}/rest/v1/${tabla}?select=tiendas(perfil_id)&id=eq.${listingId}`, { headers });
  const rows = await r.json();
  return rows[0]?.tiendas?.perfil_id || null;
}

async function crearBoost(req, res) {
  const { perfilId, tabla, listingId, dias, email } = req.body || {};
  if (!perfilId || !listingId || !TABLAS_VALIDAS.includes(tabla) || !PRECIOS_BOOST_MXN[dias]) {
    return res.status(400).json({ error: "Datos incompletos o inválidos" });
  }

  try {
    const dueno = await obtenerDuenoDeLista(tabla, listingId);
    if (dueno !== perfilId) return res.status(403).json({ error: "Esta publicación no te pertenece" });
  } catch {
    return res.status(500).json({ error: "No se pudo verificar la publicación" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: "Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN)." });

  const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const resultado = await preference.create({
      body: {
        items: [{ title: `Encuentra Cartas · Destacar ${dias} días`, quantity: 1, unit_price: PRECIOS_BOOST_MXN[dias], currency_id: "MXN" }],
        payer: email ? { email } : undefined,
        external_reference: `boost:${tabla}:${listingId}:${dias}:${perfilId}`,
        back_urls: { success: `${baseUrl}/?boost=exito`, failure: `${baseUrl}/?boost=fallo`, pending: `${baseUrl}/?boost=pendiente` },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/mercadopago/webhook`,
      },
    });
    res.status(200).json({ init_point: resultado.init_point, preference_id: resultado.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear la preferencia de pago" });
  }
}

async function crearSuscripcion(req, res) {
  const { perfilId, plan, email } = req.body || {};
  if (!perfilId || !PRECIOS_PLAN_MXN[plan] || !email) {
    return res.status(400).json({ error: "Datos incompletos o plan inválido (se requiere correo)" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: "Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN)." });

  const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: `Encuentra Cartas · Plan ${plan} (renovación mensual)`,
        external_reference: `plan:${perfilId}:${plan}`,
        payer_email: email,
        back_url: `${baseUrl}/?plan=exito`,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: PRECIOS_PLAN_MXN[plan], currency_id: "MXN" },
        status: "pending",
      }),
    });
    const data = await mpRes.json();
    if (!mpRes.ok) return res.status(500).json({ error: data.message || "No se pudo crear la suscripción" });
    res.status(200).json({ init_point: data.init_point, preapproval_id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear la suscripción" });
  }
}

// Pago único del plan anual (Preference, igual que crearBoost) -- NO usa
// preapproval, así que nunca cobra sola una segunda vez. El webhook
// distingue este pago de un Boost por el prefijo "plan_anual:" en
// external_reference (ver procesarPagoAnual en webhook.js).
async function crearPagoAnual(req, res) {
  const { perfilId, plan, email } = req.body || {};
  if (!perfilId || !PRECIOS_PLAN_ANUAL_MXN[plan]) {
    return res.status(400).json({ error: "Datos incompletos o plan inválido" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: "Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN)." });

  const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const resultado = await preference.create({
      body: {
        items: [{ title: `Encuentra Cartas · Plan ${plan} (1 año)`, quantity: 1, unit_price: PRECIOS_PLAN_ANUAL_MXN[plan], currency_id: "MXN" }],
        payer: email ? { email } : undefined,
        external_reference: `plan_anual:${perfilId}:${plan}`,
        back_urls: { success: `${baseUrl}/?plan=exito`, failure: `${baseUrl}/?plan=fallo`, pending: `${baseUrl}/?plan=pendiente` },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/mercadopago/webhook`,
      },
    });
    res.status(200).json({ init_point: resultado.init_point, preference_id: resultado.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo iniciar el pago del plan anual" });
  }
}

async function cancelarSuscripcion(req, res) {
  const { perfilId } = req.body || {};
  if (!perfilId) return res.status(400).json({ error: "Falta perfilId" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" };

  try {
    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=mp_preapproval_id&id=eq.${perfilId}`, { headers });
    const perfiles = await perfilRes.json();
    const preapprovalId = perfiles[0]?.mp_preapproval_id;
    if (!preapprovalId) return res.status(400).json({ error: "Este perfil no tiene una renovación automática activa" });

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!mpRes.ok) {
      const data = await mpRes.json().catch(() => ({}));
      return res.status(500).json({ error: data.message || "No se pudo cancelar en Mercado Pago" });
    }

    await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}`, { method: "PATCH", headers, body: JSON.stringify({ mp_preapproval_id: null }) });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo cancelar la renovación" });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const { accion } = req.body || {};
  if (accion === "crear_boost") return crearBoost(req, res);
  if (accion === "crear_suscripcion") return crearSuscripcion(req, res);
  if (accion === "crear_pago_anual") return crearPagoAnual(req, res);
  if (accion === "cancelar_suscripcion") return cancelarSuscripcion(req, res);
  return res.status(400).json({ error: "accion inválida" });
}
