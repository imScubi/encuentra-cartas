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
import { llamarGeminiTextoConReintento } from "../../lib/gemini.js";
import { universoGlobalPorTcg, TCGS_CON_BOLETIN } from "../../lib/precios.js";

const TCG_NOMBRE_BOLETIN = { pokemon: "Pokémon", magic: "Magic", yugioh: "Yu-Gi-Oh!" };

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

// ============================================================
// Boletín de precios, cada 3 días (ver tocaBoletinHoy/generarYEnviarBoletines
// más abajo -- antes era cada lunes, una semana completa). Es sobre el
// mercado del TCG EN GENERAL, no sobre el inventario de esta plataforma --
// universoGlobalPorTcg (lib/precios.js) le pregunta directo a la fuente de
// cada juego por sus cartas, así que informa lo mismo le interese a quien
// vende aquí o no.
// Arranca con Pokémon/Magic/Yu-Gi-Oh (TCGS_CON_BOLETIN, lib/precios.js):
// son los únicos tres TCG con una fuente de precio real ya integrada en
// la app. Lorcana no tiene un campo de precio confirmado en su API
// gratuita y One Piece no tiene ninguna fuente de precio integrada
// todavía -- se agregan aquí el día que exista una fuente confiable para
// cada uno, en vez de inventar números.
// ============================================================
const fechaISO = (d) => d.toISOString().slice(0, 10);

function formatearEntradaBoletin(c) {
  return {
    nombre: c.nombre, set_nombre: c.setNombre, imagen_url: c.imagenUrl,
    precio_mxn: c.precioMxn, precio_antes_mxn: c.precioAntes, cambio_pct: Math.round(c.cambioPct * 10) / 10,
  };
}

async function generarAnalisisBoletin(tcg, suben, bajan) {
  const nombreTcg = TCG_NOMBRE_BOLETIN[tcg] || tcg;
  const resumenSuben = suben.slice(0, 8).map((c) => `${c.nombre} (+${c.cambioPct.toFixed(0)}%, de $${Math.round(c.precioAntes)} a $${Math.round(c.precioMxn)} MXN)`).join("; ");
  const resumenBajan = bajan.slice(0, 8).map((c) => `${c.nombre} (${c.cambioPct.toFixed(0)}%, de $${Math.round(c.precioAntes)} a $${Math.round(c.precioMxn)} MXN)`).join("; ");
  const fallback = `En estos últimos días, en ${nombreTcg}, las cartas que más subieron de precio fueron: ${resumenSuben || "sin datos suficientes"}. Las que más bajaron: ${resumenBajan || "sin datos suficientes"}.`;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return fallback;
  try {
    const prompt =
      `Eres un analista de mercado de cartas coleccionables de ${nombreTcg} explicándole a coleccionistas que no son ` +
      `expertos en finanzas qué pasó en estos últimos días con los precios. Cartas que MÁS SUBIERON de precio: ${resumenSuben || "ninguna con datos suficientes"}. ` +
      `Cartas que MÁS BAJARON de precio: ${resumenBajan || "ninguna con datos suficientes"}. ` +
      "Escribe un análisis breve (máximo 4-5 oraciones), en español sencillo y directo, sin tecnicismos financieros, " +
      "explicando qué tendencia general se ve y qué podría explicarla en términos simples (ej. relanzamientos, " +
      "torneos recientes, nostalgia, escasez) -- sin inventar datos que no te di. No repitas la lista completa de " +
      "cartas, solo menciona 2-3 ejemplos como ilustración.";
    const texto = await llamarGeminiTextoConReintento(geminiKey, prompt);
    return texto?.trim() || fallback;
  } catch {
    return fallback;
  }
}

async function generarBoletinTcg(tcg, semanaActual, semanaPasada, supabaseUrl, headers) {
  // universoGlobalPorTcg pregunta directo a la fuente de cada juego (no al
  // inventario de esta plataforma) por sus cartas más recientes/valiosas --
  // el boletín es sobre el mercado del TCG en general, ver lib/precios.js.
  const validos = await universoGlobalPorTcg(tcg, 60);
  if (validos.length === 0) return null;

  // Guarda el precio de hoy (para que la corrida de dentro de 3 días ya
  // tenga con qué comparar) antes de intentar comparar contra el corte
  // anterior, así el trabajo de cotizar no se pierde aunque algo falle
  // más adelante.
  await fetch(`${supabaseUrl}/rest/v1/precio_historial_semanal?on_conflict=tcg,card_api_id,semana`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(validos.map((v) => ({
      tcg, card_api_id: v.cardApiId, nombre: v.nombre, set_nombre: v.setNombre, imagen_url: v.imagenUrl,
      precio_mxn: v.precioMxn, semana: semanaActual,
    }))),
  });

  const anteriorRes = await fetch(
    `${supabaseUrl}/rest/v1/precio_historial_semanal?select=card_api_id,precio_mxn&tcg=eq.${tcg}&semana=eq.${semanaPasada}`,
    { headers }
  );
  const anteriores = await anteriorRes.json().catch(() => []);
  const mapaAnterior = new Map((anteriores || []).map((a) => [a.card_api_id, a.precio_mxn]));

  const cambios = validos
    .map((v) => {
      const precioAntes = mapaAnterior.get(v.cardApiId);
      if (precioAntes == null || precioAntes <= 0) return null;
      return { ...v, precioAntes, cambioPct: ((v.precioMxn - precioAntes) / precioAntes) * 100 };
    })
    .filter(Boolean);

  // Si es la primera corrida rastreando este tcg, no hay con qué comparar
  // todavía -- no truena, simplemente no hay boletín hoy (el de dentro de
  // 3 días ya va a tener comparación).
  if (cambios.length === 0) return null;

  const suben = [...cambios].sort((a, b) => b.cambioPct - a.cambioPct).slice(0, 20);
  const bajan = [...cambios].sort((a, b) => a.cambioPct - b.cambioPct).slice(0, 20);
  const analisis = await generarAnalisisBoletin(tcg, suben, bajan);
  const top_suben = suben.map(formatearEntradaBoletin);
  const top_bajan = bajan.map(formatearEntradaBoletin);

  await fetch(`${supabaseUrl}/rest/v1/boletines?on_conflict=tcg,semana`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ tcg, semana: semanaActual, top_suben, top_bajan, analisis }),
  });

  return { tcg, semana: semanaActual, top_suben, top_bajan, analisis };
}

