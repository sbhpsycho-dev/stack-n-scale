/**
 * Creates and activates the SNS Rep Daily Log scenario on Make.com.
 * Prints the generated webhook URL to set as MAKE_REPLOG_WEBHOOK_URL in Vercel.
 *
 * Usage (pick one):
 *   DISCORD_WEBHOOK_BOILER_ROOM=https://discord.com/api/webhooks/... node scripts/create_replog_webhook.mjs
 *   node scripts/create_replog_webhook.mjs https://discord.com/api/webhooks/...
 *   (or set DISCORD_WEBHOOK_BOILER_ROOM= in .env.local)
 *
 * Get the Discord webhook URL from:
 *   Discord → channel settings → Integrations → Webhooks → #boiler-room
 */

import { readFileSync } from "fs";

// Load .env.local so DISCORD_WEBHOOK_BOILER_ROOM can be set there
let envLocal = {};
try {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
  envLocal = Object.fromEntries(
    raw
      .split("\n")
      .filter(l => l.includes("=") && !l.trimStart().startsWith("#"))
      .map(l => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      })
  );
} catch {
  // .env.local not found — that's fine, we'll check process.env and argv
}

const TOKEN       = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const BASE        = "https://us2.make.com/api/v2";
const EXISTING_ID = 4869898; // email router — used to discover teamId

const APP_URL       = "https://stack-n-scale.vercel.app";
const SHEETS_SECRET = "97b88badbfe6465a86b2621d942e8c0b9e942c31e0d0cbb8459c46d113e8497e";

// Discord webhook URL for #boiler-room
// Set DISCORD_WEBHOOK_BOILER_ROOM in .env.local or pass as the first CLI argument
const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_BOILER_ROOM ||
  envLocal.DISCORD_WEBHOOK_BOILER_ROOM ||
  process.argv[2] ||
  (() => {
    console.error("\n❌  Discord boiler-room webhook URL is required.\n");
    console.error("Get it from: Discord → #boiler-room → Edit Channel → Integrations → Webhooks\n");
    console.error("Then run one of:");
    console.error("  DISCORD_WEBHOOK_BOILER_ROOM=https://discord.com/api/webhooks/... node scripts/create_replog_webhook.mjs");
    console.error("  node scripts/create_replog_webhook.mjs https://discord.com/api/webhooks/...");
    console.error("  (or set DISCORD_WEBHOOK_BOILER_ROOM= in .env.local)\n");
    process.exit(1);
  })();

const headers = { "Authorization": `Token ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Make.com API ${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

// ─── Step 1: discover teamId from existing scenario ──────────────────────────
console.log("1. Fetching existing scenario to get teamId…");
const existing = await api("GET", `/scenarios/${EXISTING_ID}`);
const teamId   = existing.scenario?.teamId;
if (!teamId) throw new Error("Could not find teamId in existing scenario response");
console.log(`   teamId = ${teamId}`);

// ─── Step 2: create the webhook hook first ────────────────────────────────────
console.log("2. Creating webhook hook…");
const hookCreate = await api("POST", "/hooks", {
  name:     "SNS Rep Daily Log Webhook",
  teamId,
  typeName: "gateway-webhook",
  headers:   false,
  method:    false,
  stringify: false,
});
const hookId  = hookCreate.hook?.id;
const hookUrl = hookCreate.hook?.url;
if (!hookId || !hookUrl) throw new Error(`Hook creation failed: ${JSON.stringify(hookCreate).slice(0, 400)}`);
console.log(`   Hook ID:  ${hookId}`);
console.log(`   Hook URL: ${hookUrl}`);

// ─── Step 3: build the blueprint using the real hook ID ───────────────────────
const blueprint = {
  name: "SNS — Rep Daily Log → Discord + Dashboard Refresh",
  flow: [
    {
      id: 1,
      module: "gateway:CustomWebHook",
      version: 1,
      parameters: { hook: hookId, maxResults: 1 },
      mapper: {},
      metadata: {
        designer: { x: 0, y: 0 },
        restore: {
          parameters: {
            hook: { data: { editable: "true" }, label: "SNS Rep Daily Log Webhook" }
          }
        },
        interface: [
          { name: "staffName",  type: "text" },
          { name: "entry",      type: "collection" },
          { name: "timestamp",  type: "text" },
        ],
        parameters: [
          { name: "hook",       type: "hook:gateway-webhook", label: "Webhook", required: true },
          { name: "maxResults", type: "number",               label: "Maximum number of results" },
        ],
      },
    },
    {
      id: 2,
      module: "http:ActionSendData",
      version: 3,
      parameters: { handleErrors: false, useNewZLibDeflate: true },
      mapper: {
        url:              DISCORD_WEBHOOK_URL,
        method:           "post",
        headers:          [{ name: "Content-Type", value: "application/json" }],
        qs:               [],
        bodyType:         "raw",
        contentType:      "application/json",
        data:             '{"content":"📊 **{{1.staffName}}** logged numbers for {{1.entry.date}}\\n> Calls: {{1.entry.callsMade}} dialed / {{1.entry.callsAnswered}} answered\\n> Demos: {{1.entry.demosSet}} set / {{1.entry.demosShowed}} showed\\n> Closed: {{1.entry.closed}} | 💰 ${{1.entry.cashCollected}}"}',
        parseResponse:    false,
        rejectUnauthorized: true,
        followRedirect:   true,
        gzip:             true,
      },
      metadata: { designer: { x: 300, y: 0 } },
    },
    {
      id: 3,
      module: "http:ActionSendData",
      version: 3,
      parameters: { handleErrors: false, useNewZLibDeflate: true },
      mapper: {
        url:    `${APP_URL}/api/webhooks/sheets-update`,
        method: "post",
        headers: [
          { name: "Content-Type",    value: "application/json" },
          { name: "x-sheets-secret", value: SHEETS_SECRET },
        ],
        qs:               [],
        bodyType:         "raw",
        contentType:      "application/json",
        data:             "{{toJSON(1)}}",
        parseResponse:    false,
        rejectUnauthorized: true,
        followRedirect:   true,
        gzip:             true,
      },
      metadata: { designer: { x: 600, y: 0 } },
    },
  ],
  metadata: {
    instant: true,
    version: 1,
    scenario: {
      roundtrips: 1, maxErrors: 3, autoCommit: true,
      autoCommitTriggerLast: true, sequential: false,
      confidential: false, dataloss: false, dlq: false, freshVariables: false,
    },
    designer: { orphans: [] },
    zone: "us2.make.com",
  },
};

// ─── Step 4: create the scenario ─────────────────────────────────────────────
console.log("3. Creating scenario…");
const created = await api("POST", "/scenarios", {
  blueprint:  JSON.stringify(blueprint),
  teamId,
  scheduling: JSON.stringify({ type: "indefinitely", interval: 900 }),
});

const scenarioId = created.scenario?.id;
if (!scenarioId) throw new Error(`Scenario creation failed: ${JSON.stringify(created).slice(0, 400)}`);
console.log(`   Scenario ID: ${scenarioId}`);

// ─── Step 5: activate the scenario ───────────────────────────────────────────
console.log("4. Activating scenario…");
await api("POST", `/scenarios/${scenarioId}/start`, {});
console.log("   Scenario is now active ✅");

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log("\n✅ Done! Add this to Vercel:\n");
console.log(`   MAKE_REPLOG_WEBHOOK_URL = ${hookUrl}`);
console.log("\nThen run: vercel --prod\n");
console.log(`Make.com scenario URL: https://us2.make.com/4/scenarios/${scenarioId}/edit`);
