import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = new Set([
  "https://pgoutzeris-stack.github.io",
  "http://localhost:8766",
]);
const MODEL = "gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type Payload = {
  action?: string;
  api_key_value?: string;
  message?: string;
  messages?: Array<{ role?: string; content?: string }>;
  analysis?: Record<string, unknown>;
  deep_analysis?: Record<string, unknown>;
  draft_spec?: Record<string, unknown> | null;
};

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://pgoutzeris-stack.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(req) });
}
function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}
async function isAdmin(userId: string) {
  const { data, error } = await adminClient().schema("users").from("profiles")
    .select("app_role").eq("id", userId).maybeSingle();
  return !error && data?.app_role === "admin";
}
async function getGeminiKey(): Promise<string | null> {
  const { data, error } = await adminClient().rpc("slide_writing_read_ai_key");
  if (!error && data) return data as string;
  return Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY") || null;
}
function validatePayload(body: Payload) {
  const raw = JSON.stringify(body);
  if (raw.length > 1024 * 1024) throw new Error("Anfrage ist zu groß.");
  body.message = String(body.message ?? "").slice(0, 20000);
  body.messages = (Array.isArray(body.messages) ? body.messages : []).slice(-8).map((item) => ({
    role: item?.role === "assistant" ? "assistant" : "user",
    content: String(item?.content ?? "").slice(0, 20000),
  }));
}
function buildPrompt(body: Payload) {
  const messages = (body.messages || []).map((m) => `${m.role}: ${m.content}`).join("\n");
  return [
    "Du bist Slide Writing, ein deutscher PowerPoint-Konzeptarchitekt.",
    "Arbeite streng JSON-first und antworte nur mit einem JSON-Objekt.",
    "Ziel: neue Slides im Stil des hochgeladenen Decks planen.",
    "Erlaubte Slide-Typen: title, section, bullets, agenda, kpi, table, waterfall, bars, timeline, comparison, blank, process, gantt, pie.",
    'Erzeuge ein JSON im Format {"reply": string, "spec": {"title": string, "author": string, "slides": [...]}}.',
    "Keine Markdown-Backticks.", "Deck summary:", JSON.stringify(body.analysis || {}),
    "Deep deck analysis:", JSON.stringify(body.deep_analysis || {}),
    "Bisherige Unterhaltung:", messages || "(leer)", "Aktueller Nutzerwunsch:", body.message || "",
    "Vorhandene draft_spec weiterentwickeln:", JSON.stringify(body.draft_spec || {}),
  ].join("\n");
}
async function callGemini(prompt: string, apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, responseMimeType: "application/json" } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Gemini error ${response.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
  if (!text) throw new Error("Gemini returned no text payload.");
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const user = await getUser(req);
  if (!user) return json(req, { error: "Nicht angemeldet oder Session abgelaufen." }, 401);
  let body: Payload;
  try { body = await req.json(); validatePayload(body); }
  catch (error) { return json(req, { error: error instanceof Error ? error.message : "Invalid JSON body" }, 400); }
  const action = body.action || "chat";
  if (action === "settings_status") {
    const { data, error } = await adminClient().rpc("slide_writing_ai_key_configured");
    return error ? json(req, { error: error.message }, 500) : json(req, { configured: Boolean(data) });
  }
  if (action === "save_api_key") {
    if (!(await isAdmin(user.id))) return json(req, { error: "Nur Admins dürfen den API-Schlüssel setzen." }, 403);
    const key = String(body.api_key_value ?? "").trim();
    if (key.length < 20 || key.length > 256 || /\s/.test(key)) return json(req, { error: "Ungültiger API-Schlüssel." }, 400);
    const { error } = await adminClient().rpc("slide_writing_upsert_ai_key", { p_api_key: key });
    return error ? json(req, { error: error.message }, 500) : json(req, { ok: true, configured: true });
  }
  if (action !== "chat") return json(req, { error: "Unsupported action" }, 400);
  const key = await getGeminiKey();
  if (!key) return json(req, { error: "Kein Gemini API-Schlüssel konfiguriert." }, 500);
  try { return json(req, await callGemini(buildPrompt(body), key)); }
  catch (error) { return json(req, { error: error instanceof Error ? error.message : String(error) }, 500); }
});
