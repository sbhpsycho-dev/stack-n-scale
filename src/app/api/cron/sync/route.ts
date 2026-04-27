import { kv } from "@vercel/kv";
import { syncAll } from "@/lib/sync-runners";
import { SEED, type SalesData } from "@/lib/sales-data";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  // Only accept the secret via Authorization header — never via URL params (they appear in logs)
  const authHeader = req.headers.get("authorization");
  const authorized = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const adminData = (await kv.get<SalesData>("sns-dashboard-v1")) ?? SEED;
    const registry = adminData.clientRegistry ?? [];

    await Promise.allSettled([
      syncAll("admin"),
      ...registry.map((client) => syncAll(client.id)),
    ]);

    return Response.json({ ok: true, synced: registry.length + 1 });
  } catch (err) {
    console.error("Cron sync error:", err);
    return Response.json({ ok: false, error: "Sync failed" }, { status: 500 });
  }
}
