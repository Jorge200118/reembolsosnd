import * as webpush from "jsr:@negrel/webpush@^0.5.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { mensaje, topicCorto, type SubRow, type Tipo } from "./mensajes.ts";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = "mailto:jorgefelixa1810@gmail.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Autoriza si el bearer es un JWT con role=service_role. verify_jwt ya validó la
// firma en la plataforma, así que basta decodificar el claim: la anon key trae
// role=anon y nadie puede forjar service_role sin el JWT secret. No depende de
// que el token sea byte-idéntico al del env (el del Vault difiere pero es válido).
function esServiceRole(auth: string | null): boolean {
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const parts = auth.slice(7).split(".");
  if (parts.length < 2) return false;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64)).role === "service_role";
  } catch {
    return false;
  }
}

// ApplicationServer se arma UNA vez por cold start; si falla, NO se cachea el rechazo.
let appServerPromise: Promise<webpush.ApplicationServer> | null = null;
function getAppServer() {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const { data, error } = await admin.rpc("leer_vapid_keys");
      if (error || !data) throw new Error("VAPID no leído: " + (error?.message ?? "vacío"));
      const exported = JSON.parse(data as string) as { publicKey: JsonWebKey; privateKey: JsonWebKey };
      const vapidKeys = await webpush.importVapidKeys(exported, { extractable: false });
      return webpush.ApplicationServer.new({ contactInformation: VAPID_SUBJECT, vapidKeys });
    })().catch((e) => { appServerPromise = null; throw e; });
  }
  return appServerPromise;
}

async function destinatarios(tipo: Tipo, empleadoId?: number): Promise<SubRow[]> {
  const { data, error } = await admin.rpc("destinatarios_push", { p_tipo: tipo, p_empleado_id: empleadoId ?? null });
  if (error) throw error;
  return (data ?? []) as SubRow[];
}

// Promise.race acota wall-clock (0.5.0 no expone AbortSignal en las opciones).
function conTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  // Solo invocable con el service_role (crons, generar-otp-comidas, crear-comida).
  if (!esServiceRole(req.headers.get("authorization")))
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: CORS });

  try {
    const { tipo, empleado_id } = await req.json() as { tipo: Tipo; empleado_id?: number };
    if (!tipo) return new Response(JSON.stringify({ error: "tipo requerido" }), { status: 400, headers: CORS });

    const [appServer, subs] = await Promise.all([getAppServer(), destinatarios(tipo, empleado_id)]);

    const ttl = tipo === "recordatorio" ? 3 * 3600 : 12 * 3600; // segundos
    const results = await Promise.allSettled(subs.map((row) => {
      const subscriber = appServer.subscribe({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } });
      return conTimeout(subscriber.pushTextMessage(JSON.stringify(mensaje(tipo, row)), {
        ttl, urgency: webpush.Urgency.Normal, topic: topicCorto(tipo, row.empleado_id),
      }));
    }));

    let enviados = 0, muertas = 0, fallidos = 0;
    await Promise.all(results.map(async (r, i) => {
      if (r.status === "fulfilled") { enviados++; return; }
      const err = r.reason as unknown;
      const status = err instanceof webpush.PushMessageError ? err.response.status : undefined;
      if (status === 404 || status === 410) {
        muertas++;
        await admin.rpc("push_borrar_endpoint", { p_endpoint: subs[i].endpoint });
      } else {
        fallidos++;
        console.error("push falló", subs[i].endpoint, status, String(err));
      }
    }));

    return new Response(JSON.stringify({ ok: true, tipo, total: subs.length, enviados, muertas, fallidos }), { headers: CORS });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error interno" }), { status: 500, headers: CORS });
  }
});
