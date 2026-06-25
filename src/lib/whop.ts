import { createHmac, timingSafeEqual } from "crypto";

export type StudentTier = "Intro Student" | "Student" | "VIP Student";

/**
 * Map amount paid (in USD dollars) to a student tier.
 * Reference mapping: $100 → Intro, $2,500 → Student, $5,000 → VIP, $10,000 → VIP.
 * Rule: amount >= $5,000 ⇒ VIP Student.
 */
export function computeTier(amountDollars: number): StudentTier {
  if (amountDollars >= 5000) return "VIP Student";
  if (amountDollars >= 2500) return "Student";
  return "Intro Student";
}

/** Compact package label: $100, $2.5k, $5k, $10k. */
export function packageLabel(amountDollars: number): string {
  if (amountDollars >= 1000) {
    const k = amountDollars / 1000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `$${amountDollars}`;
}

/**
 * Verify a Whop webhook signature. Whop uses the Standard Webhooks / Svix spec.
 *   Headers: svix-id, svix-timestamp, svix-signature
 *   Secret:  whsec_<base64> — strip prefix, base64-decode to key bytes.
 *   Signed:  svix-id + "." + svix-timestamp + "." + rawBody
 *   Expect:  base64(HMAC-SHA256(keyBytes, signedContent))
 * svix-signature may carry multiple space-separated sigs ("v1,<b64> v1,<b64>") — any match passes.
 * Ported verbatim from the retired src/app/api/webhooks/whop route.
 */
export function verifyWhopSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) return false;
  try {
    let keyBytes: Buffer;
    if (secret.startsWith("whsec_")) {
      keyBytes = Buffer.from(secret.slice(6), "base64");
    } else if (secret.startsWith("ws_")) {
      keyBytes = Buffer.from(secret.slice(3), "hex");
    } else {
      keyBytes = Buffer.from(secret);
    }
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expected = createHmac("sha256", keyBytes).update(signedContent).digest("base64");
    return svixSignature.split(" ").some(part => {
      const sig = part.startsWith("v1,") ? part.slice(3) : part;
      if (sig.length !== expected.length) return false;
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
  } catch {
    return false;
  }
}
