const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// Pide permiso (DEBE ir dentro del gesto de click), suscribe y manda al backend.
export async function activarAvisos(): Promise<{ ok: true } | { ok: false; motivo: "denied" | "error" }> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, motivo: "denied" };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const raw = sub.toJSON();
  const res = await fetch("/api/empleado/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: raw.endpoint, p256dh: raw.keys?.p256dh, auth: raw.keys?.auth, user_agent: navigator.userAgent }),
  });
  if (!res.ok) return { ok: false, motivo: "error" };
  return { ok: true };
}

export async function desactivarAvisos(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/empleado/desuscribir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
}
