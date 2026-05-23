import { kv } from "@vercel/kv";

const TTL_SECONDS = 86_400; // 24 hours

/**
 * Returns true if this is the FIRST time we've seen this event.
 * Atomically sets a KV key with 24hr TTL on first call — safe across
 * concurrent serverless invocations (single Redis SETNX operation).
 *
 * Key pattern: sns:notif:sent:{eventType}:{uniqueId}
 *
 * @returns true  = first time seen → proceed with notification
 * @returns false = duplicate       → skip notification
 */
export async function deduplicateNotif(
  eventType: string,
  uniqueId: string
): Promise<boolean> {
  if (!uniqueId) return true; // no ID = allow through (fail open)
  const key = `sns:notif:sent:${eventType}:${uniqueId}`;
  const result = await kv.set(key, "1", { ex: TTL_SECONDS, nx: true });
  return result !== null; // null = key already existed → duplicate
}
