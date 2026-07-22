// Corre una vez al día (ver vercel.json) y resuelve la papelera de chats:
// 1) Toda fila de mensajes_papelera con más de 7 días se marca como
//    "definitivo" (ya no se puede restaurar, desaparece de la papelera).
// 2) Si AMBAS personas de una conversación (mismo par + mismo contexto) ya
//    la marcaron como definitiva, se borran físicamente los mensajes de esa
//    conversación (ya nadie la quiere conservar) y las filas de papelera
//    correspondientes.
//
// Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, y CRON_SECRET (Vercel
// la manda sola como header Authorization cuando configuras esa variable).

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1) Marcar como definitivas las que ya llevan 7+ días en la papelera.
    await fetch(`${supabaseUrl}/rest/v1/mensajes_papelera?definitivo=eq.false&eliminado_en=lte.${hace7dias}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ definitivo: true }),
    });

    // 2) Buscar pares donde ambos lados ya marcaron definitivo, y purgar esa conversación.
    const res2 = await fetch(`${supabaseUrl}/rest/v1/mensajes_papelera?select=*&definitivo=eq.true`, { headers });
    const definitivas = await res2.json();

    const set = new Set((definitivas || []).map((f) => `${f.perfil_id}|${f.otro_perfil_id}|${f.contexto}`));
    let conversacionesPurgadas = 0;

    for (const f of definitivas || []) {
      // Solo procesar cada par una vez (cuando perfil_id < otro_perfil_id evitamos duplicar el trabajo).
      if (f.perfil_id > f.otro_perfil_id) continue;
      const contraparte = `${f.otro_perfil_id}|${f.perfil_id}|${f.contexto}`;
      if (!set.has(contraparte)) continue;

      const filtroMensajes =
        `contexto=eq.${encodeURIComponent(f.contexto)}` +
        `&or=(and(de_perfil_id.eq.${f.perfil_id},para_perfil_id.eq.${f.otro_perfil_id}),and(de_perfil_id.eq.${f.otro_perfil_id},para_perfil_id.eq.${f.perfil_id}))`;

      await fetch(`${supabaseUrl}/rest/v1/mensajes?${filtroMensajes}`, { method: "DELETE", headers });
      await fetch(
        `${supabaseUrl}/rest/v1/mensajes_papelera?contexto=eq.${encodeURIComponent(f.contexto)}&perfil_id=eq.${f.perfil_id}&otro_perfil_id=eq.${f.otro_perfil_id}`,
        { method: "DELETE", headers }
      );
      await fetch(
        `${supabaseUrl}/rest/v1/mensajes_papelera?contexto=eq.${encodeURIComponent(f.contexto)}&perfil_id=eq.${f.otro_perfil_id}&otro_perfil_id=eq.${f.perfil_id}`,
        { method: "DELETE", headers }
      );
      conversacionesPurgadas++;
    }

    res.status(200).json({ ok: true, conversacionesPurgadas });
  } catch (e) {
    console.error("Error en cron de papelera de chats:", e);
    res.status(200).json({ ok: true, error: e.message });
  }
}
