import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type SalesData, BLANK } from "@/lib/sales-data";
import type { Deal } from "@/lib/deal-types";

function ymOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Load all deals — this is the authoritative, always-live source
  const ids = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const allDeals = ids.length
    ? (await Promise.all(ids.map(id => kv.get<Deal>(`sns:deals:${id}`)))).filter((d): d is Deal => d !== null)
    : [];

  const now      = new Date();
  const thisYM   = ymOf(now);
  const prevYM   = ymOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const prev2YM  = ymOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)));
  const prev3YM  = ymOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)));

  const monthStart     = `${thisYM}-01`;
  const lastMonthStart = `${prevYM}-01`;
  const lastMonthEnd   = `${thisYM}-01`; // exclusive upper bound

  const mtdDeals      = allDeals.filter(d => d.date >= monthStart);
  const lastMonthDeals = allDeals.filter(d => d.date >= lastMonthStart && d.date < lastMonthEnd);

  const cashCollectedMTD      = mtdDeals.reduce((s, d) => s + d.grossAmount, 0);
  const netRevenueMTD         = mtdDeals.reduce((s, d) => s + d.netAmount, 0);
  const cashCollectedLastMonth = lastMonthDeals.reduce((s, d) => s + d.grossAmount, 0);

  // MRR — average gross of the 3 months prior to current
  const mrrMonths = [prevYM, prev2YM, prev3YM];
  const mrrTotals = mrrMonths.map(ym =>
    allDeals.filter(d => d.date.slice(0, 7) === ym).reduce((s, d) => s + d.grossAmount, 0)
  );
  const mrrMonthsWithData = mrrTotals.filter(v => v > 0);
  const mrr = mrrMonthsWithData.length > 0
    ? parseFloat((mrrMonthsWithData.reduce((s, v) => s + v, 0) / mrrMonthsWithData.length).toFixed(2))
    : 0;

  // Revenue over time — daily gross aggregates, all deals
  const byDate = new Map<string, number>();
  for (const d of allDeals) {
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.grossAmount);
  }
  const revenueOverTime = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: parseFloat(amount.toFixed(2)) }));

  // Net by processor and product — MTD only
  const byProc    = new Map<string, number>();
  const byProduct = new Map<string, number>();
  for (const d of mtdDeals) {
    const proc = d.processor === "fanbasis" ? "Fanbasis" : "Stripe";
    byProc.set(proc, (byProc.get(proc) ?? 0) + d.netAmount);
    const product = d.offer === "5K" ? "5K Offer" : "10K Offer";
    byProduct.set(product, (byProduct.get(product) ?? 0) + d.netAmount);
  }
  const netByProcessor = Array.from(byProc.entries()).map(([name, amount]) => ({ name, amount: parseFloat(amount.toFixed(2)) }));
  const netByProduct   = Array.from(byProduct.entries()).map(([name, amount]) => ({ name, amount: parseFloat(amount.toFixed(2)) }));

  // Refunds and monthly goal come from the KV snapshot (Stripe/manual sources only)
  const snapshot = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;
  const totalRefund    = snapshot.dashboard.totalRefund    ?? 0;
  const totalRefundPct = cashCollectedMTD > 0 ? totalRefund / cashCollectedMTD : 0;
  const monthlyGoal    = snapshot.dashboard.monthlyGoal   ?? 0;

  return Response.json({
    cashCollectedMTD,
    cashCollectedLastMonth,
    netRevenueMTD,
    mrr,
    totalRefund,
    totalRefundPct: parseFloat(totalRefundPct.toFixed(4)),
    monthlyGoal,
    revenueOverTime,
    netByProcessor,
    netByProduct,
  });
}
