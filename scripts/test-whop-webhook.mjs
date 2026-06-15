import { createHmac, randomUUID } from "crypto";

const SECRET = "ws_65f808b6d055a874018d67fc42d53e080c12a9c61b546fec53af6c5c38b4d2a6";
const URL    = "https://stack-n-scale.vercel.app/api/webhooks/whop";

const payload = {
  event: "payment_succeeded",
  data: {
    id: "pay_TEST123",
    final_amount: 500000, // $5,000 in cents
    user: {
      email: "test-whop-client@fake.dev",
      name: "Test Whop Client",
      username: "testwhop",
    },
  },
};

const body         = JSON.stringify(payload);
const svixId       = randomUUID();
const svixTimestamp = String(Math.floor(Date.now() / 1000));
const keyBytes     = Buffer.from(SECRET.slice(3), "hex"); // strip ws_
const signedContent = `${svixId}.${svixTimestamp}.${body}`;
const sig          = createHmac("sha256", keyBytes).update(signedContent).digest("base64");

console.log("Firing test Whop webhook...");
console.log("  svix-id:        ", svixId);
console.log("  svix-timestamp: ", svixTimestamp);
console.log("  payload:        ", JSON.stringify(payload, null, 2));

const res = await fetch(URL, {
  method: "POST",
  headers: {
    "Content-Type":   "application/json",
    "svix-id":        svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": `v1,${sig}`,
  },
  body,
});

const text = await res.text();
console.log("\nResponse:", res.status, text);

if (res.ok) {
  console.log("\n✅ Webhook accepted — check Discord for the 💰 notification.");
  console.log("   KV key to verify: sns:deals:whop-pay_TEST123");
} else {
  console.log("\n❌ Webhook rejected — see response above.");
}
