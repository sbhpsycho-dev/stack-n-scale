/**
 * Patches Make.com scenario 4965153 (Fanbasis Payment → Onboarding) to add
 * the x-webhook-secret header to the HTTP module that calls /api/webhooks/fanbasis.
 *
 * Generates a secure secret if FANBASIS_WEBHOOK_SECRET is not already set in .env.local.
 * Prints the value to set in FANBASIS_WEBHOOK_SECRET in your env files.
 *
 * Run: node scripts/fix-fanbasis-scenario.mjs
 */

import { readFileSync } from "fs";
import { randomBytes } from "crypto";

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
  console.warn("Could not read .env.local — using generated secret\n");
}

const TOKEN       = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const BASE        = "https://us2.make.com/api/v2";
const SCENARIO_ID = 4965153;

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

// ─── Determine secret value ───────────────────────────────────────────────────
const existingSecret =
  process.env.FANBASIS_WEBHOOK_SECRET ||
  envLocal.FANBASIS_WEBHOOK_SECRET ||
  "";

const SECRET = existingSecret && !existingSecret.startsWith("YOUR_")
  ? existingSecret
  : randomBytes(32).toString("hex");

if (existingSecret && existingSecret === SECRET) {
  console.log(`Using existing FANBASIS_WEBHOOK_SECRET from .env.local`);
} else {
  console.log(`Generated new secret: ${SECRET}`);
}

// ─── Step 1: Fetch current blueprint ─────────────────────────────────────────
console.log(`\nFetching blueprint for scenario ${SCENARIO_ID}…`);
const bpData      = await api("GET", `/scenarios/${SCENARIO_ID}/blueprint`);
const blueprintRaw = bpData.response?.blueprint;

if (!blueprintRaw) {
  throw new Error("No blueprint found. Cannot patch.");
}

const blueprint = typeof blueprintRaw === "string" ? JSON.parse(blueprintRaw) : blueprintRaw;

// ─── Step 2: Find and patch the fanbasis HTTP module ─────────────────────────
function patchFanbasisModule(flow) {
  for (const m of (flow ?? [])) {
    if ((m?.mapper?.url ?? "").includes("fanbasis")) {
      const headerList = m.mapper.headers ?? [];
      const existingIdx = headerList.findIndex(
        h => h.name?.toLowerCase() === "x-webhook-secret"
      );
      if (existingIdx >= 0) {
        console.log(`  Module ${m.id}: updating existing x-webhook-secret header`);
        headerList[existingIdx].value = SECRET;
      } else {
        console.log(`  Module ${m.id}: adding x-webhook-secret header`);
        headerList.push({ name: "x-webhook-secret", value: SECRET });
      }
      m.mapper.headers = headerList;
      return true;
    }
    // Check nested routes (BasicRouter)
    for (const route of (m?.routes ?? [])) {
      if (patchFanbasisModule(route?.flow)) return true;
    }
  }
  return false;
}

const patched = patchFanbasisModule(blueprint.flow);
if (!patched) {
  console.error("Could not find the fanbasis HTTP module. Check the scenario structure.");
  process.exit(1);
}

// ─── Step 3: Push patched blueprint ──────────────────────────────────────────
console.log("Pushing patched blueprint to Make.com…");
await api("PATCH", `/scenarios/${SCENARIO_ID}`, {
  blueprint: JSON.stringify(blueprint),
});
console.log("  Blueprint updated ✓");

// ─── Done — print instructions ────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("✅  Fanbasis scenario patched!");
console.log("=".repeat(60));
console.log();
console.log("Now add this to .env.local and .env.prod:");
console.log(`  FANBASIS_WEBHOOK_SECRET="${SECRET}"`);
console.log();
console.log("Then push to Vercel:");
console.log("  vercel env push .env.prod --environment=production");
console.log("  vercel --prod");
console.log();
console.log(`View scenario: https://us1.make.com/4/scenarios/${SCENARIO_ID}/edit`);
console.log("=".repeat(60));
