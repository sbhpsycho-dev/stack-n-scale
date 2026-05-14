import { kv } from "@vercel/kv";
import { syncAll } from "@/lib/sync-runners";
import { BLANK, type SalesData } from "@/lib/sales-data";
import { verifyCronSecret } from "@/lib/cron-auth";

export async function GET(req: Request) {
  // Only accept the secret via Authorization header — never via URL params (they appear in logs)
  if (!verifyCronSecret(req.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const adminData = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;
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
