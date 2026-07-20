// El navegador de cualquier usuario llama esto cuando algo falla (un
// error de JavaScript sin manejar, o un componente que truena). Guarda
// el error, y si no se avisó ya del mismo error en la última hora,
// notifica a todos los admins por push, correo y en su bandeja.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (opcionales para el push), y
// (opcional) GMAIL_USER/GMAIL_APP_PASSWORD para el correo.
import webpush from "web-push";
import { enviarCorreo } from "../../lib/email.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { mensaje, stack, url, perfilId } = req.body || {};
    if (!mensaje) return res.status(200).json({ ok: true });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const mensajeCorto = String(mensaje).slice(0, 500);

    // ¿Ya avisamos de este mismo error en la última hora? No repetir el aviso.
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const previoRes = await fetch(
      `${supabaseUrl}/rest/v1/errores_app?select=id&mensaje=eq.${encodeURIComponent(mensajeCorto)}&notificado=eq.true&created_at=gte.${haceUnaHora}&limit=1`,
      { headers }
    );
    const previos = await previoRes.json();
    const yaNotificado = (previos || []).length > 0;

    await fetch(`${supabaseUrl}/rest/v1/errores_app`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        mensaje: mensajeCorto,
        stack: stack ? String(stack).slice(0, 3000) : null,
        url: url || null,
        perfil_id: perfilId || null,
        notificado: !yaNotificado,
      }),
    });

    if (yaNotificado) return res.status(200).json({ ok: true });

    const adminsRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,email&es_admin=eq.true`, { headers });
    const admins = await adminsRes.json();
    if (!admins?.length) return res.status(200).json({ ok: true });

    // Notificación en la bandeja de cada admin.
    await fetch(`${supabaseUrl}/rest/v1/notificaciones`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(
        admins.map((a) => ({
          perfil_id: a.id,
          tipo: "error",
          titulo: "⚠️ Error detectado en la app",
          mensaje: mensajeCorto,
          url: "/",
        }))
      ),
    });

    // Push.
    webpush.setVapidDetails(
      (process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx").trim(),
      (process.env.VAPID_PUBLIC_KEY || "").trim(),
      (process.env.VAPID_PRIVATE_KEY || "").trim()
    );
    const idsAdmin = admins.map((a) => a.id);
    const subsRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?perfil_id=in.(${idsAdmin.join(",")})`, { headers });
    const subs = await subsRes.json();
    const payload = JSON.stringify({ title: "⚠️ Error detectado en la app", body: mensajeCorto.slice(0, 140), url: "/" });
    await Promise.allSettled(
      (subs || []).map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: "DELETE", headers });
            } else {
              console.error("Error mandando push:", err.statusCode, err.body || err.message);
            }
          })
      )
    );

    // Correo.
    await Promise.allSettled(
      admins
        .filter((a) => a.email)
        .map((a) =>
          enviarCorreo({
            to: a.email,
            subject: "⚠️ Error detectado en Encuentra Cartas",
            html: `<p><strong>${mensajeCorto}</strong></p><p>URL: ${url || "-"}</p>${
              stack ? `<pre style="white-space:pre-wrap;font-size:12px">${String(stack).slice(0, 1500)}</pre>` : ""
            }`,
          })
        )
    );

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Error reportando error:", e);
    res.status(200).json({ ok: true });
  }
}
