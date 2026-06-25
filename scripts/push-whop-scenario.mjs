/**
 * Push the finalized Whop scenario into Make.com via the REST API.
 *
 * Usage (key passed inline, never written to disk):
 *   MAKE_API_KEY="<token>" node scripts/push-whop-scenario.mjs
 *
 * Optional overrides (otherwise auto-detected from the key):
 *   MAKE_REGION=us1|us2|eu1|eu2   MAKE_TEAM_ID=12345
 *
 * What it does: detect region → find your team → create a custom webhook →
 * inject its id into make-blueprints/whop-payment.json → create the scenario.
 * The scenario imports as a DRAFT — you still connect Google/Gmail, fill the
 * Discord URLs + secrets, point Whop at the webhook, and switch it ON (see WHOP-GOLIVE.md).
 */

import { readFileSync } from "node:fs";

const KEY = process.env.MAKE_API_KEY;
if (!KEY) {
  console.error("❌ MAKE_API_KEY not set. Run: MAKE_API_KEY=\"<token>\" node scripts/push-whop-scenario.mjs");
  process.exit(1);
}
const FORCE_REGION = process.env.MAKE_REGION;
const FORCE_TEAM = process.env.MAKE_TEAM_ID;
const BLUEPRINT_PATH = process.env.MAKE_BLUEPRINT ?? "make-blueprints/whop-payment.json";
const HOOK_NAME = process.env.MAKE_HOOK_NAME ?? "Whop Payment";

async function api(region, method, path, body) {
  const res = await fetch(`https://${region}.make.com/api/v2${path}`, {
    method,
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

// ── 1. Detect region (Make tokens are zone-scoped: the right zone returns 200) ──
let region = FORCE_REGION;
if (!region) {
  for (const r of ["us2", "us1", "eu1", "eu2"]) {
    process.stdout.write(`  probing ${r}… `);
    const me = await api(r, "GET", "/users/me").catch(() => ({ ok: false }));
    console.log(me.ok ? "✅" : `(${me.status ?? "no"})`);
    if (me.ok) { region = r; break; }
  }
  if (!region) {
    console.error("❌ Could not authenticate in any region — the API key looks invalid/expired.");
    process.exit(1);
  }
}
console.log(`\nRegion: ${region}`);

// ── 2. Resolve team id ─────────────────────────────────────────────────────────
let teamId = FORCE_TEAM;
if (!teamId) {
  const orgs = await api(region, "GET", "/organizations");
  const orgList = orgs.json?.organizations ?? [];
  const teams = [];
  for (const org of orgList) {
    const t = await api(region, "GET", `/teams?organizationId=${org.id}`);
    for (const tm of (t.json?.teams ?? [])) teams.push({ id: tm.id, name: tm.name, org: org.name });
  }
  if (teams.length === 1) {
    teamId = teams[0].id;
    console.log(`Team: ${teamId} (${teams[0].name})`);
  } else if (teams.length === 0) {
    console.error("❌ No teams found for this key. Raw /organizations:", JSON.stringify(orgs.json));
    process.exit(1);
  } else {
    console.error("⚠️  Multiple teams found — re-run with MAKE_TEAM_ID set to one of:");
    console.error(JSON.stringify(teams, null, 2));
    process.exit(1);
  }
} else {
  console.log(`Team: ${teamId} (from MAKE_TEAM_ID)`);
}

// ── 3. Create the custom webhook (or reuse one via MAKE_HOOK_ID) ───────────────
let hookId, hookUrl;
if (process.env.MAKE_HOOK_ID) {
  hookId = Number(process.env.MAKE_HOOK_ID);
  const got = await api(region, "GET", `/hooks/${hookId}`);
  hookUrl = got.json?.hook?.url ?? got.json?.hook?.address ?? "(existing hook)";
  console.log(`Hook: ${hookId} (reused) → ${hookUrl}`);
} else {
  const hookRes = await api(region, "POST", "/hooks", {
    name: HOOK_NAME,
    teamId: Number(teamId),
    typeName: "gateway-webhook",
    method: false,    // don't require HTTP method tracking
    headers: false,   // don't capture request headers
    stringify: false, // parse incoming JSON (don't keep as raw string)
  });
  if (!hookRes.ok) {
    console.error("❌ createHook failed:", hookRes.status, JSON.stringify(hookRes.json));
    process.exit(1);
  }
  const hook = hookRes.json.hook ?? hookRes.json;
  hookId = hook.id;
  hookUrl = hook.url ?? hook.address;
  console.log(`Hook: ${hookId} → ${hookUrl}`);
}

// ── 4. Load blueprint, inject hook id + region, create the scenario ────────────
const bp = JSON.parse(readFileSync(BLUEPRINT_PATH, "utf8"));
bp.flow[0].parameters.hook = hookId;
if (bp.metadata) bp.metadata.zone = `${region}.make.com`;

const UPDATE_ID = process.env.MAKE_SCENARIO_ID;
let scenarioRes;
if (UPDATE_ID) {
  // Update the existing scenario's blueprint in place (keeps the same hook + URL).
  scenarioRes = await api(region, "PATCH", `/scenarios/${UPDATE_ID}`, {
    blueprint: JSON.stringify(bp),
  });
} else {
  scenarioRes = await api(region, "POST", "/scenarios", {
    name: bp.name ?? "SNS — Whop Payment → Client Onboarding",
    teamId: Number(teamId),
    blueprint: JSON.stringify(bp),
    scheduling: JSON.stringify({ type: "indefinitely", interval: 900 }),
  });
}
if (!scenarioRes.ok) {
  console.error(`\n❌ ${UPDATE_ID ? "updateScenario" : "createScenario"} failed:`, scenarioRes.status);
  console.error(JSON.stringify(scenarioRes.json, null, 2));
  console.error("\nIf this is a connection/blueprint validation error, fall back to UI import:");
  console.error("  Make → open the scenario → ⋯ → Import Blueprint → upload make-blueprints/whop-payment.json");
  process.exit(1);
}
const scenarioId = scenarioRes.json.scenario?.id ?? scenarioRes.json.id ?? UPDATE_ID;

console.log(`\n✅ Scenario created: ${scenarioId}`);
console.log(`   Edit it: https://${region}.make.com/${teamId}/scenarios/${scenarioId}/edit`);
console.log(`   Whop webhook URL: ${hookUrl}`);
console.log(`\nNext (manual — see make-blueprints/WHOP-GOLIVE.md):`);
console.log(`  1. Open the scenario → connect Google Drive (modules 2–5) + Gmail (modules 7, 11).`);
console.log(`  2. Module 6 header x-webhook-secret = your WHOP_WEBHOOK_SECRET; module 2 parent = Drive clients root folder ID.`);
console.log(`  3. Paste the 3 Discord webhook URLs into modules 8–10.`);
console.log(`  4. In Whop, point the payment-succeeded webhook at: ${hookUrl}`);
console.log(`  5. Toggle the scenario ON.`);
