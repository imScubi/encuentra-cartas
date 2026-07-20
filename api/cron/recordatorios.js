// Corre una vez al día (ver vercel.json) y manda notificaciones push de
// aviso cuando: (a) el plan de un perfil está por vencer, o (b) un boost
// (publicación destacada) está por dejar de estar destacado.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, y CRON_SECRET (Vercel la manda sola
// como header Authorization cuando configuras esa variable de entorno).
// RESEND_API_KEY (opcional) para además mandar correo.
import webpush from "web-push";
import { enviarCorreo } from "../../lib/email.js";

const NOMBRES_PLAN = {
  superball: "Super Ball",
  ultraball: "Ultra Ball",
  masterball: "Master Ball",
  enteball: "Ente Ball",
};
const TABLAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];

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

  const ahora = new Date();
  const en3dias = new Date(ahora.getTime() + 3 * 24 * 60 * 60 * 1000);
  const en1dia = new Date(ahora.getTime() + 1 * 24 * 60 * 60 * 1000);

  let avisos = 0;

  try {
    // ---- Planes por vencer ----
    const perfilesRes = await fetch(
      `${supabaseUrl}/rest/v1/perfiles?select=id,nombre,plan,plan_vence,mp_preapproval_id,email&plan=neq.pokeball&plan_vence=gte.${ahora.toISOString()}&plan_vence=lte.${en3dias.toISOString()}`,
      { headers }
    );
    const perfiles = await perfilesRes.json();

    for (const p of perfiles || []) {
      const dias = Math.max(1, Math.ceil((new Date(p.plan_vence) - ahora) / (24 * 60 * 60 * 1000)));
      const nombrePlan = NOMBRES_PLAN[p.plan] || p.plan;
      const mensaje = p.mp_preapproval_id
        ? `Tu plan ${nombrePlan} se renueva solo en ${dias} día(s). No necesitas hacer nada.`
        : `Tu plan ${nombrePlan} vence en ${dias} día(s). Renuévalo para no perder tus beneficios.`;
      const enviados = await notificar(p.id, "Tu plan está por vencer", mensaje, supabaseUrl, headers, p.email);
      avisos += enviados;
    }

    // ---- Boosts por vencer ----
    for (const tabla of TABLAS) {
      const select = tabla === "mercado_listings" ? "*,perfiles(id,email)" : "*,tiendas(perfil_id,perfiles(email))";
      const r = await fetch(
        `${supabaseUrl}/rest/v1/${tabla}?select=${select}&destacado_hasta=gte.${ahora.toISOString()}&destacado_hasta=lte.${en1dia.toISOString()}`,
        { headers }
      );
      const filas = await r.json();
      for (const item of filas || []) {
        const perfilId = tabla === "mercado_listings" ? item.perfil_id : item.tiendas?.perfil_id;
        if (!perfilId) continue;
        const email = tabla === "mercado_listings" ? item.perfiles?.email : item.tiendas?.perfiles?.email;
        const nombre = item.carta || item.producto;
        const enviados = await notificar(
          perfilId,
          "Tu destacado está por vencer",
          `"${nombre}" deja de estar destacado pronto. Destácalo de nuevo si quieres seguir arriba en resultados.`,
          supabaseUrl,
          headers,
          email
        );
        avisos += enviados;
      }
    }

    res.status(200).json({ ok: true, avisos });
  } catch (e) {
    console.error("Error en cron de recordatorios:", e);
    res.status(200).json({ ok: true, error: e.message });
  }
}

async function notificar(perfilId, title, body, supabaseUrl, headers, email) {
  const subsRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?perfil_id=eq.${perfilId}`, { headers });
  const subs = await subsRes.json();
  const payload = JSON.stringify({ title, body, url: "/" });

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
  if (email) await enviarCorreo({ to: email, subject: title, html: `<p>${body}</p>` });
  return resultados.filter((r) => r.status === "fulfilled").length;
}
