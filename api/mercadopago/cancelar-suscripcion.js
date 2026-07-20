// Cancela la renovación automática de un perfil (pausa la suscripción
// recurrente en Mercado Pago). No le quita el plan de inmediato: sigue
// activo hasta la fecha en que ya estaba pagado (plan_vence); solo evita
// que se le cobre el próximo mes.
//
// Requiere: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { perfilId } = req.body || {};
  if (!perfilId) return res.status(400).json({ error: "Falta perfilId" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  try {
    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=mp_preapproval_id&id=eq.${perfilId}`, { headers });
    const perfiles = await perfilRes.json();
    const preapprovalId = perfiles[0]?.mp_preapproval_id;
    if (!preapprovalId) {
      return res.status(400).json({ error: "Este perfil no tiene una renovación automática activa" });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!mpRes.ok) {
      const data = await mpRes.json().catch(() => ({}));
      return res.status(500).json({ error: data.message || "No se pudo cancelar en Mercado Pago" });
    }

    await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mp_preapproval_id: null }),
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo cancelar la renovación" });
  }
}
