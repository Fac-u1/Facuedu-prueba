// Edge Function: el teléfono (con su sesión iniciada) aprueba el código de la computadora.
// No copia la sesión del teléfono: genera un enlace de un solo uso para la computadora.
// Despliegue: supabase functions deploy aprobar-login
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Falta iniciar sesión en el teléfono." }, 401);

  let code = "";
  try {
    code = String((await req.json()).code ?? "");
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }
  if (!/^SDFANL-[A-Z0-9]{6,40}$/.test(code)) return json({ error: "Código inválido." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user?.email) {
    return json({ error: "La sesión del teléfono no es válida. Volvé a iniciar sesión." }, 401);
  }

  const { data: pending } = await admin
    .from("login_requests")
    .select("code")
    .eq("code", code)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!pending) {
    return json({ error: "El código venció o ya fue usado. Generá uno nuevo en la computadora." }, 410);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: "No se pudo autorizar la computadora. Intentá de nuevo." }, 500);
  }

  const { error: updErr } = await admin
    .from("login_requests")
    .update({
      status: "approved",
      user_id: userData.user.id,
      token_hash: link.properties.hashed_token,
    })
    .eq("code", code)
    .eq("status", "pending");
  if (updErr) return json({ error: "No se pudo guardar la aprobación." }, 500);

  return json({ ok: true });
});
