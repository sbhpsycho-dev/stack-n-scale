import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * kvStore — durable key/value backed by the Supabase `kv_store` table, for the
 * ephemeral namespaces that aren't worth modeling as domain tables (OAuth state,
 * Outlook tokens, rate-limit buckets, dedup flags, locks, webhook:last:*, etc.).
 *
 * Provides the subset of the Vercel KV API those call sites use, with TTL via an
 * `expires_at` column (Postgres has no native TTL): reads filter out expired rows,
 * and `cleanupExpired()` (run from a cron) deletes them.
 */

function admin() {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("[repos/kvStore] Supabase not configured");
  return sb;
}

const expiryFromEx = (ex?: number): string | null =>
  ex ? new Date(Date.now() + ex * 1000).toISOString() : null;

export async function get<T = unknown>(key: string): Promise<T | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin()
    .from("kv_store")
    .select("value, expires_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`[repos/kvStore] get(${key}): ${error.message}`);
  if (!data) return null;
  if (data.expires_at && data.expires_at <= nowIso) return null; // expired
  return data.value as T;
}

/** Set a key (upsert). Optional TTL in seconds via `opts.ex`. */
export async function set(key: string, value: unknown, opts: { ex?: number } = {}): Promise<void> {
  const { error } = await admin()
    .from("kv_store")
    .upsert({ key, value, expires_at: expiryFromEx(opts.ex) }, { onConflict: "key" });
  if (error) throw new Error(`[repos/kvStore] set(${key}): ${error.message}`);
}

/**
 * Set only if the key does not already exist (or has expired). Returns true when
 * the value was written — the `{ nx: true }` semantics used for locks + dedup flags.
 */
export async function setNx(key: string, value: unknown, opts: { ex?: number } = {}): Promise<boolean> {
  const sb = admin();
  // Clear a stale (expired) row first so the key can be re-acquired.
  await sb.from("kv_store").delete().eq("key", key).lte("expires_at", new Date().toISOString());
  const { data, error } = await sb
    .from("kv_store")
    .upsert({ key, value, expires_at: expiryFromEx(opts.ex) }, { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  if (error) throw new Error(`[repos/kvStore] setNx(${key}): ${error.message}`);
  return !!data && data.length > 0;
}

export async function del(key: string): Promise<void> {
  const { error } = await admin().from("kv_store").delete().eq("key", key);
  if (error) throw new Error(`[repos/kvStore] del(${key}): ${error.message}`);
}

/** Keys matching a prefix (replaces `kv.keys("prefix*")`), excluding expired. */
export async function keysByPrefix(prefix: string): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin()
    .from("kv_store")
    .select("key, expires_at")
    .like("key", `${prefix}%`);
  if (error) throw new Error(`[repos/kvStore] keysByPrefix(${prefix}): ${error.message}`);
  return (data ?? [])
    .filter(r => !r.expires_at || r.expires_at > nowIso)
    .map(r => r.key as string);
}

/** Delete all expired rows. Call from a scheduled cron. */
export async function cleanupExpired(): Promise<number> {
  const { data, error } = await admin()
    .from("kv_store")
    .delete()
    .lte("expires_at", new Date().toISOString())
    .select("key");
  if (error) throw new Error(`[repos/kvStore] cleanupExpired: ${error.message}`);
  return data?.length ?? 0;
}
