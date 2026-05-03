import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type SalesData, SEED } from "@/lib/sales-data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = (await kv.get<SalesData>("sns-dashboard-v1")) ?? SEED;
  const d = data.dashboard;

  return Response.json({
    cashCollectedMTD:    d.cashCollectedMTD,
    cashCollectedLastMonth: d.cashCollectedLastMonth,
    netRevenueMTD:       d.netRevenueMTD,
    mrr:                 d.mrr,
    totalRefund:         d.totalRefund,
    totalRefundPct:      d.totalRefundPct,
    monthlyGoal:         d.monthlyGoal,
    revenueOverTime:     d.revenueOverTime  ?? [],
    netByProcessor:      d.netByProcessor   ?? [],
    netByProduct:        d.netByProduct     ?? [],
  });
}
