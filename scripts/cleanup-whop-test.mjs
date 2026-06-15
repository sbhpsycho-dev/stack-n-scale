import { createClient } from "@vercel/kv";
import { config } from "dotenv";
config({ path: ".env.local" });

const kv = createClient({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const keys = [
  "sns:deals:whop-pay_TEST123",
  "sns:whop:payment:pay_TEST123",
  "sns:whop:deal:whop-pay_TEST123",
  "sns:coaching:client:test-whop-client@fake.dev",
];

for (const key of keys) {
  await kv.del(key);
  console.log("deleted:", key);
}

// Remove from deals index
const index = (await kv.get("sns:deals:index")) ?? [];
const cleaned = index.filter(id => id !== "whop-pay_TEST123");
if (cleaned.length !== index.length) {
  await kv.set("sns:deals:index", cleaned);
  console.log("removed whop-pay_TEST123 from sns:deals:index");
}

console.log("✅ Cleanup done.");
