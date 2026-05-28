/**
 * Fetches the live Make.com fanbasis payment scenario (4965153) and prints
 * the x-webhook-secret value it sends to /api/webhooks/fanbasis.
 *
 * Set the printed value as FANBASIS_WEBHOOK_SECRET in .env.local and .env.prod.
 *
 * Run: node scripts/get-fanbasis-secret.mjs
 */

const TOKEN       = "8b0d2a1a-a0ab-49c9-818e-ba1d0ad7d32a";
const BASE        = "https://us2.make.com/api/v2";
const SCENARIO_ID = 4965153;
const TARGET_URL  = "/api/webhooks/fanbasis";

const headers = { "Authorization": `Token ${TOKEN}`, "Content-Type": "application/json" };

const res  = await fetch(`${BASE}/scenarios/${SCENARIO_ID}`, { headers });
const text = await res.text();
if (!res.ok) throw new Error(`Make.com API → ${res.status}: ${text.slice(0, 400)}`);
const data = JSON.parse(text);

const blueprintRaw = data.scenario?.blueprint;
if (!blueprintRaw) throw new Error("No blueprint in response.");
const blueprint = typeof blueprintRaw === "string" ? JSON.parse(blueprintRaw) : blueprintRaw;

// Search all modules (including nested routes) for HTTP calls to fanbasis
function findFanbasisModule(flow) {
  for (const module of (flow ?? [])) {
    const url = module?.mapper?.url ?? "";
    if (url.includes("fanbasis") || url.includes(TARGET_URL)) {
      return module;
    }
    // Check nested routes (BasicRouter)
    for (const route of (module?.routes ?? [])) {
      const found = findFanbasisModule(route?.flow);
      if (found) return found;
    }
  }
  return null;
}

const fanbasisModule = findFanbasisModule(blueprint.flow);

if (!fanbasisModule) {
  console.error("Could not find the fanbasis HTTP module in the blueprint.");
  console.log("\nAll HTTP modules in this scenario:");
  function printHttpModules(flow, indent = "") {
    for (const m of (flow ?? [])) {
      if (m?.module?.startsWith("http:")) {
        console.log(`${indent}Module ${m.id}: ${m.mapper?.url}`);
      }
      for (const r of (m?.routes ?? [])) printHttpModules(r?.flow, indent + "  ");
    }
  }
  printHttpModules(blueprint.flow);
  process.exit(1);
}

// Find x-webhook-secret header
const secretHeader = (fanbasisModule.mapper?.headers ?? []).find(
  h => h.name?.toLowerCase() === "x-webhook-secret"
);

console.log("=".repeat(60));
console.log("Fanbasis Scenario — Webhook Secret");
console.log("=".repeat(60));
console.log();

if (secretHeader?.value) {
  console.log(`x-webhook-secret: "${secretHeader.value}"`);
  console.log();
  console.log("Add this to .env.local and .env.prod:");
  console.log(`  FANBASIS_WEBHOOK_SECRET="${secretHeader.value}"`);
  console.log();

  if (secretHeader.value.startsWith("YOUR_")) {
    console.log("⚠️  This is still a placeholder value.");
    console.log("   The scenario was never fully configured.");
    console.log("   You need to:");
    console.log("   1. Choose a secret (e.g. generate one: openssl rand -hex 32)");
    console.log("   2. Update module 6 in Make.com scenario 4965153 with that secret");
    console.log("   3. Set FANBASIS_WEBHOOK_SECRET to the same value in .env.local/.env.prod");
  }
} else {
  console.log("No x-webhook-secret header found in the fanbasis module.");
  console.log("Headers present:");
  for (const h of (fanbasisModule.mapper?.headers ?? [])) {
    console.log(`  ${h.name}: ${h.value}`);
  }
}

console.log("=".repeat(60));
