import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { NextRequest } from "next/server";
import type { Deal } from "@/lib/deal-types";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/deals/[id]">) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const deal = await kv.get<Deal>(`sns:deals:${id}`);
  if (!deal) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ deal });
}
