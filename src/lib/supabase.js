// ---- Conexión a Supabase (usa la anon key, es segura para el navegador) ----
export const SUPABASE_URL = "https://nulypgaaekexlbxbxdwq.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51bHlwZ2FhZWtleGxieGJ4ZHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTk3OTcsImV4cCI6MjA5OTk3NTc5N30.9qxfcmUx5k1br1CH3DIFI2EplFJWYeRyg6HFeZNN7og";

// ---- Llave pública VAPID para notificaciones push (la privada vive solo en el servidor) ----
export const VAPID_PUBLIC_KEY = "BLPUA-CAQihRVApIBjAaOg6Sb83z1j2uLTL-irKRiZ0JW6XlpJ2u9S4pFCqbC15VBOsL4MmlCHUe-_LsychJOs0";

// El token de sesión de Supabase expira solo (~1 hora). Si una consulta falla
// por eso, la renovamos con el refresh_token y reintentamos una sola vez.
// onSesionRefrescada lo registra la app principal (vía setOnSesionRefrescada) para
// enterarse del cambio (y así no perder la renovación en el siguiente render).
let onSesionRefrescada = null;
let refrescandoPromesa = null;

export function setOnSesionRefrescada(fn) {
  onSesionRefrescada = fn;
}

export function pareceSesionExpirada(status, data) {
  return status === 401 || /jwt expired|invalid jwt/i.test(JSON.stringify(data || {}));
}

export async function refrescarSesion(session) {
  if (!session?.refresh_token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  if (!refrescandoPromesa) {
    refrescandoPromesa = fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.msg || "Tu sesión expiró. Vuelve a iniciar sesión.");
        const nueva = { access_token: data.access_token, refresh_token: data.refresh_token, user: data.user || session.user };
        localStorage.setItem("ec_session", JSON.stringify(nueva));
        onSesionRefrescada?.(nueva);
        return nueva;
      })
      .finally(() => { refrescandoPromesa = null; });
  }
  return refrescandoPromesa;
}

export async function sb(path, session) {
  const pedir = (s) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}` },
    });

  let res = await pedir(session);
  if (!res.ok && session) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await pedir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    throw new Error(`Error consultando la base de datos (${res.status}) en ${path}: ${data?.message || data?.hint || JSON.stringify(data) || "sin detalle"}`);
  }
  return res.json();
}

export async function sbWrite(method, path, body, session) {
  const pedir = (s) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s?.access_token || SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });

  let res = await pedir(session);
  let data = await res.clone().json().catch(() => null);
  if (!res.ok && session && pareceSesionExpirada(res.status, data)) {
    const nueva = await refrescarSesion(session);
    res = await pedir(nueva);
    data = await res.json().catch(() => null);
  }
  if (!res.ok) throw new Error(data?.message || `Error guardando (${res.status})`);
  return data;
}

export async function authSignUp(email, password, metadata) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "No se pudo crear la cuenta");
  return data; // incluye access_token si la confirmación por correo está desactivada
}

export async function authSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.msg || data?.error_description || "Correo o contraseña incorrectos");
  return data;
}

export async function subirAvatar(file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/avatar.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${s.access_token}`,
        "Content-Type": file.type || "image/jpeg",
        "x-upsert": "true",
      },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo subir la foto");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
}

export async function subirImagenAnuncio(file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/${Date.now()}.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/anuncios/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo subir la imagen");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/anuncios/${path}`;
}

export async function subirImagenABucket(bucket, file, session) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${session.user.id}/${Date.now()}.${ext}`;
  const subir = (s) =>
    fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}`, "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

  let res = await subir(session);
  if (!res.ok) {
    const data = await res.clone().json().catch(() => null);
    if (pareceSesionExpirada(res.status, data)) {
      const nueva = await refrescarSesion(session);
      res = await subir(nueva);
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo subir la imagen");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export async function subirImagenCarta(file, session) {
  return subirImagenABucket("cartas", file, session);
}
