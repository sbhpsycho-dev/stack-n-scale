import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { SEED, type SalesData } from "@/lib/sales-data";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "admin") return new Response("Unauthorized", { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return Response.json({ ok: false, error: "Name is required" }, { status: 400 });

  try {
    const adminData = (await kv.get<SalesData>("sns-dashboard-v1")) ?? SEED;
    const registry = adminData.clientRegistry ?? [];
    const entry = registry.find((c) => c.id === session.user.clientId);

    if (!entry) return Response.json({ ok: false, error: "Client not found" }, { status: 404 });

    entry.name = name.trim();
    await kv.set("sns-dashboard-v1", adminData);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
