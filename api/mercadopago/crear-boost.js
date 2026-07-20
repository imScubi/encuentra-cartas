// Crea una preferencia de pago en Mercado Pago para destacar UNA publicación
// (carta o sellado, de tienda o de vendedor individual) por 3 o 7 días.
// Requiere: MP_ACCESS_TOKEN
import { MercadoPagoConfig, Preference } from "mercadopago";

const TABLAS_VALIDAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];
const PRECIOS_MXN = { 3: 15, 7: 29 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { perfilId, tabla, listingId, dias, email } = req.body || {};
  if (!perfilId || !listingId || !TABLAS_VALIDAS.includes(tabla) || !PRECIOS_MXN[dias]) {
    return res.status(400).json({ error: "Datos incompletos o inválidos" });
  }

  // Verificamos que la publicación sea realmente del perfil que quiere pagarla.
  try {
    const dueno = await obtenerDuenoDeLista(tabla, listingId);
    if (dueno !== perfilId) {
      return res.status(403).json({ error: "Esta publicación no te pertenece" });
    }
  } catch (e) {
    return res.status(500).json({ error: "No se pudo verificar la publicación" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN)." });
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const resultado = await preference.create({
      body: {
        items: [
          {
            title: `Encuentra Cartas · Destacar ${dias} días`,
            quantity: 1,
            unit_price: PRECIOS_MXN[dias],
            currency_id: "MXN",
          },
        ],
        payer: email ? { email } : undefined,
        // Prefijo "boost:" para que el webhook distinga esto de un pago de plan.
        external_reference: `boost:${tabla}:${listingId}:${dias}:${perfilId}`,
        back_urls: {
          success: `${baseUrl}/?boost=exito`,
          failure: `${baseUrl}/?boost=fallo`,
          pending: `${baseUrl}/?boost=pendiente`,
        },
        auto_return: "approved",
        notification_url: `${baseUrl}/api/mercadopago/webhook`,
      },
    });
    res.status(200).json({ init_point: resultado.init_point, preference_id: resultado.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear la preferencia de pago" });
  }
}

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
