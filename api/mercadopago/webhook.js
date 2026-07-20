// Mercado Pago llama esta URL cuando el estado de un pago cambia.
// Verificamos el pago directamente con la API de Mercado Pago (nunca confiamos
// en el cuerpo del webhook a ciegas) y, si fue aprobado, activamos el plan.
//
// Requiere: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (la Service Role Key SOLO se usa aquí, en el servidor; nunca en el navegador).
import { MercadoPagoConfig, Payment } from "mercadopago";

const DURACION_DIAS = 30;

export default async function handler(req, res) {
  try {
    const paymentId = req.body?.data?.id || req.query?.id || req.query?.["data.id"];
    const topic = req.body?.type || req.query?.topic;
    if (!paymentId || (topic && topic !== "payment")) {
      return res.status(200).json({ ok: true }); // ignoramos otros tipos de notificación
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const pago = await new Payment(client).get({ id: paymentId });

    const [perfilId, plan] = (pago.external_reference || "").split(":");
    if (!perfilId || !plan) return res.status(200).json({ ok: true });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const inicio = new Date();
    const fin = new Date(inicio.getTime() + DURACION_DIAS * 24 * 60 * 60 * 1000);

    await fetch(`${supabaseUrl}/rest/v1/pagos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        perfil_id: perfilId,
        plan,
        mp_payment_id: String(paymentId),
        status: pago.status,
        monto: pago.transaction_amount,
        periodo_inicio: inicio.toISOString(),
        periodo_fin: fin.toISOString(),
      }),
    });

    if (pago.status === "approved") {
      await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ plan, plan_vence: fin.toISOString() }),
      });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Error en webhook de Mercado Pago:", e);
    // Regresamos 200 igual: si no, Mercado Pago reintenta indefinidamente
    // por un error nuestro, no del pago.
    res.status(200).json({ ok: true });
  }
}
