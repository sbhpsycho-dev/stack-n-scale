import { timingSafeEqual } from "crypto";

function safeEqual(a: string, b: string): boolean {
  try {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Validates the Authorization: Bearer <CRON_SECRET> header using a
 * timing-safe comparison to prevent timing-oracle attacks.
 */
export function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  return safeEqual(authHeader, `Bearer ${secret}`);
}

/**
 * Validates the x-webhook-secret header (plain value, not Bearer) using
 * a timing-safe comparison.
 */
export function verifyWebhookSecret(headerValue: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !headerValue) return false;
  return safeEqual(headerValue, secret);
}
