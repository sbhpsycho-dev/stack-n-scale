// Phase 0 verification — confirms the SNS Supabase project + creds + schema are wired.
// Run: npm run db:verify   (after setting SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and
// applying supabase/migrations/0002_backend_core.sql)
//
// Loads env from .env.local then .env (no dependency on dotenv), then checks that the
// service-role client can reach every expected table. Green here = I can verify each
// migration phase at runtime as I build it.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── tiny .env loader (KEY=VALUE lines; first file wins, existing env wins) ──────
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* file may not exist — fine */ }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("   Set them in .env.local (and Vercel) and re-run `npm run db:verify`.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Core tables from 0002_backend_core.sql (+ payments from 0001).
const TABLES = [
  "payments", "deals", "deal_payouts", "leads", "lead_contacts",
  "coaching_clients", "progress_notes", "id_verifications", "expenses",
  "staff", "biz_clients", "team_members", "weekly_payouts", "audit_logs",
  "notifications", "config", "onboarding_submissions", "checkins",
  "replog_entries", "daily_metrics", "stl_pending", "client_sync_data",
  "dashboard_cache", "meta_spend", "ads_scorecard_cache", "kv_store",
];

console.log(`🔌 Connecting to ${url}\n`);

let missing = 0;
for (const t of TABLES) {
  const { error } = await sb.from(t).select("*", { count: "exact", head: true });
  if (error) {
    missing++;
    console.log(`  ❌ ${t.padEnd(24)} ${error.message}`);
  } else {
    console.log(`  ✅ ${t}`);
  }
}

console.log("");
if (missing > 0) {
  console.error(`❌ ${missing}/${TABLES.length} tables unreachable.`);
  console.error("   Apply supabase/migrations/0001_create_payments.sql and 0002_backend_core.sql,");
  console.error("   then re-run. (Supabase SQL editor → paste each file → Run.)");
  process.exit(1);
}
console.log(`✅ All ${TABLES.length} tables reachable. Phase 0 complete — ready to migrate data + cut domains over.`);
