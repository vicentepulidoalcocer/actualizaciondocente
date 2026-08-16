/* ================================================================
   NOTIFICACIONES AL CELULAR (push web)
   Registra el dispositivo del usuario y permite enviar avisos que
   llegan aunque el portal esté cerrado.
   ================================================================ */

import { supabase } from "./supabase";

// Llave pública del portal. La privada vive solo en Supabase.
export const VAPID_PUBLICA =
  "BOVB0rfu0HHzSZ712_3l-DA1mYj9WlBnTKBOHByqteo6YU74u-YXvdbGzBZzvCtdvXsO9wTRDMjvmMwRGNbIxTw";

const base = import.meta.env.BASE_URL || "/";

// ¿El dispositivo admite notificaciones?
export const soportaPush = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/* En iPhone y iPad las notificaciones solo funcionan si el portal se
   agregó a la pantalla de inicio y se abre desde ese ícono. */
export const esIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const instaladoEnInicio = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const permisoActual = () => (soportaPush() ? Notification.permission : "unsupported");

const base64ABytes = (base64) => {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal);
  return Uint8Array.from([...crudo].map((c) => c.charCodeAt(0)));
};

// Instala (o recupera) el archivo de servicio
export async function registrarServicio() {
  if (!soportaPush()) return null;
  return navigator.serviceWorker.register(base + "sw.js", { scope: base });
}

/* Pide permiso y registra este dispositivo para el usuario indicado.
   Devuelve { ok } o { ok:false, motivo } con una razón entendible. */
export async function activarNotificaciones(usuarioId) {
  if (!soportaPush()) return { ok: false, motivo: "no_soportado" };
  if (esIOS() && !instaladoEnInicio()) return { ok: false, motivo: "ios_sin_instalar" };

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, motivo: "permiso_denegado" };

  const reg = await registrarServicio();
  if (!reg) return { ok: false, motivo: "no_soportado" };
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ABytes(VAPID_PUBLICA),
    });
  }

  const bruto = sub.toJSON();
  const { error } = await supabase.from("suscripciones").upsert({
    id: "sub_" + btoa(bruto.endpoint).slice(-40).replace(/[^a-zA-Z0-9]/g, ""),
    usuario_id: usuarioId,
    endpoint: bruto.endpoint,
    data: bruto,
  }, { onConflict: "endpoint" });

  if (error) return { ok: false, motivo: "guardado", detalle: error.message };
  return { ok: true };
}

// Da de baja este dispositivo
export async function desactivarNotificaciones() {
  if (!soportaPush()) return;
  const reg = await navigator.serviceWorker.getRegistration(base);
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await supabase.from("suscripciones").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

// ¿Este dispositivo ya está registrado?
export async function estaActivo() {
  if (!soportaPush() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration(base);
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}

/* Envía una notificación. Los errores no interrumpen la operación
   principal: si el envío falla, el aviso igual quedó publicado. */
export async function enviarPush({ destinatarios, titulo, cuerpo, ruta, urgente }) {
  try {
    const { data: s } = await supabase.auth.getSession();
    if (!s?.session) return { enviadas: 0 };
    const url = import.meta.env.VITE_SUPABASE_URL + "/functions/v1/enviar-push";
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.session.access_token}`,
      },
      body: JSON.stringify({ destinatarios, titulo, cuerpo, ruta, urgente }),
    });
    return await r.json();
  } catch {
    return { enviadas: 0 };
  }
}
