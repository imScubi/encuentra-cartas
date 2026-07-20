// Crea una suscripción recurrente de Mercado Pago ("Preapproval") para que
// un plan (Super/Ultra/Master/Ente Ball) se cobre solo, cada mes, hasta que
// el usuario la cancele. Requiere: MP_ACCESS_TOKEN
//
// No escribimos nada en Supabase aquí — el estado real (autorizada o no) lo
// confirma Mercado Pago por webhook, y ahí es donde se actualiza el perfil.
const PRECIOS_MXN = { superball: 49, ultraball: 89, masterball: 149, enteball: 349 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { perfilId, plan, email } = req.body || {};
  if (!perfilId || !PRECIOS_MXN[plan] || !email) {
    return res.status(400).json({ error: "Datos incompletos o plan inválido (se requiere correo)" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "Mercado Pago todavía no está configurado (falta MP_ACCESS_TOKEN)." });
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;

  try {
    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: `Encuentra Cartas · Plan ${plan} (renovación mensual)`,
        external_reference: `plan:${perfilId}:${plan}`,
        payer_email: email,
        back_url: `${baseUrl}/?plan=exito`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: PRECIOS_MXN[plan],
          currency_id: "MXN",
        },
        status: "pending",
      }),
    });
    const data = await mpRes.json();
    if (!mpRes.ok) {
      return res.status(500).json({ error: data.message || "No se pudo crear la suscripción" });
    }
    res.status(200).json({ init_point: data.init_point, preapproval_id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear la suscripción" });
  }
}
