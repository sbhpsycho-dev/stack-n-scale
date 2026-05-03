import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { BLANK } from "@/lib/sales-data";
import type { SalesData } from "@/lib/sales-data";
import type { Deal } from "@/lib/deal-types";
import { sendDiscordDM } from "@/lib/discord";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron && (!session || (session.user.role !== "admin" && session.user.role !== "staff"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Summarise the previous calendar month
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthLabel = prevMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Deals for the previous month
  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const allDeals = (await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`))))
    .filter((d): d is Deal => d !== null);

  const monthDeals = allDeals.filter(d => d.date >= prevMonthStart && d.date < thisMonthStart);

  const totalGross   = monthDeals.reduce((s, d) => s + d.grossAmount, 0);
  const totalNet     = monthDeals.reduce((s, d) => s + d.netAmount, 0);
  const totalEvan    = monthDeals.reduce((s, d) => s + d.payouts.evanTakeHome, 0);
  const totalCaelum  = monthDeals.reduce((s, d) => s + d.payouts.caelum, 0);
  const avgDeal      = monthDeals.length > 0 ? Math.round(totalGross / monthDeals.length) : 0;

  // Dashboard data (ads + goal)
  const data = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;
  const goal = data.dashboard.monthlyGoal;
  const paceToGoal = goal > 0 ? Math.round((totalGross / goal) * 100) : null;
  const ads = data.ads;

  // Setter/closer leaderboard for the month
  type RepStats = { demosSet: number; dealsClosed: number; grossAmount: number };
  const repMap = new Map<string, RepStats>();
  for (const deal of monthDeals) {
    if (deal.setter) {
      const r = repMap.get(deal.setter) ?? { demosSet: 0, dealsClosed: 0, grossAmount: 0 };
      repMap.set(deal.setter, { ...r, demosSet: r.demosSet + 1 });
    }
    if (deal.closer) {
      const r = repMap.get(deal.closer) ?? { demosSet: 0, dealsClosed: 0, grossAmount: 0 };
      repMap.set(deal.closer, { ...r, dealsClosed: r.dealsClosed + 1, grossAmount: r.grossAmount + deal.grossAmount });
    }
  }
  const leaderboard = Array.from(repMap.entries())
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.grossAmount - a.grossAmount);

  const fmt$ = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const discordMsg = [
    `📈 **SNS Monthly Summary — ${monthLabel}**`,
    "",
    `💰 **Revenue**`,
    `Cash Collected: ${fmt$(totalGross)}`,
    `Net Revenue: ${fmt$(totalNet)}`,
    `Evan Take Home: ${fmt$(totalEvan)}`,
    `Caelum Cut (15%): ${fmt$(totalCaelum)}`,
    goal > 0 ? `Goal: ${fmt$(goal)} — ${paceToGoal}% achieved` : "",
    "",
    `📦 **Deals**`,
    `Total Closed: ${monthDeals.length}`,
    avgDeal > 0 ? `Avg Deal Size: ${fmt$(avgDeal)}` : "",
    ads.totalAdSpend > 0 ? "" : "",
    ads.totalAdSpend > 0 ? `📣 **Ads**` : "",
    ads.totalAdSpend > 0 ? `Spend: ${fmt$(ads.totalAdSpend)} | Leads: ${ads.totalLeads} | CPL: ${fmt$(ads.cpl)}` : "",
    ads.roas > 0 ? `ROAS: ${ads.roas.toFixed(1)}x` : "",
    leaderboard.length > 0 ? "" : "",
    leaderboard.length > 0 ? `🏆 **Leaderboard**` : "",
    ...leaderboard.slice(0, 5).map((r, i) => `${i + 1}. ${r.name} — ${r.dealsClosed} closed (${fmt$(r.grossAmount)})`),
  ].filter(l => l !== "").join("\n");

  const adminIds = [
    process.env.DISCORD_CAELUM_USER_ID,
    process.env.EVAN_DISCORD_USER_ID,
  ].filter(Boolean) as string[];
  await Promise.all(adminIds.map(id => sendDiscordDM(id, discordMsg).catch(e => console.error(`Discord DM error (${id}):`, e))));

  return Response.json({
    month: monthLabel,
    deals: monthDeals.length,
    totalGross,
    totalNet,
    totalEvan,
    totalCaelum,
    avgDeal,
    leaderboard,
  });
}
