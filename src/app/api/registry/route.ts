import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type ClientMeta } from "@/lib/sales-data";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const registry: ClientMeta[] = await req.json();
  await kv.set("sns-registry", registry);
  return Response.json({ ok: true });
}
