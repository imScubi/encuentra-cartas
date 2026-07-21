// Genera una sesión real (access_token/refresh_token) para un sub-perfil que
// el admin administra, sin necesitar su contraseña — así el admin "entra
// como" ese perfil y puede usar la web exactamente igual que esa cuenta
// (publicar en el Mercado, editar su perfil, etc.), sin tocar ningún permiso
// existente: es una sesión legítima de ese usuario, como cualquier otra.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer /, "");
  const { subperfilId } = req.body || {};
  if (!token || !subperfilId) return res.status(400).json({ error: "Datos incompletos" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
    const caller = await userRes.json();
    if (!userRes.ok || !caller?.id) return res.status(401).json({ error: "Sesión inválida" });

    const adminRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,es_admin&id=eq.${caller.id}`, { headers });
    const adminRows = await adminRes.json();
    if (!adminRows?.[0]?.es_admin) return res.status(403).json({ error: "Solo un admin puede hacer esto" });

    const subRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,nombre,email,gestionado_por&id=eq.${subperfilId}`, { headers });
    const subRows = await subRes.json();
    const sub = subRows?.[0];
    if (!sub) return res.status(404).json({ error: "Ese sub-perfil no existe" });
    if (sub.gestionado_por !== caller.id) return res.status(403).json({ error: "No administras ese sub-perfil" });

    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "magiclink", email: sub.email }),
    });
    const linkData = await linkRes.json();
    if (!linkRes.ok) return res.status(500).json({ error: linkData?.msg || "No se pudo generar el acceso al sub-perfil" });

    const hashedToken = linkData.hashed_token || linkData.properties?.hashed_token;
    if (!hashedToken) return res.status(500).json({ error: "No se pudo generar el acceso al sub-perfil (sin token)" });

    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }),
    });
    const sesion = await verifyRes.json();
    if (!verifyRes.ok || !sesion?.access_token) {
      return res.status(500).json({ error: sesion?.msg || "No se pudo iniciar sesión en el sub-perfil" });
    }

    res.status(200).json({
      ok: true,
      session: { access_token: sesion.access_token, refresh_token: sesion.refresh_token, user: sesion.user },
      nombre: sub.nombre,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo entrar al sub-perfil." });
  }
}
