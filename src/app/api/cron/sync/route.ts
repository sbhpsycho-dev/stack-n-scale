import { kv } from "@vercel/kv";
import { syncAll } from "@/lib/sync-runners";
import { SEED, type SalesData } from "@/lib/sales-data";

export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const adminData = (await kv.get<SalesData>("sns-dashboard-v1")) ?? SEED;
    const registry = adminData.clientRegistry ?? [];

    await Promise.allSettled(registry.map((client) => syncAll(client.id)));

    return Response.json({ ok: true, synced: registry.length });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
