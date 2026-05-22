import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const DEFAULT_CORS = [
  "https://pgoutzeris-stack.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
];

const ROOTS_EMAIL_DOMAIN = "@roots-consultants.com";
const DEFAULT_WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const INTRANET_REDIRECT = "https://pgoutzeris-stack.github.io/ROOTS_Intranet/";

function corsHeaders(req: Request) {
  const o = req.headers.get("origin");
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (o && DEFAULT_CORS.includes(o)) h["Access-Control-Allow-Origin"] = o;
  else if (!o) h["Access-Control-Allow-Origin"] = "https://pgoutzeris-stack.github.io";
  return h;
}

function json(data: unknown, status: number, c: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...c, "Content-Type": "application/json" },
  });
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

function isRootsEmail(email: string): boolean {
  return email.endsWith(ROOTS_EMAIL_DOMAIN);
}

function normalizeRole(raw: unknown): "admin" | "editor" | "reader" {
  const role = String(raw || "reader").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "editor" || role === "member") return "editor";
  return "reader";
}

function workspaceMemberRole(appRole: "admin" | "editor" | "reader"): string {
  return appRole === "admin" ? "admin" : "reader";
}

type InvitePayload = {
  email?: string;
  salutation?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  kuerzel?: string | null;
  birthday?: string | null;
  start_date?: string | null;
  weekly_hours?: number | null;
  urlaubstage?: number | null;
  position?: string | null;
  hourly_rate?: number | null;
  reporting_line_id?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  app_role?: string;
  app_settings?: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  const c = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: c });
  if (req.method !== "POST") return json({ error: "Methode nicht erlaubt" }, 405, c);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Server-Konfiguration fehlt" }, 500, c);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user: caller },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !caller) return json({ error: "Nicht angemeldet" }, 401, c);

  const service = createClient(supabaseUrl, serviceKey);
  const usersDb = createClient(supabaseUrl, serviceKey, { db: { schema: "users" } });

  const { data: callerProfile, error: profErr } = await usersDb
    .from("profiles")
    .select("id,app_role")
    .eq("id", caller.id)
    .maybeSingle();
  if (profErr) return json({ error: profErr.message }, 500, c);
  if (callerProfile?.app_role !== "admin") {
    return json({ error: "Keine Berechtigung" }, 403, c);
  }

  let body: { action?: string } & InvitePayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültiger Request-Body" }, 400, c);
  }

  if (body.action !== "invite_employee") {
    return json({ error: "Unbekannte Aktion" }, 400, c);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "Eine gültige E-Mail-Adresse ist erforderlich." }, 400, c);
  if (!isRootsEmail(email)) {
    return json({
      error: `Neue Mitarbeiter müssen mit einer ${ROOTS_EMAIL_DOMAIN}-Adresse angelegt werden.`,
    }, 400, c);
  }

  const { data: existingProfile } = await usersDb
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();
  if (existingProfile) {
    return json({ error: "Ein Nutzer mit dieser E-Mail existiert bereits." }, 409, c);
  }

  const first = (body.first_name || "").trim();
  const last = (body.last_name || "").trim();
  const fullName = (body.full_name || [first, last].filter(Boolean).join(" ") || email.split("@")[0]).trim();
  const appRole = normalizeRole(body.app_role);

  const { data: listed } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingAuth = listed?.users?.find((u) => (u.email || "").toLowerCase() === email);
  if (existingAuth) {
    return json({ error: "Ein Auth-Nutzer mit dieser E-Mail existiert bereits." }, 409, c);
  }

  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      first_name: first || null,
      last_name: last || null,
    },
    redirectTo: INTRANET_REDIRECT,
  });
  if (inviteErr || !invited?.user?.id) {
    return json({ error: inviteErr?.message || "Einladung konnte nicht versendet werden." }, 500, c);
  }

  const newUserId = invited.user.id;
  const profilePayload = {
    salutation: body.salutation || null,
    first_name: first || null,
    last_name: last || null,
    full_name: fullName,
    email,
    kuerzel: body.kuerzel ? String(body.kuerzel).trim().toUpperCase().slice(0, 8) : null,
    birthday: body.birthday || null,
    start_date: body.start_date || null,
    weekly_hours: body.weekly_hours ?? null,
    urlaubstage: body.urlaubstage ?? 30,
    position: body.position || null,
    hourly_rate: body.hourly_rate ?? null,
    reporting_line_id: body.reporting_line_id || null,
    phone: body.phone || null,
    linkedin_url: body.linkedin_url || null,
    app_role: appRole,
    app_settings: body.app_settings && typeof body.app_settings === "object" ? body.app_settings : {},
  };

  const { data: profile, error: upsertErr } = await usersDb
    .from("profiles")
    .upsert({ id: newUserId, ...profilePayload }, { onConflict: "id" })
    .select("id,email,full_name,first_name,last_name,salutation,kuerzel,position,avatar_url,linkedin_url,phone,birthday,start_date,hourly_rate,weekly_hours,urlaubstage,app_role,app_settings,reporting_line_id")
    .single();
  if (upsertErr) {
    console.error("[roots-admin-users] profile upsert", upsertErr.message);
    return json({ error: "Profil konnte nicht angelegt werden: " + upsertErr.message }, 500, c);
  }

  const memberRole = workspaceMemberRole(appRole);
  const { error: memberErr } = await usersDb
    .from("workspace_members")
    .upsert(
      { workspace_id: DEFAULT_WORKSPACE_ID, user_id: newUserId, member_role: memberRole },
      { onConflict: "workspace_id,user_id" },
    );
  if (memberErr) {
    console.error("[roots-admin-users] workspace member", memberErr.message);
  }

  return json({
    ok: true,
    message: `Einladung an ${email} wurde versendet. Der Mitarbeiter kann dort ein Passwort setzen.`,
    profile,
  }, 200, c);
});
