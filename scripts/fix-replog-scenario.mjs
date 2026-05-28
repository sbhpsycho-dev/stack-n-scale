/**
 * Patches Make.com scenario 5160981 (Rep Daily Log) to replace the Discord
 * placeholder URL with the real #boiler-room webhook, then reactivates it.
 *
 * Requirements:
 *   Set DISCORD_WEBHOOK_BOILER_ROOM in .env.local BEFORE running.
 *   Get it from: Discord → #boiler-room → Edit Channel → Integrations → Webhooks
 *   The URL format is: https://discord.com/api/webhooks/...
 *
 * Run: node scripts/fix-replog-scenario.mjs
 */

import { readFileSync } from "fs";

// Load .env.local
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
  console.warn("Could not read .env.local — using process.env only\n");
}

function env(key) {
  return process.env[key] || envLocal[key] || "";
}

const DISCORD_WEBHOOK_URL = env("DISCORD_WEBHOOK_BOILER_ROOM") || process.argv[2];

if (!DISCORD_WEBHOOK_URL) {
  console.error("❌  DISCORD_WEBHOOK_BOILER_ROOM is not set.\n");
  console.error("Get the webhook URL from:");
  console.error("  Discord → right-click #boiler-room → Edit Channel → Integrations → Webhooks");
  console.error("  The URL starts with: https://discord.com/api/webhooks/...\n");
  console.error("Then add it to .env.local:");
  console.error("  DISCORD_WEBHOOK_BOILER_ROOM=\"https://discord.com/api/webhooks/...\"\n");
  console.error("Or pass it as a CLI argument:");
  console.error("  node scripts/fix-replog-scenario.mjs https://discord.com/api/webhooks/...\n");
  process.exit(1);
}

if (!DISCORD_WEBHOOK_URL.startsWith("https://discord.com/api/webhooks/")) {
  console.error("❌  That doesn't look like a Discord webhook URL.");
  console.error(`   Got: ${DISCORD_WEBHOOK_URL}`);
  console.error("   Expected format: https://discord.com/api/webhooks/{id}/{token}");
  console.error("\n   A Discord channel link (discord.com/channels/...) won't work here.");
  console.error("   Go to: Edit Channel → Integrations → Webhooks → copy the webhook URL.\n");
  process.exit(1);
}

const TOKEN       = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const BASE        = "https://us2.make.com/api/v2";
const SCENARIO_ID = 5160981;
const PLACEHOLDER = "REPLACE_WITH_BOILER_ROOM_DISCORD_WEBHOOK_URL";

const headers = { "Authorization": `Token ${TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Make.com API ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// ─── Step 1: Fetch current blueprint ─────────────────────────────────────────
console.log(`Fetching blueprint for scenario ${SCENARIO_ID}…`);
const data        = await api("GET", `/scenarios/${SCENARIO_ID}/blueprint`);
const blueprintRaw = data.response?.blueprint;

if (!blueprintRaw) {
  throw new Error("No blueprint found in blueprint response. Cannot patch.");
}

const blueprint = typeof blueprintRaw === "string" ? JSON.parse(blueprintRaw) : blueprintRaw;

// ─── Step 2: Find and patch the Discord module ────────────────────────────────
let patched = false;
for (const module of (blueprint.flow ?? [])) {
  if (module?.mapper?.url === PLACEHOLDER) {
    console.log(`  Found placeholder in module ${module.id} — patching with real Discord URL…`);
    module.mapper.url = DISCORD_WEBHOOK_URL;
    patched = true;
  }
}

if (!patched) {
  // Also search in nested routes (BasicRouter modules)
  for (const module of (blueprint.flow ?? [])) {
    for (const route of (module?.routes ?? [])) {
      for (const m of (route?.flow ?? [])) {
        if (m?.mapper?.url === PLACEHOLDER) {
          console.log(`  Found placeholder in nested module ${m.id} — patching…`);
          m.mapper.url = DISCORD_WEBHOOK_URL;
          patched = true;
        }
      }
    }
  }
}

if (!patched) {
  console.warn(`⚠️  Placeholder "${PLACEHOLDER}" not found in blueprint.`);
  console.warn("   The scenario may already have been patched, or the structure changed.");
  console.warn("   Current Discord module URLs:");
  for (const module of (blueprint.flow ?? [])) {
    if (module?.mapper?.url?.includes("discord")) {
      console.warn(`     Module ${module.id}: ${module.mapper.url}`);
    }
  }
  process.exit(0);
}

// ─── Step 3: Push patched blueprint ──────────────────────────────────────────
console.log("Pushing patched blueprint to Make.com…");
await api("PATCH", `/scenarios/${SCENARIO_ID}`, {
  blueprint: JSON.stringify(blueprint),
});
console.log("  Blueprint updated ✓");

// ─── Step 4: Activate the scenario ───────────────────────────────────────────
console.log("Activating scenario…");
try {
  await api("POST", `/scenarios/${SCENARIO_ID}/start`, {});
  console.log("  Scenario activated ✓");
} catch (err) {
  console.warn(`  Could not auto-activate: ${err.message}`);
  console.warn("  Open Make.com and enable it manually if needed.");
}

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log();
console.log(`✅  Done! Scenario ${SCENARIO_ID} patched and activated.`);
console.log(`   View: https://us2.make.com/4/scenarios/${SCENARIO_ID}/edit`);
console.log();
console.log("Next: submit a test rep log in the dashboard and check Discord #boiler-room.");
