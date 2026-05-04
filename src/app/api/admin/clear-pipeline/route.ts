import { kv } from "@vercel/kv";
import { BLANK, type SalesData } from "@/lib/sales-data";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.NEXTAUTH_SECRET || authHeader !== `Bearer ${process.env.NEXTAUTH_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const current = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;

  await kv.set("sns-dashboard-v1", {
    ...current,
    pipeline: BLANK.pipeline,
    ads:      BLANK.ads,
  });

  return Response.json({ ok: true });
}
