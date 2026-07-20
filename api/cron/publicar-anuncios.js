// Publica los anuncios programados cuya fecha_publicacion ya llegó, y
// manda la notificación push a todos los usuarios en ese momento.
//
// Se dispara vía pg_cron + pg_net desde Supabase (ver migración
// 009_anuncios.sql) porque Vercel Hobby no permite crons más seguidos
// que uno al día, y un anuncio programado necesita salir a su hora.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
import webpush from "web-push";

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const ahora = new Date().toISOString();

  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/noticias?select=*&estado=eq.programado&publicado=eq.false&fecha_publicacion=lte.${ahora}`,
      { headers }
    );
    const pendientes = await r.json();

    const subsRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=*`, { headers });
    const subs = await subsRes.json();

    let publicados = 0;
    for (const anuncio of pendientes || []) {
      await fetch(`${supabaseUrl}/rest/v1/noticias?id=eq.${anuncio.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ estado: "publicado", publicado: true, notificado: true }),
      });

      const payload = JSON.stringify({
        title: "📢 " + anuncio.titulo,
        body: anuncio.contenido?.slice(0, 140) || "",
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
                console.error("Error mandando push:", err.statusCode, err.body || err.message);
              }
            })
        )
      );
      publicados++;
    }

    res.status(200).json({ ok: true, publicados });
  } catch (e) {
    console.error("Error publicando anuncios programados:", e);
    res.status(200).json({ ok: true, error: e.message });
  }
}
