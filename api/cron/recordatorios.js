// Corre una vez al día (ver vercel.json) y manda notificaciones push de
// aviso cuando: (a) el plan de un perfil está por vencer, (b) un boost
// (publicación destacada) está por dejar de estar destacado, o (c) un
// torneo que marcaste con "Me interesa" es en los próximos 3 días. El día 1
// de cada mes, de paso, otorga el regalo mensual de Destellos por plan (ver
// otorgarDestellosMensuales más abajo), cada 3 días genera y manda el
// boletín de precios (ver generarYEnviarBoletines), y cada lunes manda a
// cada tienda un resumen semanal de mensajes/ventas/seguidores nuevos por
// correo (ver generarYEnviarResumenSemanal) -- todo va en este mismo
// archivo en vez de uno nuevo por tarea para no sumar funciones
// serverless (Vercel Hobby limita a 12 por despliegue, y ya estábamos
// justo en el límite).
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
  let intentados = 0;
  for (const tcg of TCGS_CON_BOLETIN) {
    if (ya.has(tcg)) continue;
    intentados++;
    try {
      const b = await generarBoletinTcg(tcg, semanaActual, semanaPasada, supabaseUrl, headers);
      if (b) generados.push(b);
    } catch (e) {
      // Antes esto solo se registraba en el log de Vercel -- si fallaba
      // los 3 TCG todos los días (ej. la fuente de precios cambió de
      // formato), el boletín podía dejar de mandarse semanas seguidas sin
      // que nadie se enterara. Ahora si falla, avisa de verdad.
      await avisarFalloCron(`boletín de ${tcg}`, e, supabaseUrl, headers);
    }
  }
  // generarBoletinTcg también puede devolver null SIN lanzar error (por
  // diseño: universoGlobalPorTcg/lib/precios.js trata una fuente externa
  // caída como "no hay boletín hoy", no como una falla que hay que avisar
  // -- así una API flaky un día no manda una alerta por gusto). Pero si de
  // verdad se intentó generar algo hoy y NINGÚN TCG produjo resultado, ya
  // no es un hipo pasajero -- probablemente una fuente de precios cambió
  // de formato o dejó de responder como se espera, y vale la pena que el
  // admin se entere en vez de que quede en blanco semana tras semana.
  if (intentados > 0 && generados.length === 0) {
    await avisarFalloCron(
      "boletín de precios",
      new Error(`Se intentó generar boletín para ${intentados} TCG hoy y ninguno produjo resultados -- revisa si pokemontcg.io/Scryfall/YGOPRODeck cambiaron su formato o dejaron de responder.`),
      supabaseUrl,
      headers
    );
  }
  if (generados.length) {
    await enviarBoletinesPorCorreo(generados, supabaseUrl, headers).catch((e) => avisarFalloCron("envío de boletines por correo", e, supabaseUrl, headers));
  }
  return generados.length;
}

