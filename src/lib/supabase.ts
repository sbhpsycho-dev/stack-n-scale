import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key (bypasses RLS).
 * Used by the Whop payment webhook for idempotency + the `payments` log table.
 *
 * Returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset so callers
 * can degrade gracefully (matches env.ts: missing optional vars warn, don't crash).
 * NEVER import this into client components — the service-role key must stay server-side.
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping DB ops");
    return null;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
