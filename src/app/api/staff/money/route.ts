import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Deal } from "@/lib/deal-types";

function getMonthId(date: string) {
  return date.slice(0, 7); // "YYYY-MM"
}

function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
  return d;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ids = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const allDeals = ids.length
    ? (await Promise.all(ids.map(id => kv.get<Deal>(`sns:deals:${id}`)))).filter((d): d is Deal => d !== null)
    : [];

  const now        = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const weekStart  = getWeekStart(now).toISOString().slice(0, 10);

  const thisWeekDeals = allDeals.filter(d => d.date >= weekStart);
  const mtdDeals      = allDeals.filter(d => d.date >= monthStart);

  function aggregate(deals: Deal[]) {
    return deals.reduce(
      (acc, d) => ({
        gross:        acc.gross        + d.grossAmount,
        fees:         acc.fees         + d.processorFee,
        net:          acc.net          + d.netAmount,
        caelum:       acc.caelum       + d.payouts.caelum,
        mediaBuyer:   acc.mediaBuyer   + d.payouts.mediaBuyer,
        setter:       acc.setter       + d.payouts.setter,
        closer:       acc.closer       + d.payouts.closer,
        totalPayouts: acc.totalPayouts + d.payouts.totalPayouts,
        evanTakeHome: acc.evanTakeHome + d.payouts.evanTakeHome,
        salesTeam:    acc.salesTeam    + d.payouts.setter + d.payouts.closer,
      }),
      { gross: 0, fees: 0, net: 0, caelum: 0, mediaBuyer: 0, setter: 0, closer: 0, totalPayouts: 0, evanTakeHome: 0, salesTeam: 0 }
    );
  }

  const week = aggregate(thisWeekDeals);
  const mtd  = aggregate(mtdDeals);

  // Owed = unpaid portion
  const unpaidMtd = mtdDeals.filter(d => d.payoutStatus !== "paid");
  const owed = aggregate(unpaidMtd);

  // Pie chart percentages (of gross)
  const pie = mtd.gross > 0 ? [
    { name: "Evan",        value: Math.round((mtd.evanTakeHome / mtd.gross) * 100) },
    { name: "Caelum",      value: Math.round((mtd.caelum       / mtd.gross) * 100) },
    { name: "Sales Team",  value: Math.round((mtd.salesTeam    / mtd.gross) * 100) },
    { name: "Media Buyer", value: Math.round((mtd.mediaBuyer   / mtd.gross) * 100) },
    { name: "Fees",        value: Math.round((mtd.fees         / mtd.gross) * 100) },
  ] : [];

  // Monthly history (last 12 months)
  const monthMap = new Map<string, ReturnType<typeof aggregate>>();
  for (const d of allDeals) {
    const mid = getMonthId(d.date);
    const existing = monthMap.get(mid) ?? { gross: 0, fees: 0, net: 0, caelum: 0, mediaBuyer: 0, setter: 0, closer: 0, totalPayouts: 0, evanTakeHome: 0, salesTeam: 0 };
    monthMap.set(mid, {
      gross:        existing.gross        + d.grossAmount,
      fees:         existing.fees         + d.processorFee,
      net:          existing.net          + d.netAmount,
      caelum:       existing.caelum       + d.payouts.caelum,
      mediaBuyer:   existing.mediaBuyer   + d.payouts.mediaBuyer,
      setter:       existing.setter       + d.payouts.setter,
      closer:       existing.closer       + d.payouts.closer,
      totalPayouts: existing.totalPayouts + d.payouts.totalPayouts,
      evanTakeHome: existing.evanTakeHome + d.payouts.evanTakeHome,
      salesTeam:    existing.salesTeam    + d.payouts.setter + d.payouts.closer,
    });
  }

  const monthlyHistory = Array.from(monthMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, totals]) => ({ month, ...totals }))
    .reverse();

  return Response.json({
    week: {
      gross:        week.gross,
      totalPayouts: week.totalPayouts,
      evanTakeHome: week.evanTakeHome,
      dealCount:    thisWeekDeals.length,
    },
    mtd: {
      gross:        mtd.gross,
      fees:         mtd.fees,
      net:          mtd.net,
      totalPayouts: mtd.totalPayouts,
      evanTakeHome: mtd.evanTakeHome,
      caelumOwed:   owed.caelum,
      salesTeamOwed: owed.salesTeam,
      mediaBuyerOwed: owed.mediaBuyer,
    },
    pie,
    monthlyHistory,
  });
}