// ============================================================
// Resumen semanal por correo para cada tienda, cada lunes: cuántos
// mensajes nuevos de compradores, ventas confirmadas y seguidores nuevos
// tuvo en los últimos 7 días. Todo son datos que ya se calculan también
// en vivo para "Mis estadísticas" (MisEstadisticasTienda en App.jsx,
// Diamante+) -- este correo es la versión "te lo llevo yo" para que una
// tienda que no entra seguido igual se entere de que algo pasó, sin
// tener que ir a revisar. Si una tienda no tuvo NINGUNA novedad esa
// semana no se le manda correo (evita un correo vacío que solo genera
// ruido). No depende de un plan -- es un correo simple, no el dashboard
// completo de gráficas.
// ============================================================
async function generarYEnviarResumenSemanal(ahora, supabaseUrl, headers) {
  if (ahora.getUTCDay() !== 1) return 0; // cada lunes
  const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const tiendasRes = await fetch(
    `${supabaseUrl}/rest/v1/tiendas?select=id,nombre,perfil_id,perfiles!perfil_id(email)&perfil_id=not.is.null`,
    { headers }
  );
  const tiendas = await tiendasRes.json().catch(() => []);

  let enviados = 0;
  for (const t of tiendas || []) {
    const email = t.perfiles?.email;
    if (!email) continue;

    const [mensajesRes, ventasRes, seguidoresRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/mensajes?select=id&para_perfil_id=eq.${t.perfil_id}&created_at=gte.${hace7dias}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/ventas?select=id,precio&vendedor_perfil_id=eq.${t.perfil_id}&estado=eq.confirmada&created_at=gte.${hace7dias}`, { headers }),
      fetch(`${supabaseUrl}/rest/v1/seguidores?select=id&seguido_perfil_id=eq.${t.perfil_id}&created_at=gte.${hace7dias}`, { headers }),
    ]);
    const mensajes = await mensajesRes.json().catch(() => []);
    const ventas = await ventasRes.json().catch(() => []);
    const seguidores = await seguidoresRes.json().catch(() => []);

    const numMensajes = (mensajes || []).length;
    const numVentas = (ventas || []).length;
    const montoVentas = (ventas || []).reduce((s, v) => s + (Number(v.precio) || 0), 0);
    const numSeguidores = (seguidores || []).length;

    if (numMensajes === 0 && numVentas === 0 && numSeguidores === 0) continue;

    const html = `
      <h2>📊 Tu semana en Encuentra Cartas</h2>
      <p>Esto pasó en <strong>${t.nombre}</strong> en los últimos 7 días:</p>
      <ul>
        <li>💬 ${numMensajes} mensaje(s) nuevo(s) de compradores</li>
        <li>💰 ${numVentas} venta(s) confirmada(s)${numVentas ? ` ($${montoVentas.toLocaleString("es-MX")} MXN)` : ""}</li>
        <li>⭐ ${numSeguidores} seguidor(es) nuevo(s)</li>
      </ul>
      <p><a href="https://encuentracartasmx.com">Ver mi tienda en Encuentra Cartas</a></p>
    `;
    try {
      await enviarCorreo({ to: email, subject: "📊 Tu resumen semanal de Encuentra Cartas", html });
      enviados++;
    } catch (e) {
      console.error(`Error mandando resumen semanal a la tienda ${t.id}:`, e);
    }
  }
  return enviados;
}

// Antes, un error sin capturar en CUALQUIER sección (planes, boosts,
// torneos...) tumbaba el try/catch de todo el handler entero -- las
// secciones de más abajo (incluido el boletín) simplemente nunca
// llegaban a correr ese día, sin que nadie se enterara (el error solo
// quedaba en el log de Vercel). Aparte de avisar de verdad (ver
// avisarFalloCron), cada sección ahora corre en su propio try/catch para
// que una falla puntual no le quite su turno a las demás.
async function avisarFalloCron(origen, error, supabaseUrl, headers) {
  console.error(`Error en sección "${origen}" del cron de recordatorios:`, error);
  try {
    const mensaje = `[cron recordatorios · ${origen}] ${String(error?.message || error).slice(0, 400)}`;
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const previoRes = await fetch(
      `${supabaseUrl}/rest/v1/errores_app?select=id&mensaje=eq.${encodeURIComponent(mensaje)}&notificado=eq.true&created_at=gte.${haceUnaHora}&limit=1`,
      { headers }
    );
    const previos = await previoRes.json().catch(() => []);
    const yaNotificado = (previos || []).length > 0;

    await fetch(`${supabaseUrl}/rest/v1/errores_app`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ mensaje, notificado: !yaNotificado }),
    });
    if (yaNotificado) return; // ya se avisó de este mismo error en la última hora, no repetir

    const adminsRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,email&es_admin=eq.true`, { headers });
    const admins = await adminsRes.json().catch(() => []);
    if (!admins?.length) return;

    await fetch(`${supabaseUrl}/rest/v1/notificaciones`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(admins.map((a) => ({ perfil_id: a.id, tipo: "error", titulo: "⚠️ Falló una parte del cron diario", mensaje, url: "/" }))),
    });
    await Promise.allSettled(
      admins.filter((a) => a.email).map((a) => enviarCorreo({ to: a.email, subject: "⚠️ Falló una parte del cron diario", html: `<p>${mensaje}</p>` }))
    );
  } catch (e) {
    console.error("Error avisando de una falla del cron:", e);
  }
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

  // ---- Planes por vencer ----
  try {
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
  } catch (e) {
    await avisarFalloCron("planes por vencer", e, supabaseUrl, headers);
  }

  // ---- Boosts por vencer ----
  try {
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
  } catch (e) {
    await avisarFalloCron("boosts por vencer", e, supabaseUrl, headers);
  }

  // ---- Torneos por venir (recordatorio a quien marcó "Me interesa") ----
  try {
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
  } catch (e) {
    await avisarFalloCron("torneos por venir", e, supabaseUrl, headers);
  }

  // ---- Regalo mensual de Destellos por plan (solo el día 1) ----
  let destellosOtorgados = 0;
  try {
    destellosOtorgados = await otorgarDestellosMensuales(ahora, supabaseUrl, headers);
  } catch (e) {
    await avisarFalloCron("destellos mensuales", e, supabaseUrl, headers);
  }

  // ---- Boletín de precios (cada 3 días) ----
  const boletinesGenerados = await generarYEnviarBoletines(ahora, supabaseUrl, headers).catch((e) => {
    avisarFalloCron("boletín de precios", e, supabaseUrl, headers);
    return 0;
  });

  // ---- Resumen semanal por tienda (cada lunes) ----
  const resumenesEnviados = await generarYEnviarResumenSemanal(ahora, supabaseUrl, headers).catch((e) => {
    avisarFalloCron("resumen semanal de tiendas", e, supabaseUrl, headers);
    return 0;
  });

  res.status(200).json({ ok: true, avisos, destellosOtorgados, boletinesGenerados, resumenesEnviados });
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
