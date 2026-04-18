import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SEED } from "@/lib/sales-data";

const KV_KEY = "sns-dashboard-v1";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const data = (await kv.get(KV_KEY)) ?? SEED;
    return Response.json(data);
  } catch {
    return Response.json(SEED);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const body = await req.json();
  await kv.set(KV_KEY, body);
  return Response.json({ ok: true });
}
