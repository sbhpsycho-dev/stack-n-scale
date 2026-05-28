import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

export const runtime     = "nodejs";
export const maxDuration = 60;

// Key namespaces to export (single keys — fetched by exact key name)
const SINGLE_KEYS = [
  "sns-staff-registry",
  "sns-registry",
  "sns:deals:index",
  "sns:leads:index",
  "sns:expenses:index",
  "sns:payouts:pending",
  "sns-dashboard-v1",
];

export async function GET(req: Request) {
  // Allow Make.com / cron callers via Bearer token — no session required
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const session = await getServerSession(authOptions);
    if (session?.user.role !== "admin") {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const snapshot: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
  };

  // ── 1. Export single keys ─────────────────────────────────────────────────
  for (const key of SINGLE_KEYS) {
    try {
      snapshot[key] = await kv.get(key);
    } catch {
      snapshot[key] = null;
    }
  }

  // ── 2. Export all deals ───────────────────────────────────────────────────
  try {
    const dealIds = (await kv.lrange("sns:deals:index", 0, -1)) as string[];
    const deals = await Promise.all(dealIds.map(id => kv.get(`sns:deals:${id}`)));
    snapshot["deals"] = deals.filter(Boolean);
  } catch {
    snapshot["deals"] = [];
  }

  // ── 3. Export all coaching clients ────────────────────────────────────────
  // NOTE: kv.keys() does a full keyspace scan — can be slow with many entries.
  // If this times out at scale, switch to maintaining a "sns:coaching:clients:index" list key.
  try {
    const clientKeys = await kv.keys("sns:coaching:client:*");
    const clients = await Promise.all(clientKeys.map(k => kv.get(k)));
    snapshot["coachingClients"] = clients.filter(Boolean);
  } catch {
    snapshot["coachingClients"] = [];
  }

  // ── 4. Export all leads ───────────────────────────────────────────────────
  try {
    const leadIds = (await kv.lrange("sns:leads:index", 0, -1)) as string[];
    const leads = await Promise.all(leadIds.map(id => kv.get(`sns:leads:${id}`)));
    snapshot["leads"] = leads.filter(Boolean);
  } catch {
    snapshot["leads"] = [];
  }

  // ── 5. Export all expenses ────────────────────────────────────────────────
  try {
    const expenseIds = (await kv.lrange("sns:expenses:index", 0, -1)) as string[];
    const expenses = await Promise.all(expenseIds.map(id => kv.get(`sns:expenses:${id}`)));
    snapshot["expenses"] = expenses.filter(Boolean);
  } catch {
    snapshot["expenses"] = [];
  }

  // Return as downloadable JSON attachment
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="sns-backup-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
