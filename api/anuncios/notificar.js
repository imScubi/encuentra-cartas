// El admin llama esto justo después de crear o aprobar un anuncio con
// publicación INMEDIATA (no programada): manda una notificación push a
// TODOS los usuarios con notificaciones activadas, y marca el anuncio
// como ya notificado para no repetirla.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import webpush from "web-push";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer /, "");
  const { anuncioId } = req.body || {};
  if (!token || !anuncioId) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  try {
    // Verificamos que quien llama de verdad sea un admin.
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    const user = await userRes.json();
    if (!userRes.ok || !user?.id) return res.status(401).json({ error: "Sesión inválida" });

    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=es_admin&id=eq.${user.id}`, { headers });
    const perfilRows = await perfilRes.json();
    if (!perfilRows[0]?.es_admin) return res.status(403).json({ error: "Solo un administrador puede hacer esto" });

    const anuncioRes = await fetch(`${supabaseUrl}/rest/v1/noticias?select=*&id=eq.${anuncioId}`, { headers });
    const anuncioRows = await anuncioRes.json();
    const anuncio = anuncioRows[0];
    if (!anuncio) return res.status(404).json({ error: "Anuncio no encontrado" });
    if (!anuncio.publicado || anuncio.notificado) return res.status(200).json({ ok: true, enviados: 0 });

    webpush.setVapidDetails(
      (process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx").trim(),
      (process.env.VAPID_PUBLIC_KEY || "").trim(),
      (process.env.VAPID_PRIVATE_KEY || "").trim()
    );

    const subsRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=*`, { headers });
    const subs = await subsRes.json();
    const payload = JSON.stringify({
      title: "📢 " + anuncio.titulo,
      body: anuncio.contenido?.slice(0, 140) || "",
      url: "/",
    });

    const resultados = await Promise.allSettled(
      (subs || []).map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: "DELETE", headers });
            } else {
              console.error("Error mandando push:", err.statusCode, err.body || err.message);
            }
            throw err;
          })
      )
    );

    await fetch(`${supabaseUrl}/rest/v1/noticias?id=eq.${anuncioId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ notificado: true }),
    });

    res.status(200).json({ ok: true, enviados: resultados.filter((r) => r.status === "fulfilled").length });
  } catch (e) {
    console.error("Error notificando anuncio:", e);
    res.status(500).json({ error: e.message || "No se pudo notificar el anuncio" });
  }
}
