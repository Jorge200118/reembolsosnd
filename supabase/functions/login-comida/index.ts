// ================================
// EDGE FUNCTION: login-comida
// Compara email+password contra rnd_usuarios EN EL SERVIDOR (texto plano, igual
// que el HTML viejo — no se hashea aún para no romperlo). Devuelve la sesión.
// Body: { email: string, password: string }
// ================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string" || email.trim() === "") {
      return new Response(JSON.stringify({ ok: false, error: "Datos incompletos" }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: usuarios, error } = await supabase
      .from("rnd_usuarios")
      .select("email, password, nombre, rol, sucursal, area, activo")
      .eq("email", email.trim())
      .eq("activo", true);
    if (error) throw error;

    const u = (usuarios ?? [])[0];
    // Comparación texto plano por ahora, como el HTML viejo.
    if (!u || String(u.password) !== password) {
      return new Response(JSON.stringify({ ok: false, error: "Credenciales incorrectas" }), { status: 401, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({
      ok: true,
      usuario: {
        email: String(u.email),
        nombre: String(u.nombre),
        rol: String(u.rol),
        sucursal: u.sucursal ? String(u.sucursal) : null,
        // Área del encargado de almacén (solo Los Mochis la usa). null =
        // entrega todas las partidas, que es como funcionan las demás
        // sucursales. Viaja en la cookie firmada porque decide qué puede
        // marcar entregado: es una credencial, no un dato de formulario.
        area: u.area ? String(u.area) : null,
      },
    }), { headers: CORS_HEADERS });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS_HEADERS });
  }
});
