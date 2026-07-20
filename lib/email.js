// Envío de correo vía la API REST de Resend (https://resend.com), sin
// dependencia npm: una sola llamada fetch. Si no está configurado
// (falta RESEND_API_KEY) simplemente no manda nada, para no romper
// el resto del flujo (push sigue funcionando igual).
//
// Requiere: RESEND_API_KEY, y opcionalmente RESEND_FROM (por defecto
// usa el remitente de pruebas de Resend, que funciona sin verificar
// un dominio propio).
export async function enviarCorreo({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) return;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Encuentra Cartas <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!r.ok) console.error("Resend respondió con error:", await r.text());
  } catch (e) {
    console.error("Error enviando correo:", e);
  }
}
