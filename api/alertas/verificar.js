// Supabase llama esta URL (Database Webhook) cada vez que se inserta una
// fila nueva en mercado_listings, inventario_tienda o sellado_tienda.
// Buscamos alertas de Wishlist Premium (plan Ultra Ball o superior) que
// coincidan y les mandamos una notificación push real.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. "mailto:contacto@tudominio.com"),
// y (opcional) RESEND_API_KEY para además mandar un correo.
import webpush from "web-push";
import { enviarCorreo } from "../../lib/email.js";

const PLANES_CON_WISHLIST = ["ultraball", "masterball", "enteball"];

export default async function handler(req, res) {
  try {
    const { record } = req.body || {};
    if (!record) return res.status(200).json({ ok: true });

    const nombre = record.carta || record.producto;
    const precio = Number(record.precio);
    if (!nombre || !precio) return res.status(200).json({ ok: true });

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    const alertasRes = await fetch(
      `${supabaseUrl}/rest/v1/alertas?select=*,perfiles(plan,email)&activa=eq.true&precio_max=gte.${precio}&carta=ilike.*${encodeURIComponent(nombre)}*`,
      { headers }
    );
    const alertas = await alertasRes.json();

    const coincidencias = (alertas || [])
      .filter((a) => PLANES_CON_WISHLIST.includes(a.perfiles?.plan))
      // Si la alerta pide una zona específica y la publicación trae zona, deben coincidir.
      .filter((a) => !a.zona || !record.zona || a.zona.toLowerCase() === String(record.zona).toLowerCase())
      // Si la alerta se creó seleccionando una carta/producto exacto (tiene card_api_id),
      // exigimos que sea la misma carta y no solo un nombre parecido (ej. "Charizard V" vs "Charizard VMAX").
      .filter((a) => !a.card_api_id || a.card_api_id === record.card_api_id);

    if (coincidencias.length === 0) return res.status(200).json({ ok: true });

    const perfilIds = [...new Set(coincidencias.map((a) => a.perfil_id))];
    const subsRes = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?perfil_id=in.(${perfilIds.join(",")})`,
      { headers }
    );
    const subs = await subsRes.json();

    const payload = JSON.stringify({
      title: "¡Encontramos lo que buscabas!",
      body: `${nombre} está disponible por $${precio.toLocaleString("es-MX")} MXN`,
      url: "/",
    });

    await Promise.allSettled(
      (subs || []).map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          .catch(async (err) => {
            // Suscripción vencida o inválida: la borramos para no seguir intentando.
            if (err.statusCode === 404 || err.statusCode === 410) {
              await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: "DELETE", headers });
            } else {
              console.error("Error mandando push:", err.statusCode, err.body || err.message);
            }
          })
      )
    );

    // Un correo por perfil (sin duplicar si tiene varias alertas que coinciden).
    const correosPorPerfil = new Map(coincidencias.map((a) => [a.perfil_id, a.perfiles?.email]));
    await Promise.allSettled(
      [...correosPorPerfil.entries()].map(([, email]) =>
        enviarCorreo({
          to: email,
          subject: "¡Encontramos lo que buscabas en Encuentra Cartas!",
          html: `<p><strong>${nombre}</strong> ya está disponible por <strong>$${precio.toLocaleString("es-MX")} MXN</strong>.</p><p>Entra a Encuentra Cartas para contactar al vendedor antes de que se lo lleven.</p>`,
        })
      )
    );

    res.status(200).json({ ok: true, coincidencias: coincidencias.length });
  } catch (e) {
    console.error("Error verificando alertas:", e);
    res.status(200).json({ ok: true });
  }
}
