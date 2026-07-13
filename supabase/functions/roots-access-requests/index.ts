import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const ROOTS_DOMAIN = "roots-consultants.com";
const REDIRECT = "https://pgoutzeris-stack.github.io/ROOTS_Intranet/";
const ALLOWED_ORIGINS = new Set([
  "https://pgoutzeris-stack.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:8080",
]);

function headers(req: Request) {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://pgoutzeris-stack.github.io",
    "Content-Type": "application/json",
  };
}

function reply(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(req) });
}

function emailOf(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isRootsEmail(email: string) {
  return email.split("@")[1] === ROOTS_DOMAIN;
}

async function adminContext(req: Request, url: string, anonKey: string, serviceKey: string) {
  const auth = req.headers.get("authorization") || "";
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await callerClient.auth.getUser();
  if (error || !user) return { error: "Nicht angemeldet", status: 401 };
  const db = createClient(url, serviceKey, { db: { schema: "users" } });
  const { data: profile, error: profileError } = await db.from("profiles").select("id,app_role").eq("id", user.id).maybeSingle();
  if (profileError) return { error: profileError.message, status: 500 };
  if (profile?.app_role !== "admin") return { error: "Keine Berechtigung", status: 403 };
  return { user, db, service: createClient(url, serviceKey) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { error: "Methode nicht erlaubt" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(req, { error: "Server-Konfiguration fehlt" }, 500);
  let body: { action?: string; email?: string; full_name?: string; request_id?: string; send_email?: boolean };
  try { body = await req.json(); } catch { return reply(req, { error: "Ungültiger Request-Body" }, 400); }

  if (body.action === "request_access") {
    const email = emailOf(body.email);
    if (!email || !isRootsEmail(email)) return reply(req, { error: `Nur ${ROOTS_DOMAIN}-Adressen sind zugelassen.` }, 400);
    const db = createClient(url, serviceKey, { db: { schema: "users" } });
    const name = String(body.full_name || "").trim().slice(0, 160) || null;
    const { data: existing } = await db.from("access_requests").select("id").eq("status", "pending").ilike("email", email).maybeSingle();
    if (existing) return reply(req, { ok: true, message: "Die Anfrage liegt den Admins bereits vor." });
    const { data: request, error } = await db.from("access_requests").insert({ email, full_name: name }).select("id,email,full_name,status,requested_at").single();
    if (error) return reply(req, { error: error.message }, 500);
    const { data: admins, error: adminError } = await db.from("profiles").select("id").eq("app_role", "admin");
    if (adminError) return reply(req, { error: adminError.message }, 500);
    const notifications = (admins || []).map((admin) => ({
      user_id: admin.id,
      type: "access_request",
      title: "Neue Zugangsanfrage",
      message: `${name || email} möchte Zugang zum ROOTS Intranet.`,
      meta: { request_id: request.id, email, full_name: name },
    }));
    if (notifications.length) {
      const { error: notificationError } = await createClient(url, serviceKey, { db: { schema: "recruiting" } }).from("notifications").insert(notifications);
      if (notificationError) console.error("notification insert", notificationError.message);
    }
    return reply(req, { ok: true, message: "Deine Anfrage wurde an die ROOTS-Admins gesendet." });
  }

  const context = await adminContext(req, url, anonKey, serviceKey);
  if ("error" in context) return reply(req, { error: context.error }, context.status);
  const db = context.db;
  if (body.action === "list_requests") {
    const { data, error } = await db.from("access_requests").select("id,email,full_name,status,requested_at,reviewed_at,invite_sent").order("requested_at", { ascending: false });
    return error ? reply(req, { error: error.message }, 500) : reply(req, { requests: data || [] });
  }
  const requestId = body.request_id;
  if (!requestId) return reply(req, { error: "Anfrage-ID fehlt" }, 400);
  const { data: request, error: requestError } = await db.from("access_requests").select("*").eq("id", requestId).single();
  if (requestError || !request) return reply(req, { error: "Anfrage nicht gefunden" }, 404);
  if (body.action === "reject_request") {
    const { error } = await db.from("access_requests").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: context.user.id }).eq("id", requestId);
    return error ? reply(req, { error: error.message }, 500) : reply(req, { ok: true });
  }
  if (body.action === "approve_request") {
    const email = emailOf(request.email)!;
    const fullName = String(request.full_name || email.split("@")[0]);
    let authUserId: string | null = null;
    const { data: listed } = await context.service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    authUserId = listed?.users?.find((u) => (u.email || "").toLowerCase() === email)?.id || null;
    if (body.send_email) {
      const { data, error } = await context.service.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo: REDIRECT });
      if (error || !data?.user?.id) return reply(req, { error: error?.message || "Einladung konnte nicht versendet werden." }, 500);
      authUserId = data.user.id;
    } else if (!authUserId) {
      const { data, error } = await context.service.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID(), user_metadata: { full_name: fullName } });
      if (error || !data?.user?.id) return reply(req, { error: error?.message || "Nutzer konnte nicht angelegt werden." }, 500);
      authUserId = data.user.id;
    }
    const { error: profileError } = await db.from("profiles").upsert({ id: authUserId, email, full_name: fullName, app_role: "reader", app_settings: {} }, { onConflict: "id" });
    if (profileError) return reply(req, { error: profileError.message }, 500);
    const { error: updateError } = await db.from("access_requests").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: context.user.id, invite_sent: Boolean(body.send_email) }).eq("id", requestId);
    return updateError ? reply(req, { error: updateError.message }, 500) : reply(req, { ok: true, message: body.send_email ? `Einladung an ${email} wurde versendet.` : `${email} wurde ohne E-Mail angelegt.` });
  }
  if (body.action === "send_password_reset") {
    const email = emailOf(body.email);
    if (!email || !isRootsEmail(email)) return reply(req, { error: "Ungültige ROOTS-E-Mail-Adresse" }, 400);
    const { error } = await context.service.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
    return error ? reply(req, { error: error.message }, 500) : reply(req, { ok: true, message: `Passwort-Reset an ${email} wurde angefordert.` });
  }
  return reply(req, { error: "Unbekannte Aktion" }, 400);
});
