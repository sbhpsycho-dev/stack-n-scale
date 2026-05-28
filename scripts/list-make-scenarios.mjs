/**
 * Lists all Make.com scenarios for this team and shows their webhook URLs.
 * Run: node scripts/list-make-scenarios.mjs
 *
 * Output tells you exactly which env var to set for each scenario.
 */

const TOKEN       = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const BASE        = "https://us2.make.com/api/v2";
const EXISTING_ID = 4869898; // email router — used to discover teamId

const headers = { "Authorization": `Token ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, path) {
  const res = await fetch(`${BASE}${path}`, { method, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Make.com API ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// Known scenario name → env var mapping
const NAME_TO_ENV = {
  "discord-link-email":                           "MAKE_EMAIL_WEBHOOK_URL",
  "discord_link_email":                           "MAKE_EMAIL_WEBHOOK_URL",
  "email":                                        "MAKE_EMAIL_WEBHOOK_URL",
  "fanbasis-payment":                             "MAKE_CAMPAIGN_WEBHOOK_URL",
  "fanbasis_payment":                             "MAKE_CAMPAIGN_WEBHOOK_URL",
  "campaign":                                     "MAKE_CAMPAIGN_WEBHOOK_URL",
  "drive-docs":                                   "MAKE_DRIVE_DOCS_WEBHOOK_URL",
  "drive_docs":                                   "MAKE_DRIVE_DOCS_WEBHOOK_URL",
  "form":                                         "MAKE_DRIVE_DOCS_WEBHOOK_URL",
  "sms":                                          "MAKE_SMS_WEBHOOK_URL",
  "replog":                                       "MAKE_REPLOG_WEBHOOK_URL",
  "rep daily log":                                "MAKE_REPLOG_WEBHOOK_URL",
  "rep_daily_log":                                "MAKE_REPLOG_WEBHOOK_URL",
  "deal":                                         "MAKE_DEAL_WEBHOOK_URL",
  "ghl-opportunity":                              "MAKE_DEAL_WEBHOOK_URL",
  "ghl_opportunity":                              "MAKE_DEAL_WEBHOOK_URL",
};

function guessEnvVar(scenarioName) {
  const lower = scenarioName.toLowerCase();
  for (const [key, envVar] of Object.entries(NAME_TO_ENV)) {
    if (lower.includes(key)) return envVar;
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("Fetching team ID from existing scenario…");
const existing = await api("GET", `/scenarios/${EXISTING_ID}`);
const teamId   = existing.scenario?.teamId;
if (!teamId) throw new Error("Could not find teamId in scenario response");
console.log(`Team ID: ${teamId}\n`);

// Fetch all scenarios
console.log("Fetching all scenarios…");
const scenariosRes = await api("GET", `/scenarios?teamId=${teamId}&pg[limit]=100`);
const scenarios    = scenariosRes.scenarios ?? [];
console.log(`Found ${scenarios.length} scenario(s)\n`);

// Fetch all hooks
console.log("Fetching all webhooks…");
const hooksRes = await api("GET", `/hooks?teamId=${teamId}`);
const hooks    = hooksRes.hooks ?? [];

// Build hookId → url map
const hookUrlMap = {};
for (const hook of hooks) {
  if (hook.id && hook.url) hookUrlMap[hook.id] = hook.url;
}

// ─── Fetch individual scenario blueprints to get hook IDs ────────────────────
// The list API doesn't return blueprints, so we fetch each scenario individually
// to extract the webhook hook ID, then look it up in hookUrlMap.
console.log("Fetching blueprints for webhook-triggered scenarios…");

const found = {}; // envVar → url

for (const s of scenarios) {
  let hookUrl   = null;
  let hookFound = false;
  try {
    const detail = await api("GET", `/scenarios/${s.id}`);
    const bp     = detail.scenario?.blueprint;
    const flow   = bp ? (typeof bp === "string" ? JSON.parse(bp) : bp) : null;
    const first  = flow?.flow?.[0] ?? flow?.[0];
    if (first?.module === "gateway:CustomWebHook") {
      const hookId = first?.parameters?.hook;
      if (hookId && hookUrlMap[hookId]) {
        hookUrl   = hookUrlMap[hookId];
        hookFound = true;
        const envVar = guessEnvVar(s.name ?? "");
        if (envVar && !found[envVar]) found[envVar] = hookUrl;
      } else {
        hookUrl = `WEBHOOK (hook ID: ${hookId ?? "unknown"}) — not in hooks list`;
        hookFound = true;
      }
    }
  } catch {
    // individual fetch failed — skip
  }
  s._hookUrl   = hookFound ? hookUrl : null;
  s._hasWebhook = hookFound;
}

// ─── Print table ──────────────────────────────────────────────────────────────
console.log();
console.log("─".repeat(120));
console.log(
  "ID".padEnd(12) +
  "Active".padEnd(9) +
  "Name".padEnd(55) +
  "Webhook URL"
);
console.log("─".repeat(120));

for (const s of scenarios) {
  const id     = String(s.id ?? "").padEnd(12);
  const active = (s.isPaused === false ? "YES" : s.isPaused === true ? "NO" : "?").padEnd(9);
  const name   = (s.name ?? "").slice(0, 54).padEnd(55);
  const url    = s._hasWebhook ? (s._hookUrl ?? "???") : "— (polling/Stripe/Sheets trigger)";
  console.log(id + active + name + url);
}

console.log("─".repeat(120));
console.log();

// ─── Also print raw hooks list ────────────────────────────────────────────────
if (hooks.length) {
  console.log("All hooks (webhook URLs) in this team:");
  console.log("─".repeat(90));
  console.log("Hook ID".padEnd(14) + "Name".padEnd(50) + "URL");
  console.log("─".repeat(90));
  for (const h of hooks) {
    console.log(String(h.id ?? "").padEnd(14) + (h.name ?? "").slice(0, 49).padEnd(50) + (h.url ?? ""));
  }
  console.log("─".repeat(90));
  console.log();
}

// ─── Name-based hook matching (fallback when blueprint fetch doesn't work) ────
// Map hook names → env vars by keyword matching
const HOOK_NAME_TO_ENV = {
  "rep daily log":  "MAKE_REPLOG_WEBHOOK_URL",
  "replog":         "MAKE_REPLOG_WEBHOOK_URL",
  "email hook":     "MAKE_EMAIL_WEBHOOK_URL",
  "email router":   "MAKE_EMAIL_WEBHOOK_URL",
  "drive docs":     "MAKE_DRIVE_DOCS_WEBHOOK_URL",
  "campaign hook":  "MAKE_CAMPAIGN_WEBHOOK_URL",
  "campaign":       "MAKE_CAMPAIGN_WEBHOOK_URL",
  "sms hook":       "MAKE_SMS_WEBHOOK_URL",
  "deal":           "MAKE_DEAL_WEBHOOK_URL",
  "discord email":  "MAKE_EMAIL_WEBHOOK_URL",
};

for (const hook of hooks) {
  if (!hook.name || !hook.url) continue;
  const lower = hook.name.toLowerCase();
  for (const [key, envVar] of Object.entries(HOOK_NAME_TO_ENV)) {
    if (lower.includes(key) && !found[envVar]) {
      found[envVar] = hook.url;
      break;
    }
  }
}

// ─── What to set where ────────────────────────────────────────────────────────
console.log("━".repeat(80));
console.log("WHAT TO SET IN YOUR .env FILES");
console.log("━".repeat(80));

const ALL_VARS = [
  "MAKE_EMAIL_WEBHOOK_URL",
  "MAKE_CAMPAIGN_WEBHOOK_URL",
  "MAKE_DRIVE_DOCS_WEBHOOK_URL",
  "MAKE_SMS_WEBHOOK_URL",
  "MAKE_REPLOG_WEBHOOK_URL",
  "MAKE_DEAL_WEBHOOK_URL",
];

for (const envVar of ALL_VARS) {
  if (found[envVar]) {
    console.log(`✅ ${envVar}`);
    console.log(`   ${found[envVar]}`);
  } else {
    console.log(`❌ ${envVar}`);
    console.log(`   Not found — scenario may not exist yet. Import the matching blueprint in make-blueprints/.`);
  }
  console.log();
}

console.log("━".repeat(80));
console.log("NOTE: SHEETS_WEBHOOK_SECRET is not a Make.com URL — it is a static secret.");
console.log("Value: 97b88badbfe6465a86b2621d942e8c0b9e942c31e0d0cbb8459c46d113e8497e");
console.log("Set this in .env.local, .env.prod, and in Vercel env vars.");
console.log("━".repeat(80));
