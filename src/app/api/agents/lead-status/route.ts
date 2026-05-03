import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Lead } from "@/lib/lead-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ids = (await kv.get<string[]>("sns:leads:index")) ?? [];
  if (!ids.length) return Response.json({ leads: [] });

  const leads = (
    await Promise.all(ids.map(id => kv.get<Lead>(`sns:leads:${id}`)))
  ).filter((l): l is Lead => l !== null);

  leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return Response.json({ leads });
}
