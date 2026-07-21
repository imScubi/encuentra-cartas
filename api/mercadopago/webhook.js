// Mercado Pago llama esta URL cuando cambia el estado de un pago o de una
// suscripción recurrente. Verificamos todo directamente con la API de
// Mercado Pago (nunca confiamos en el cuerpo del webhook a ciegas).
//
// Requiere: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// (la Service Role Key SOLO se usa aquí, en el servidor; nunca en el navegador).
import { MercadoPagoConfig, Payment } from "mercadopago";

const DURACION_DIAS = 30;
const TABLAS_VALIDAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];

export default async function handler(req, res) {
  try {
    const topic = req.body?.type || req.query?.topic;
    const dataId = req.body?.data?.id || req.query?.id || req.query?.["data.id"];
    if (!dataId) return res.status(200).json({ ok: true });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    // ---- Suscripción recurrente: se autorizó, se pausó o se canceló ----
    if (topic === "subscription_preapproval") {
      await procesarPreapproval(dataId, supabaseUrl, headers);
      return res.status(200).json({ ok: true });
    }

    // ---- Suscripción recurrente: se cobró el mes (el primero o una renovación) ----
    if (topic === "subscription_authorized_payment") {
      await procesarPagoRecurrente(dataId, supabaseUrl, headers);
      return res.status(200).json({ ok: true });
    }

    if (topic && topic !== "payment") {
      return res.status(200).json({ ok: true }); // ignoramos otros tipos de notificación
    }

    // ---- Pago único (hoy solo lo usan los Boosts) ----
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const pago = await new Payment(client).get({ id: dataId });

    if ((pago.external_reference || "").startsWith("boost:")) {
      await procesarBoost(pago, dataId, supabaseUrl, headers);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Error en webhook de Mercado Pago:", e);
    // Regresamos 200 igual: si no, Mercado Pago reintenta indefinidamente
    // por un error nuestro, no del pago.
    res.status(200).json({ ok: true });
  }
}

async function procesarBoost(pago, paymentId, supabaseUrl, headers) {
  const [, tabla, listingId, dias, perfilId] = pago.external_reference.split(":");
  if (!TABLAS_VALIDAS.includes(tabla) || !listingId || !perfilId) return;

  const destacadoHasta =
    pago.status === "approved" ? new Date(Date.now() + Number(dias) * 24 * 60 * 60 * 1000).toISOString() : null;

  await fetch(`${supabaseUrl}/rest/v1/boosts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      perfil_id: perfilId,
      tabla,
      listing_id: listingId,
      dias: Number(dias),
      mp_payment_id: String(paymentId),
      status: pago.status,
      monto: pago.transaction_amount,
      destacado_hasta: destacadoHasta,
    }),
  });

  if (destacadoHasta) {
    await fetch(`${supabaseUrl}/rest/v1/${tabla}?id=eq.${listingId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ destacado_hasta: destacadoHasta }),
    });
  }
}

// Cuando el usuario autoriza (o cancela/pausa) la suscripción recurrente en
// la pantalla de Mercado Pago. Guardamos el preapproval_id en su perfil para
// poder cancelarlo después.
async function procesarPreapproval(preapprovalId, supabaseUrl, headers) {
  const preapproval = await obtenerDeMercadoPago(`/preapproval/${preapprovalId}`);
  if (!preapproval) return;

  const [, perfilId, plan] = (preapproval.external_reference || "").split(":");
  if (!perfilId || !plan) return;

  if (preapproval.status === "authorized") {
    await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mp_preapproval_id: preapprovalId }),
    });
  } else if (preapproval.status === "cancelled" || preapproval.status === "paused") {
    // Si cancelaron desde el lado de Mercado Pago (no desde nuestra app),
    // limpiamos la referencia para que no se intente cobrar de nuevo.
    await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}&mp_preapproval_id=eq.${preapprovalId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ mp_preapproval_id: null }),
    });
  }
}

// Cada vez que se cobra un mes de la suscripción (el primero o una renovación).
async function procesarPagoRecurrente(authorizedPaymentId, supabaseUrl, headers) {
  const cobro = await obtenerDeMercadoPago(`/authorized_payments/${authorizedPaymentId}`);
  if (!cobro) return;

  const preapproval = await obtenerDeMercadoPago(`/preapproval/${cobro.preapproval_id}`);
  const [, perfilId, plan] = (preapproval?.external_reference || "").split(":");
  if (!perfilId || !plan) return;

  const inicio = new Date();
  const fin = new Date(inicio.getTime() + DURACION_DIAS * 24 * 60 * 60 * 1000);
  const aprobado = cobro.status === "processed";

  await fetch(`${supabaseUrl}/rest/v1/pagos`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      perfil_id: perfilId,
      plan,
      mp_payment_id: String(authorizedPaymentId),
      status: aprobado ? "approved" : cobro.status,
      monto: cobro.transaction_amount,
      periodo_inicio: inicio.toISOString(),
      periodo_fin: fin.toISOString(),
    }),
  });

  if (aprobado) {
    await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ plan, plan_vence: fin.toISOString(), mp_preapproval_id: cobro.preapproval_id }),
    });
    // Guarda la fecha en la que llegó a Diamante, solo la primera vez (el filtro
    // diamante_desde=is.null hace que este PATCH no toque nada si ya estaba puesta).
    if (plan === "masterball") {
      await fetch(`${supabaseUrl}/rest/v1/perfiles?id=eq.${perfilId}&diamante_desde=is.null`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ diamante_desde: inicio.toISOString() }),
      });
    }
  }
}

async function obtenerDeMercadoPago(path) {
  const r = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) return null;
  return r.json();
}
