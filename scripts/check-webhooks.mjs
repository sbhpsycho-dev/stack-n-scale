/**
 * Tests all configured Make.com webhook URLs by sending a sample POST.
 * Run: node scripts/check-webhooks.mjs
 *
 * PASS = 2xx response
 * FAIL = non-2xx or network error
 * SKIP = env var empty or not set
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
  console.warn("Could not read .env.local — falling back to process.env only\n");
}

function env(key) {
  return process.env[key] || envLocal[key] || "";
}

const TODAY = new Date().toISOString().slice(0, 10);
const TS    = new Date().toISOString();

// Webhook registry — name, env var, description, and exact test payload per integration
const WEBHOOKS = [
  {
    name:        "MAKE_EMAIL_WEBHOOK_URL",
    description: "Outbound email router (discord-link-email / welcome email scenario)",
    payload:     { type: "welcome", to: "test-check@example.com", name: "Webhook Check" },
  },
  {
    name:        "MAKE_CAMPAIGN_WEBHOOK_URL",
    description: "Campaign trigger on new payment (fanbasis-payment scenario)",
    payload:     { email: "test-check@example.com", name: "Webhook Check", amount: 0, source: "stripe" },
  },
  {
    name:        "MAKE_DRIVE_DOCS_WEBHOOK_URL",
    description: "Drive doc creation on form/ID submission (drive-docs scenario)",
    payload:     { type: "form_received", to: "test-check@example.com", name: "Webhook Check" },
  },
  {
    name:        "MAKE_SMS_WEBHOOK_URL",
    description: "SMS via Make.com (checkin + followup routes)",
    payload:     { type: "checkin_positive", name: "Webhook Check", firstName: "Check", score: 9, message: "test ping" },
  },
  {
    name:        "MAKE_REPLOG_WEBHOOK_URL",
    description: "Rep daily log → Discord + dashboard refresh (replog-submission scenario)",
    payload:     {
      staffName: "CheckBot",
      entry: { date: TODAY, callsMade: 0, callsAnswered: 0, demosSet: 0, demosShowed: 0, pitched: 0, closed: 0, cashCollected: 0 },
      timestamp: TS,
    },
  },
  {
    name:        "MAKE_DEAL_WEBHOOK_URL",
    description: "Deal saved → Make.com payout / notify scenario",
    payload:     { deal: { id: "check-001", clientName: "Webhook Check", date: TODAY, grossAmount: 0 }, timestamp: TS },
  },
];

// ─── Run checks ───────────────────────────────────────────────────────────────
let pass = 0, fail = 0, skip = 0;

console.log("Make.com Webhook Health Check");
console.log("=".repeat(70));
console.log();

for (const wh of WEBHOOKS) {
  const url = env(wh.name);
  process.stdout.write(`${wh.name}\n  ${wh.description}\n  → `);

  if (!url) {
    console.log("SKIP — not configured");
    console.log();
    skip++;
    continue;
  }

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(wh.payload),
      signal:  AbortSignal.timeout(5000),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) {
      console.log(`PASS (${res.status}) ${body.slice(0, 80)}`);
      pass++;
    } else {
      console.log(`FAIL (${res.status}) ${body.slice(0, 120)}`);
      fail++;
    }
  } catch (err) {
    console.log(`FAIL — ${err.message}`);
    fail++;
  }
  console.log();
}

console.log("=".repeat(70));
console.log(`Results: ${pass} PASS  |  ${fail} FAIL  |  ${skip} SKIP`);
if (fail > 0) {
  console.log("\nFailing webhooks: check Make.com scenario is active and the URL is correct.");
}
if (skip > 0) {
  console.log("\nSkipped webhooks: run `node scripts/list-make-scenarios.mjs` to find their URLs,");
  console.log("then fill them into .env.local and .env.prod.");
}
console.log();
