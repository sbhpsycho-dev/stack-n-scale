import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { NextRequest } from "next/server";
import type { Deal } from "@/lib/deal-types";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/payouts/[id]/paid">) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const deal = await kv.get<Deal>(`sns:deals:${id}`);
  if (!deal) return Response.json({ error: "Deal not found" }, { status: 404 });

  const updated: Deal = { ...deal, payoutStatus: "paid" };
  await kv.set(`sns:deals:${id}`, updated);

  // Remove from pending queue
  const pending = (await kv.get<string[]>("sns:payouts:pending")) ?? [];
  await kv.set("sns:payouts:pending", pending.filter(p => p !== id));

  return Response.json({ ok: true, dealId: id, status: "paid" });
}
