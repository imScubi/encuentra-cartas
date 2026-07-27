// Supabase llama esta URL (Database Webhook, ver 003_webhooks.sql) cada vez
// que se inserta una fila nueva en mercado_listings, inventario_tienda,
// sellado_tienda o (desde la migración 060) mensajes -- todas usan la MISMA
// función de trigger genérica `notificar_alerta_wishlist()`, que solo arma
// {type, table: TG_TABLE_NAME, record} y lo manda por pg_net a esta URL; acá
// se despacha según `table`. Se comparte el archivo (en vez de sumar uno
// nuevo en api/) porque el plan Hobby de Vercel limita a 12 funciones
// serverless y ya estaba al tope (ver sección 91/92 de SUSCRIPCIONES.md).
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. "mailto:contacto@tudominio.com"),
// y (opcional) GMAIL_USER/GMAIL_APP_PASSWORD para además mandar un correo.
import webpush from "web-push";
import { enviarCorreo } from "../../lib/email.js";

const PLANES_CON_WISHLIST = ["ultraball", "masterball", "enteball"];

// Nuevo mensaje de chat (1 a 1, o el mensaje masivo desde el Carrito): avisa
// al destinatario por push (si tiene notificaciones activadas) y por correo
// (si tiene correo guardado) -- nunca bloquea ni hace fallar el insert del
// mensaje, esto corre después y en paralelo.
async function notificarMensajeNuevo(record, supabaseUrl, serviceKey, headers) {
  const deId = record.de_perfil_id;
  const paraId = record.para_perfil_id;
  if (!deId || !paraId || deId === paraId) return;

  const perfilesRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,nombre,email&id=in.(${deId},${paraId})`, { headers });
  const perfiles = await perfilesRes.json();
  const remitente = perfiles.find((p) => p.id === deId);
  const destinatario = perfiles.find((p) => p.id === paraId);
  if (!destinatario) return;

  const nombreRemitente = remitente?.nombre || "Alguien";
  const previsualizacion = (record.texto || "").trim() || (record.imagen_url ? "📷 Te mandó una foto" : "Te mandó un mensaje");

  webpush.setVapidDetails(
    (process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx").trim(),
    (process.env.VAPID_PUBLIC_KEY || "").trim(),
    (process.env.VAPID_PRIVATE_KEY || "").trim()
  );

  const subsRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?perfil_id=eq.${paraId}`, { headers });
  const subs = await subsRes.json();
  const payload = JSON.stringify({
    title: `💬 ${nombreRemitente} te escribió`,
    body: previsualizacion.slice(0, 140),
    url: "/",
  });

  await Promise.allSettled(
    (subs || []).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        .catch(async (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: "DELETE", headers });
          } else {
            console.error("Error mandando push de mensaje:", err.statusCode, err.body || err.message);
          }
        })
    )
  );

  if (destinatario.email) {
    // Para no inundar de correos una conversación activa (vaivén de
    // mensajes), solo se manda si no le mandamos otro a este mismo
    // destinatario de parte de este mismo remitente en los últimos 5
    // minutos. El push de arriba sí se manda siempre -- es mucho menos
    // intrusivo y es lo esperado en un chat en vivo.
    const cincoMinAntes = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recientesRes = await fetch(
      `${supabaseUrl}/rest/v1/mensajes?select=id&de_perfil_id=eq.${deId}&para_perfil_id=eq.${paraId}&created_at=gte.${cincoMinAntes}&created_at=lt.${record.created_at}&limit=1`,
      { headers }
    );
    const recientes = await recientesRes.json().catch(() => []);
    if (!recientes?.length) {
      await enviarCorreo({
        to: destinatario.email,
        subject: `💬 ${nombreRemitente} te mandó un mensaje en Encuentra Cartas`,
        html: `<p><strong>${nombreRemitente}</strong> te escribió${record.contexto ? ` sobre "${record.contexto}"` : ""}:</p><p style="padding:12px;background:#f4f4f4;border-radius:8px;">${previsualizacion}</p><p>Entra a Encuentra Cartas para responder.</p>`,
      });
    }
  }
}

export default async function handler(req, res) {
  try {
    const { table, record } = req.body || {};
    if (!record) return res.status(200).json({ ok: true });

    if (table === "mensajes") {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
      await notificarMensajeNuevo(record, supabaseUrl, serviceKey, headers).catch((e) => console.error("Error notificando mensaje nuevo:", e));
      return res.status(200).json({ ok: true });
    }

    const nombre = record.carta || record.producto;
    const precio = Number(record.precio);
    if (!nombre || !precio) return res.status(200).json({ ok: true });

    const vapidPublic = (process.env.VAPID_PUBLIC_KEY || "").trim();
    const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || "").trim();
    console.log("VAPID debug: public len =", vapidPublic.length, "(esperado 87), private len =", vapidPrivate.length, "(esperado 43)");
    webpush.setVapidDetails(
      (process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx").trim(),
      vapidPublic,
      vapidPrivate
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

    // Notificación en la bandeja de la web, una por perfil.
    await fetch(`${supabaseUrl}/rest/v1/notificaciones`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(
        perfilIds.map((perfilId) => ({
          perfil_id: perfilId,
          tipo: "wishlist",
          titulo: "¡Encontramos lo que buscabas!",
          mensaje: `${nombre} está disponible por $${precio.toLocaleString("es-MX")} MXN`,
          url: "/",
        }))
      ),
    });

    res.status(200).json({ ok: true, coincidencias: coincidencias.length });
  } catch (e) {
    console.error("Error verificando alertas:", e);
    res.status(200).json({ ok: true });
  }
}
