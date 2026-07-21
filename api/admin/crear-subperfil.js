import crypto from "crypto";

// Crea una cuenta real (usuario de Supabase Auth + fila en perfiles) que un
// admin puede administrar libremente, sin tener que dar de alta un correo de
// verdad por cada una. Sirve para poblar el Mercado con vendedores "orgánicos".
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer /, "");
  const { nombre, tipo } = req.body || {};
  if (!token || !nombre?.trim() || !["individual", "tienda"].includes(tipo)) {
    return res.status(400).json({ error: "Datos incompletos o inválidos" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
    const caller = await userRes.json();
    if (!userRes.ok || !caller?.id) return res.status(401).json({ error: "Sesión inválida" });

    const adminRes = await fetch(`${supabaseUrl}/rest/v1/perfiles?select=id,es_admin&id=eq.${caller.id}`, { headers });
    const adminRows = await adminRes.json();
    if (!adminRows?.[0]?.es_admin) return res.status(403).json({ error: "Solo un admin puede crear sub-perfiles" });

    const email = `sub-${crypto.randomUUID()}@subperfiles.encuentracartas.internal`;
    const password = crypto.randomBytes(24).toString("hex");

    const crearRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { nombre: nombre.trim(), subperfil: true } }),
    });
    const nuevoUsuario = await crearRes.json();
    if (!crearRes.ok || !nuevoUsuario?.id) {
      return res.status(500).json({ error: nuevoUsuario?.msg || nuevoUsuario?.error_description || "No se pudo crear el sub-perfil" });
    }

    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfiles`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        id: nuevoUsuario.id,
        nombre: nombre.trim(),
        tipo,
        email,
        plan: "pokeball",
        gestionado_por: caller.id,
      }),
    });
    const perfilCreado = await perfilRes.json();
    if (!perfilRes.ok) {
      // Si falla crear el perfil, no dejamos huérfano el usuario de auth recién creado.
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${nuevoUsuario.id}`, { method: "DELETE", headers }).catch(() => {});
      throw new Error(Array.isArray(perfilCreado) ? "No se pudo crear el perfil" : perfilCreado?.message || "No se pudo crear el perfil");
    }

    res.status(200).json({ ok: true, id: nuevoUsuario.id, nombre: nombre.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo crear el sub-perfil." });
  }
}
