import { kv } from "@vercel/kv";
import { syncAll } from "@/lib/sync-runners";
import { SEED, type SalesData } from "@/lib/sales-data";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const querySecret = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const authorized =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);
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
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
