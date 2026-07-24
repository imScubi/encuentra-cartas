// Corre una vez al día (ver vercel.json) y manda notificaciones push de
// aviso cuando: (a) el plan de un perfil está por vencer, (b) un boost
// (publicación destacada) está por dejar de estar destacado, o (c) un
// torneo que marcaste con "Me interesa" es en los próximos 3 días. El día 1
// de cada mes, de paso, otorga el regalo mensual de Destellos por plan (ver
// otorgarDestellosMensuales más abajo) -- va aquí en vez de en su propio
// archivo de cron para no sumar una función serverless más (Vercel Hobby
// limita a 12 por despliegue, y ya estábamos justo en el límite).
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, y CRON_SECRET (Vercel la manda sola
// como header Authorization cuando configuras esa variable de entorno).
// GMAIL_USER/GMAIL_APP_PASSWORD (opcional) para además mandar correo.
import webpush from "web-push";
import { enviarCorreo } from "../../lib/email.js";

const NOMBRES_PLAN = {
  superball: "Super Ball",
  ultraball: "Ultra Ball",
  masterball: "Master Ball",
  enteball: "Ente Ball",
};
const TABLAS = ["mercado_listings", "inventario_tienda", "sellado_tienda"];

// Destellos gratis del mes por plan -- el monto equivale a lo que cuesta
// canjear un Boost gratis en api/recompensas/canjear.js (150 Destellos = 1
// boost de 3 días): Amatista 150 (1 boost), Diamante 300 (2), Aurora 450
// (3). Es un regalo -- se suma al ledger de destellos_movimientos y el
// usuario decide en qué publicación canjearlo, no se aplica un boost
// automático a una publicación elegida por el cron.
const DESTELLOS_POR_PLAN = { ultraball: 150, masterball: 300, enteball: 450 };

async function otorgarDestellosMensuales(ahora, supabaseUrl, headers) {
  if (ahora.getDate() !== 1) return 0;
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  let otorgados = 0;

  const perfilesRes = await fetch(
    `${supabaseUrl}/rest/v1/perfiles?select=id,plan,plan_vence&plan=in.(ultraball,masterball,enteball)`,
    { headers }
  );
  const perfiles = await perfilesRes.json();

  for (const p of perfiles || []) {
    // Plan vencido: planDe() (theme.js) lo trata como Cuarzo en el resto de
    // la app, así que tampoco le toca regalo este mes.
    if (p.plan_vence && new Date(p.plan_vence) < ahora) continue;
    const cantidad = DESTELLOS_POR_PLAN[p.plan];
    if (!cantidad) continue;
    const motivo = `regalo_mensual_${p.plan}`;

    // Idempotencia: si el cron se reintenta o corre dos veces el mismo día,
    // no duplica el regalo -- busca un movimiento con este motivo ya
    // registrado desde el día 1 de este mes.
    const yaRes = await fetch(
      `${supabaseUrl}/rest/v1/destellos_movimientos?select=id&perfil_id=eq.${p.id}&motivo=eq.${motivo}&created_at=gte.${inicioMes}`,
      { headers }
    );
    const ya = await yaRes.json();
    if ((ya || []).length > 0) continue;

    await fetch(`${supabaseUrl}/rest/v1/destellos_movimientos`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ perfil_id: p.id, cantidad, motivo }),
    });
    await fetch(`${supabaseUrl}/rest/v1/notificaciones`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        perfil_id: p.id,
        tipo: "boost",
        titulo: "Destellos gratis de tu plan",
        mensaje: `Recibiste ${cantidad} Destellos gratis este mes por tu plan -- canjéalos por un Boost gratis en Recompensas.`,
        url: "/",
      }),
    });
    otorgados++;
  }
  return otorgados;
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  webpush.setVapidDetails(
    (process.env.VAPID_SUBJECT || "mailto:contacto@encuentracartas.mx").trim(),
    (process.env.VAPID_PUBLIC_KEY || "").trim(),
    (process.env.VAPID_PRIVATE_KEY || "").trim()
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
      const enviados = await notificar(p.id, "plan", "Tu plan está por vencer", mensaje, supabaseUrl, headers, p.email);
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
          "boost",
          "Tu destacado está por vencer",
          `"${nombre}" deja de estar destacado pronto. Destácalo de nuevo si quieres seguir arriba en resultados.`,
          supabaseUrl,
          headers,
          email
        );
        avisos += enviados;
      }
    }

    // ---- Torneos por venir (recordatorio a quien marcó "Me interesa") ----
    const torneosRes = await fetch(
      `${supabaseUrl}/rest/v1/torneos?select=*,tiendas(nombre)&fecha=gte.${ahora.toISOString()}&fecha=lte.${en3dias.toISOString()}`,
      { headers }
    );
    const torneos = await torneosRes.json();

    for (const t of torneos || []) {
      const interesadosRes = await fetch(
        `${supabaseUrl}/rest/v1/torneo_interes?select=*,perfiles(email)&torneo_id=eq.${t.id}&recordado=eq.false`,
        { headers }
      );
      const interesados = await interesadosRes.json();
      const dias = Math.max(1, Math.ceil((new Date(t.fecha) - ahora) / (24 * 60 * 60 * 1000)));
      const mensaje = `"${t.nombre}" en ${t.tiendas?.nombre || "una tienda"} es en ${dias} día(s).`;
      for (const i of interesados || []) {
        const enviados = await notificar(i.perfil_id, "torneo", "Recordatorio de torneo", mensaje, supabaseUrl, headers, i.perfiles?.email);
        avisos += enviados;
        await fetch(`${supabaseUrl}/rest/v1/torneo_interes?id=eq.${i.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ recordado: true }),
        });
      }
    }

    // ---- Regalo mensual de Destellos por plan (solo el día 1) ----
    const destellosOtorgados = await otorgarDestellosMensuales(ahora, supabaseUrl, headers);

    res.status(200).json({ ok: true, avisos, destellosOtorgados });
  } catch (e) {
    console.error("Error en cron de recordatorios:", e);
    res.status(200).json({ ok: true, error: e.message });
  }
}

async function notificar(perfilId, tipo, title, body, supabaseUrl, headers, email) {
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
  await fetch(`${supabaseUrl}/rest/v1/notificaciones`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ perfil_id: perfilId, tipo, titulo: title, mensaje: body, url: "/" }),
  });
  return resultados.filter((r) => r.status === "fulfilled").length;
}
