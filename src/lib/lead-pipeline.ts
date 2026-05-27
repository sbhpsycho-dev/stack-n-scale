/**
 * lead-pipeline.ts
 *
 * KV helpers for the GHL → Discord lead notification system.
 * All keys are namespaced under "sns:" to stay consistent with the rest of the app.
 *
 * Key schema
 * ──────────────────────────────────────────────────────────────────
 * sns:stl:pending              HSET  contactId → JSON string { name, phone, createdAt }
 * sns:stl:alerted:15:{id}      SET   "1"  (24 h TTL) — prevents repeat 15-min alert
 * sns:stl:alerted:30:{id}      SET   "1"  (24 h TTL) — prevents repeat 30-min alert
 * sns:phone:{e164}             SET   contactId  (48 h TTL — dupe window)
 * sns:email:{lower}            SET   contactId  (48 h TTL)
 * sns:metrics:leads:{date}     INCR  (YYYY-MM-DD)
 * sns:metrics:booked:{date}    INCR
 * sns:metrics:noshow:{date}    INCR
 * sns:metrics:campaign:{date}:{name}  INCR
 * sns:meta:spend:{date}        SET   JSON string { total: number, campaigns: Record<string,number> }
 */

import { kv } from "@vercel/kv";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface STLEntry {
  name: string;
  phone?: string;
  createdAt: string; // ISO 8601
}

export interface PipelineDay {
  date: string;
  leads: number;
  booked: number;
  noShows: number;
  campaigns: Record<string, number>;
}

export interface SpendRecord {
  total: number;
  campaigns: Record<string, number>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STL_PENDING_KEY   = "sns:stl:pending";
const DUPE_TTL          = 48 * 60 * 60;   // 48 hours
const ALERT_TTL         = 24 * 60 * 60;   // 24 hours

// ── Speed-to-lead helpers ─────────────────────────────────────────────────────

/**
 * Register a new lead in the STL pending hash.
 * Called immediately after a new GHL contact is created.
 */
export async function trackNewLead(
  contactId: string,
  name: string,
  phone: string | undefined,
  campaignName: string,
  dateStr: string,
): Promise<void> {
  if (!contactId) return;

  const entry: STLEntry = { name, phone, createdAt: new Date().toISOString() };
  await kv.hset(STL_PENDING_KEY, { [contactId]: JSON.stringify(entry) });

  // Also increment daily metrics
  await incrementMetrics("lead", campaignName || undefined, dateStr);

  // Register phone/email for duplicate detection (called separately via registerContact)
}

/**
 * Remove a lead from the STL pending hash (they've been worked).
 * Called when an outbound message is sent OR an appointment is booked.
 */
export async function markLeadContacted(contactId: string): Promise<void> {
  if (!contactId) return;
  await kv.hdel(STL_PENDING_KEY, contactId);
}

/**
 * Get all currently pending (uncontacted) leads.
 * Returns a map of contactId → STLEntry.
 */
export async function getPendingLeads(): Promise<Record<string, STLEntry>> {
  const raw = await kv.hgetall<Record<string, string>>(STL_PENDING_KEY) ?? {};
  const result: Record<string, STLEntry> = {};
  for (const [id, val] of Object.entries(raw)) {
    try {
      result[id] = JSON.parse(val) as STLEntry;
    } catch {
      // malformed entry — skip
    }
  }
  return result;
}

/**
 * Check whether we've already sent a 15-min or 30-min alert for this contact.
 * Returns true if the alert was already sent.
 */
export async function hasAlertBeenSent(contactId: string, level: 15 | 30): Promise<boolean> {
  const key = `sns:stl:alerted:${level}:${contactId}`;
  return (await kv.get(key)) !== null;
}

/**
 * Mark a 15-min or 30-min alert as sent for this contact.
 */
export async function markAlertSent(contactId: string, level: 15 | 30): Promise<void> {
  const key = `sns:stl:alerted:${level}:${contactId}`;
  await kv.set(key, "1", { ex: ALERT_TTL });
}

// ── Duplicate detection ───────────────────────────────────────────────────────

/** Normalize a phone number to E.164-ish digits-only key (no +). */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Check if a phone or email has been seen before.
 * Returns the previously stored contactId, or null if not a duplicate.
 */
export async function checkDuplicate(
  phone?: string,
  email?: string,
): Promise<string | null> {
  const checks: Promise<string | null>[] = [];

  if (phone) {
    const norm = normalizePhone(phone);
    if (norm.length >= 7) checks.push(kv.get<string>(`sns:phone:${norm}`));
  }
  if (email) {
    checks.push(kv.get<string>(`sns:email:${email.toLowerCase().trim()}`));
  }
  if (!checks.length) return null;

  const results = await Promise.all(checks);
  return results.find(r => r !== null) ?? null;
}

/**
 * Register a contact's phone and email in KV so future duplicates are caught.
 * Call this AFTER confirming the lead is not a duplicate.
 */
export async function registerContact(
  contactId: string,
  phone?: string,
  email?: string,
): Promise<void> {
  const ops: Promise<unknown>[] = [];

  if (phone) {
    const norm = normalizePhone(phone);
    if (norm.length >= 7) {
      ops.push(kv.set(`sns:phone:${norm}`, contactId, { ex: DUPE_TTL, nx: true }));
    }
  }
  if (email) {
    const lower = email.toLowerCase().trim();
    ops.push(kv.set(`sns:email:${lower}`, contactId, { ex: DUPE_TTL, nx: true }));
  }

  await Promise.all(ops);
}

// ── Metrics counters ──────────────────────────────────────────────────────────

/** Returns today's date string in ET (UTC-4 in summer / UTC-5 in winter). */
export function todayET(): string {
  // Approximate ET as UTC-4 (close enough for daily bucketing; DST boundary error = 1 hr)
  const et = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return et.toISOString().slice(0, 10);
}

/**
 * Increment one of the daily pipeline metric counters.
 * @param event   - "lead" | "booked" | "noshow"
 * @param campaign - optional campaign name (logged separately for CPL breakdown)
 * @param dateStr  - YYYY-MM-DD (defaults to today ET if omitted)
 */
export async function incrementMetrics(
  event: "lead" | "booked" | "noshow",
  campaign?: string,
  dateStr?: string,
): Promise<void> {
  const date = dateStr ?? todayET();
  const ops: Promise<unknown>[] = [
    kv.incr(`sns:metrics:${event}:${date}`),
  ];
  if (event === "lead" && campaign && campaign !== "—") {
    // Truncate campaign name to keep key length reasonable
    const slug = campaign.slice(0, 80).replace(/:/g, "-");
    ops.push(kv.incr(`sns:metrics:campaign:${date}:${slug}`));
  }
  await Promise.all(ops);
}

// ── Metrics retrieval ─────────────────────────────────────────────────────────

/**
 * Fetch all pipeline metrics for a single date.
 */
export async function getPipelineMetrics(dateStr: string): Promise<PipelineDay> {
  const [leads, booked, noShows] = await Promise.all([
    kv.get<number>(`sns:metrics:leads:${dateStr}`),
    kv.get<number>(`sns:metrics:booked:${dateStr}`),
    kv.get<number>(`sns:metrics:noshow:${dateStr}`),
  ]);

  // Scan for all campaign keys for this date
  // KV SCAN with match pattern — Vercel KV uses Upstash Redis scan
  const campaignPattern = `sns:metrics:campaign:${dateStr}:*`;
  let campaigns: Record<string, number> = {};
  try {
    const keys = await scanKeys(campaignPattern);
    if (keys.length) {
      const vals = await Promise.all(keys.map(k => kv.get<number>(k)));
      for (let i = 0; i < keys.length; i++) {
        const campaignName = keys[i].replace(`sns:metrics:campaign:${dateStr}:`, "");
        campaigns[campaignName] = vals[i] ?? 0;
      }
    }
  } catch {
    // non-fatal — campaigns just won't appear in summary
  }

  return {
    date: dateStr,
    leads: leads ?? 0,
    booked: booked ?? 0,
    noShows: noShows ?? 0,
    campaigns,
  };
}

/**
 * Fetch pipeline metrics for 7 days starting from mondayStr.
 */
export async function getWeeklyMetrics(mondayStr: string): Promise<PipelineDay[]> {
  const days: PipelineDay[] = [];
  const base = new Date(mondayStr + "T00:00:00Z");
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push(await getPipelineMetrics(dateStr));
  }
  return days;
}

