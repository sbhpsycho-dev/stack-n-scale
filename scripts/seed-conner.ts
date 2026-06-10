/**
 * One-time script: creates Conner's staff account in Vercel KV.
 * Run with:  npx tsx scripts/seed-conner.ts
 * Delete this file after running.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { randomBytes, pbkdf2Sync } from "crypto";

config({ path: resolve(process.cwd(), ".env.local") });

const KV_REST_API_URL   = process.env.KV_REST_API_URL!;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN!;
const STAFF_KV_KEY      = "sns-staff-registry";

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
  console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN in .env.local");
  process.exit(1);
}

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(plain, salt, 100_000, 32, "sha256").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

async function kvGet(key: string): Promise<unknown> {
  const res = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
  });
  const json = await res.json() as { result: unknown };
  return json.result;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  await fetch(`${KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });
}

async function main() {
  const raw = await kvGet(STAFF_KV_KEY);
  const registry: Array<Record<string, unknown>> = Array.isArray(raw) ? raw : [];

  if (registry.some((s) => s.id === "conner")) {
    console.log("✓ Conner already exists — nothing to do.");
    return;
  }

  const entry = {
    id:        "conner",
    name:      "Conner",
    password:  hashPassword("conner2026"),
    role:      "setter",
    createdAt: new Date().toISOString(),
  };

  registry.push(entry);
  await kvSet(STAFF_KV_KEY, registry);
  console.log("✓ Conner's staff account created (password: conner2026).");
}

main().catch((err) => { console.error(err); process.exit(1); });
