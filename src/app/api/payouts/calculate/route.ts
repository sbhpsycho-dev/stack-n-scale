import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { dealId: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deal = await kv.get<Deal>(`sns:deals:${body.dealId}`);
  if (!deal) return Response.json({ error: "Deal not found" }, { status: 404 });

  const payouts = calculatePayouts(deal);
  const updated: Deal = { ...deal, payouts };
  await kv.set(`sns:deals:${deal.id}`, updated);

  return Response.json({ payouts });
}
