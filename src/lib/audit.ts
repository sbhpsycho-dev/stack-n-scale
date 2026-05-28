import { kv } from "@vercel/kv";

export type AuditAction =
  | "deal.created"
  | "deal.updated"
  | "deal.deleted"
  | "payout.approved"
  | "payout.rejected"
  | "client.status_changed"
  | "client.updated"
  | "staff.created"
  | "staff.updated"
  | "staff.deleted"
  | "id_verification.approved"
  | "id_verification.rejected";

export type AuditEntry = {
  id: string;
  actorId: string;        // Discord ID or staff ID or "system"
  actorName: string;      // Display name for quick reading
  action: AuditAction;
  entityId: string;       // deal ID, client email, staff ID, etc.
  entityType: "deal" | "payout" | "client" | "staff" | "verification";
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, string>;
  createdAt: string;      // ISO timestamp
};

/**
 * Log an audit event to KV (immediate) and Postgres (if available).
 * Never throws — audit failures must never break the caller.
 */
export async function logAudit(
  actorId: string,
  actorName: string,
  action: AuditAction,
  entityId: string,
  entityType: AuditEntry["entityType"],
  options: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, string>;
  } = {}
): Promise<void> {
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actorId,
    actorName,
    action,
    entityId,
    entityType,
    before: options.before ?? null,
    after: options.after ?? null,
    metadata: options.metadata,
    createdAt: new Date().toISOString(),
  };

  // Write to KV (primary — always works)
  try {
    await Promise.all([
      // Individual entry (7-day TTL — for recent lookups)
      kv.set(`sns:audit:${entry.id}`, entry, { ex: 60 * 60 * 24 * 7 }),
      // Prepend to global list (for admin log view)
      kv.lpush("sns:audit:index", entry.id),
      // Entity-specific list (e.g. all events for a deal)
      kv.lpush(`sns:audit:entity:${entityType}:${entityId}`, entry.id),
    ]);
    // Trim global index to last 1000 entries
    await kv.ltrim("sns:audit:index", 0, 999);
  } catch (err) {
    console.error("[audit] KV write failed:", err);
  }

  // Write to Postgres (secondary — no-op if not configured)
  try {
    const { db } = await import("./db");
    await db.auditLog.create({
      data: {
        actorId,
        action,
        entityId,
        entityType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        before: entry.before != null ? (entry.before as any) : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        after: entry.after != null ? (entry.after as any) : undefined,
        createdAt: new Date(entry.createdAt),
      },
    });
  } catch {
    // Silently skip if Postgres not connected — KV is the fallback
  }
}

/**
 * Get recent audit entries for a specific entity (e.g. all events for deal X)
 */
export async function getEntityAuditLog(
  entityType: AuditEntry["entityType"],
  entityId: string,
  limit = 20
): Promise<AuditEntry[]> {
  try {
    const ids = await kv.lrange(`sns:audit:entity:${entityType}:${entityId}`, 0, limit - 1);
    const entries = await Promise.all(ids.map(id => kv.get<AuditEntry>(`sns:audit:${id}`)));
    return entries.filter(Boolean) as AuditEntry[];
  } catch {
    return [];
  }
}
