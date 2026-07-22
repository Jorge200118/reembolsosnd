const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// Registra en el backend la suscripción del navegador. El empleado_id lo pone
// el servidor desde la cookie firmada; aquí solo viajan los datos del endpoint.
async function registrar(sub: PushSubscription): Promise<boolean> {
  const raw = sub.toJSON();
  const res = await fetch("/api/empleado/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: raw.endpoint,
      p256dh: raw.keys?.p256dh,
      auth: raw.keys?.auth,
      user_agent: navigator.userAgent,
    }),
  });
  return res.ok;
}

async function obtenerOSuscribir(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const existente = await reg.pushManager.getSubscription();
  if (existente) return existente;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // cast: TS 5.7 tipa Uint8Array como Uint8Array<ArrayBufferLike>, que no
    // encaja en BufferSource (ArrayBuffer) del lib.dom. El buffer real es un
    // ArrayBuffer normal, así que el cast es seguro.
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
  });
}

// Pide permiso (DEBE ir dentro del gesto de click), suscribe y manda al backend.
export async function activarAvisos(): Promise<{ ok: true } | { ok: false; motivo: "denied" | "error" }> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return { ok: false, motivo: "denied" };
  try {
    const sub = await obtenerOSuscribir();
    return (await registrar(sub)) ? { ok: true } : { ok: false, motivo: "error" };
  } catch {
    return { ok: false, motivo: "error" };
  }
}

// Auto-reparación SILENCIOSA. Chrome rota/expira la suscripción de push cada
// cierto tiempo; sin esto el empleado aparece "sin avisos" y deja de recibirlos
// aunque nunca los apagó. Se llama al abrir la app SOLO cuando el permiso ya
// está concedido: subscribe() con el permiso dado NO abre ningún diálogo, así
// que no molesta a nadie. Nunca pide permiso —eso sigue exigiendo el gesto de
// activarAvisos()—; si el permiso no está concedido, no hace nada.
export async function asegurarSuscripcion(): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const sub = await obtenerOSuscribir();
    return await registrar(sub);
  } catch {
    return false;
  }
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