function filaHtmlBoletin(c, signo) {
  return `<tr><td style="padding:4px 8px">${c.nombre}${c.set_nombre ? ` (${c.set_nombre})` : ""}</td><td style="padding:4px 8px">${signo}${Math.abs(c.cambio_pct)}%</td><td style="padding:4px 8px">$${c.precio_mxn} MXN</td></tr>`;
}

function armarHtmlBoletin(b) {
  const nombreTcg = TCG_NOMBRE_BOLETIN[b.tcg] || b.tcg;
  return `
    <h2>📊 Boletín de ${nombreTcg}</h2>
    <p>${b.analisis || ""}</p>
    <h3>📈 Las que más subieron</h3>
    <table>${b.top_suben.map((c) => filaHtmlBoletin(c, "+")).join("")}</table>
    <h3>📉 Las que más bajaron</h3>
    <table>${b.top_bajan.map((c) => filaHtmlBoletin(c, "")).join("")}</table>
    <p><a href="https://encuentracartasmx.com">Ver en Encuentra Cartas</a></p>
  `;
}

async function enviarBoletinesPorCorreo(boletinesGenerados, supabaseUrl, headers) {
  for (const b of boletinesGenerados) {
    const subsRes = await fetch(
      `${supabaseUrl}/rest/v1/boletin_subscripciones?select=perfiles!perfil_id(email)&tcg=eq.${b.tcg}`,
      { headers }
    );
    const subs = await subsRes.json().catch(() => []);
    const destinatarios = [...new Set((subs || []).map((s) => s.perfiles?.email).filter(Boolean))];
    if (!destinatarios.length) continue;
    const html = armarHtmlBoletin(b);
    const nombreTcg = TCG_NOMBRE_BOLETIN[b.tcg] || b.tcg;
    for (const email of destinatarios) {
      await enviarCorreo({ to: email, subject: `📊 Boletín de ${nombreTcg}`, html });
    }
  }
}

// Cadencia de 3 en 3 días -- antes era "solo lunes" (una semana completa),
// ahora se sube un boletín nuevo cada 3 días sin importar el día de la
// semana. No depende de getUTCDay() (eso solo da lunes/martes/etc, no
// "cada 3er día"); en vez de eso cuenta cuántos días completos han pasado
// desde un punto fijo (el día que se activó esta cadencia) y solo toca
// generar cuando ese conteo es múltiplo de 3 -- así el propio día en que
// se activó ya cuenta como corrida válida.
const ANCLA_BOLETIN = Date.UTC(2026, 6, 28); // 28 de julio de 2026 (mes 0-indexado)
function tocaBoletinHoy(ahora) {
  const hoyUTC = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  const dias = Math.round((hoyUTC - ANCLA_BOLETIN) / 86400000);
  return dias >= 0 && dias % 3 === 0;
}

async function generarYEnviarBoletines(ahora, supabaseUrl, headers) {
  if (!tocaBoletinHoy(ahora)) return 0; // el cron corre a diario; el boletín solo se genera cada 3 días
  const semanaActual = fechaISO(ahora);
  const semanaPasada = fechaISO(new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000));

  // Idempotencia: si el cron se reintenta el mismo día, no regenera (ni
  // re-manda por correo) un boletín que ya se generó hoy.
  const yaRes = await fetch(`${supabaseUrl}/rest/v1/boletines?select=tcg&semana=eq.${semanaActual}`, { headers });
  const ya = new Set((await yaRes.json().catch(() => [])).map((b) => b.tcg));

  const generados = [];
  for (const tcg of TCGS_CON_BOLETIN) {
    if (ya.has(tcg)) continue;
    try {
      const b = await generarBoletinTcg(tcg, semanaActual, semanaPasada, supabaseUrl, headers);
      if (b) generados.push(b);
    } catch (e) {
      console.error(`Error generando el boletín de ${tcg}:`, e);
    }
  }
  if (generados.length) {
    await enviarBoletinesPorCorreo(generados, supabaseUrl, headers).catch((e) => console.error("Error mandando boletines por correo:", e));
  }
  return generados.length;
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

    // ---- Boletín de precios (cada 3 días) ----
    const boletinesGenerados = await generarYEnviarBoletines(ahora, supabaseUrl, headers).catch((e) => {
      console.error("Error generando el boletín:", e);
      return 0;
    });

    res.status(200).json({ ok: true, avisos, destellosOtorgados, boletinesGenerados });
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
