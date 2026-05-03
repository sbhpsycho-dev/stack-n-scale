import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Deal, WeeklyPayout } from "@/lib/deal-types";
import { getWeekId, getWeekBounds } from "@/lib/payout-calc";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const weekId = searchParams.get("weekId") ?? getWeekId();
  const bounds = getWeekBounds(weekId);

  const weekKey = `sns:payouts:weekly:${weekId}`;
  const week = await kv.get<WeeklyPayout>(weekKey);

  if (!week?.dealIds?.length) {
    return Response.json({
      weekId, weekStart: bounds.start, weekEnd: bounds.end,
      status: "pending", deals: [],
      totals: { caelum: 0, mediaBuyer: 0, setter: 0, closer: 0, totalPayouts: 0, evanTakeHome: 0, gross: 0, fees: 0 },
    });
  }

  const deals = (
    await Promise.all(week.dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const totals = deals.reduce(
    (acc, d) => ({
      caelum:       acc.caelum       + d.payouts.caelum,
      mediaBuyer:   acc.mediaBuyer   + d.payouts.mediaBuyer,
      setter:       acc.setter       + d.payouts.setter,
      closer:       acc.closer       + d.payouts.closer,
      totalPayouts: acc.totalPayouts + d.payouts.totalPayouts,
      evanTakeHome: acc.evanTakeHome + d.payouts.evanTakeHome,
      gross:        acc.gross        + d.grossAmount,
      fees:         acc.fees         + d.processorFee,
    }),
    { caelum: 0, mediaBuyer: 0, setter: 0, closer: 0, totalPayouts: 0, evanTakeHome: 0, gross: 0, fees: 0 }
  );

  // Persist updated totals
  const updated: WeeklyPayout = {
    weekId, weekStart: bounds.start, weekEnd: bounds.end,
    dealIds: week.dealIds, totals, status: week.status ?? "pending",
    approvedAt: week.approvedAt,
  };
  await kv.set(weekKey, updated);

  return Response.json({ ...updated, deals });
}
