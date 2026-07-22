// Junta crear-subperfil / entrar-subperfil en un solo archivo (con "accion"
// en el body) — Vercel Hobby limita a 12 funciones serverless por
// despliegue, y separarlos en 2 archivos ya no cabía.
import crypto from "crypto";

// Mismo criterio que slugify() en el navegador (src/App.jsx) y en Postgres
// (migración 041): perfiles.slug es NOT NULL + unique, así que hay que
// mandarlo siempre al crear uno, con reintento por si el nombre ya se usó.
function slugify(texto) {
  const limpio = (texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return limpio || null;
}

async function crearPerfilConSlugUnico(supabaseUrl, headers, datosBase, nombreParaSlug) {
  const base = slugify(nombreParaSlug) || `usuario-${crypto.randomBytes(4).toString("hex")}`;
  for (let intento = 1; intento <= 20; intento++) {
    const slug = intento === 1 ? base : `${base}-${intento}`;
    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfiles`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ ...datosBase, slug }),
    });
    const perfilCreado = await perfilRes.json();
    if (perfilRes.ok) return perfilCreado;
    const yaExiste = /duplicate key|already exists/i.test(perfilCreado?.message || "");
    if (!yaExiste || intento === 20) {
      const err = new Error(Array.isArray(perfilCreado) ? "No se pudo crear el perfil" : perfilCreado?.message || "No se pudo crear el perfil");
      err.status = perfilRes.status;
      throw err;
    }
  }
}

async function crear(req, res, { supabaseUrl, headers, caller }) {
  const { nombre, tipo } = req.body || {};
  if (!nombre?.trim() || !["individual", "tienda"].includes(tipo)) {
    return res.status(400).json({ error: "Datos incompletos o inválidos" });
  }

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

  try {
    await crearPerfilConSlugUnico(
      supabaseUrl, headers,
      { id: nuevoUsuario.id, nombre: nombre.trim(), tipo, email, plan: "pokeball", gestionado_por: caller.id },
      nombre.trim()
    );
  } catch (e) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${nuevoUsuario.id}`, { method: "DELETE", headers }).catch(() => {});
    throw e;
  }

  res.status(200).json({ ok: true, id: nuevoUsuario.id, nombre: nombre.trim() });
}

async function entrar(req, res, { supabaseUrl, headers, serviceKey, caller }) {
  const { subperfilId } = req.body || {};
  if (!subperfilId) return res.status(400).json({ error: "Datos incompletos" });

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
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer /, "");
  const { accion } = req.body || {};
  if (!token || !["crear", "entrar"].includes(accion)) return res.status(400).json({ error: "Datos incompletos o inválidos" });

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

    const ctx = { supabaseUrl, headers, serviceKey, caller };
    if (accion === "crear") return await crear(req, res, ctx);
    return await entrar(req, res, ctx);
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo procesar la solicitud." });
  }
}
