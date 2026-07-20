// Crea una preferencia de pago en Mercado Pago (Checkout Pro) para que el
// usuario pague un mes de su plan. Requiere la variable de entorno
// MP_ACCESS_TOKEN (Access Token de Mercado Pago, de prueba o de producción).
import { MercadoPagoConfig, Preference } from "mercadopago";

const PRECIOS_MXN = { superball: 49, ultraball: 89, masterball: 149, enteball: 349 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { perfilId, plan, email } = req.body || {};
  if (!perfilId || !PRECIOS_MXN[plan]) {
    return res.status(400).json({ error: "Datos incompletos o plan inválido" });
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
            title: `Encuentra Cartas · Plan ${plan}`,
            quantity: 1,
            unit_price: PRECIOS_MXN[plan],
            currency_id: "MXN",
          },
        ],
        payer: email ? { email } : undefined,
        // El webhook usa esto para saber a quién y qué plan asignar.
        external_reference: `${perfilId}:${plan}`,
        back_urls: {
          success: `${baseUrl}/?pago=exito`,
          failure: `${baseUrl}/?pago=fallo`,
          pending: `${baseUrl}/?pago=pendiente`,
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
