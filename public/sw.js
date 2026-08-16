/* ================================================================
   Mi portal CBTA 291 — recepción de notificaciones
   Este archivo se instala en el dispositivo y sigue activo aunque
   la página esté cerrada: es lo que permite que lleguen los avisos.
   ================================================================ */

// Al instalarse, toma el control de inmediato (sin esperar a que se
// cierren las pestañas abiertas).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Llega una notificación desde el servidor
self.addEventListener("push", (evento) => {
  let datos = {};
  try { datos = evento.data ? evento.data.json() : {}; } catch { datos = {}; }

  const titulo = datos.titulo || "Mi portal CBTA 291";
  const opciones = {
    body: datos.cuerpo || "",
    icon: datos.icono || "./logo.png",
    badge: "./logo.png",
    tag: datos.tag || "portal-cbta291",
    // Las urgentes vibran y permanecen hasta que se tocan
    requireInteraction: !!datos.urgente,
    vibrate: datos.urgente ? [200, 100, 200] : undefined,
    data: { ruta: datos.ruta || "", url: datos.url || "./" },
  };

  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

// El usuario toca la notificación: se abre el portal en la sección
// correspondiente, reutilizando la pestaña si ya estaba abierta.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "./", self.location).href;

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(destino.split("#")[0]) && "focus" in v) {
          v.postMessage({ tipo: "ir_a", ruta: evento.notification.data?.ruta || "" });
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
