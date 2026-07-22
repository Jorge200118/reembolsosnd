// Service worker mínimo para la PWA de empleados (habilita "instalar" / offline básico).
const CACHE = "vales-ac-v1";
const BASE = ["/empleado"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Network-first para navegación (siempre lo más fresco), con caché de respaldo.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("/empleado"))),
    );
  }
});

// ── Web Push (append; no interfiere con install/activate/fetch) ──
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Vales AC", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Vales AC";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-72.png", // solo Android lo usa
    data: { url: data.url || "/empleado" },
    tag: data.tag,
    renotify: Boolean(data.tag),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Chrome rota la suscripción de push por su cuenta cada cierto tiempo. Si no la
// volvemos a registrar, queda muerta y el empleado deja de recibir avisos sin
// enterarse (el interruptor aparece apagado la próxima vez que entra). Aquí la
// re-suscribimos apenas el navegador avisa del cambio, aunque la app no esté
// abierta. Es best-effort: si algo falla, la auto-reparación al abrir la app lo
// cubre. La cookie de sesión viaja sola por ser mismo origen.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const resp = await fetch("/api/empleado/vapid");
        if (!resp.ok) return;
        const { publicKey } = await resp.json();
        if (!publicKey) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToBytes(publicKey),
        });
        const raw = sub.toJSON();
        await fetch("/api/empleado/suscribir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: raw.endpoint,
            p256dh: raw.keys && raw.keys.p256dh,
            auth: raw.keys && raw.keys.auth,
            user_agent: "sw-resuscribe",
          }),
        });
      } catch (e) {
        // best-effort: la auto-reparación al abrir la app es la red de respaldo.
      }
    })(),
  );
});

function urlB64ToBytes(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/empleado";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/empleado") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    }),
  );
});
