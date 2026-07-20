// Service worker mínimo: solo existe para recibir notificaciones push
// de la Wishlist Premium. No cachea nada (no es un service worker offline).

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Encuentra Cartas";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