/**
 * Sum an array of PipelineDay records into a single aggregate.
 */
export function sumPipelineDays(days: PipelineDay[]): Omit<PipelineDay, "date"> {
  const campaigns: Record<string, number> = {};
  let leads = 0, booked = 0, noShows = 0;

  for (const d of days) {
    leads   += d.leads;
    booked  += d.booked;
    noShows += d.noShows;
    for (const [k, v] of Object.entries(d.campaigns)) {
      campaigns[k] = (campaigns[k] ?? 0) + v;
    }
  }
  return { leads, booked, noShows, campaigns };
}

// ── Meta spend ────────────────────────────────────────────────────────────────

export async function getMetaSpend(dateStr: string): Promise<SpendRecord | null> {
  return kv.get<SpendRecord>(`sns:meta:spend:${dateStr}`);
}

export async function setMetaSpend(dateStr: string, record: SpendRecord): Promise<void> {
  // Keep spend data for 90 days
  await kv.set(`sns:meta:spend:${dateStr}`, record, { ex: 90 * 24 * 60 * 60 });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Scan all KV keys matching a glob pattern (uses Upstash SCAN under the hood).
 * Returns up to 200 matching keys — sufficient for daily campaign breakdowns.
 */
async function scanKeys(pattern: string): Promise<string[]> {
  // @vercel/kv exposes the underlying redis client via kv.scan()
  // Signature: kv.scan(cursor, { match, count })
  const results: string[] = [];
  let cursor = 0;
  do {
    const [nextCursor, keys] = await (kv as any).scan(cursor, {
      match: pattern,
      count: 100,
    });
    results.push(...keys);
    cursor = Number(nextCursor);
  } while (cursor !== 0 && results.length < 200);
  return results;
}
