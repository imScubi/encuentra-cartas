// Envío de correo vía Gmail SMTP (gratis, sin necesidad de dominio propio).
// Si no está configurado (faltan GMAIL_USER o GMAIL_APP_PASSWORD) simplemente
// no manda nada, para no romper el resto del flujo (push sigue funcionando
// igual).
//
// Requiere: GMAIL_USER (el correo de Gmail remitente) y GMAIL_APP_PASSWORD
// (una "contraseña de aplicación" de 16 caracteres, generada en
// https://myaccount.google.com/apppasswords — NO tu contraseña normal).
import nodemailer from "nodemailer";

let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return _transporter;
}

export async function enviarCorreo({ to, subject, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !to) return;
  try {
    await getTransporter().sendMail({
      from: `"Encuentra Cartas" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (e) {
    console.error("Error enviando correo:", e);
  }
}
