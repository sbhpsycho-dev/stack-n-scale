import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { SalesData } from "@/lib/sales-data";
import type { Deal } from "@/lib/deal-types";
import type { CheckInRecord } from "@/lib/health-score";
import { sendDiscordDM } from "@/lib/discord";
import { verifyCronSecret } from "@/lib/cron-auth";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const isCron = verifyCronSecret(req.headers.get("authorization"));

  if (!isCron && (!session || (session.user.role !== "admin" && session.user.role !== "staff"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const monthStart   = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const dateLabel    = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ── Revenue from deals ──
  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const allDeals = (await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`))))
    .filter((d): d is Deal => d !== null);

  const yesterdayDeals = allDeals.filter(d => d.date === yesterdayStr);
  const mtdDeals       = allDeals.filter(d => d.date >= monthStart);

  const yesterdayGross = yesterdayDeals.reduce((s, d) => s + d.grossAmount, 0);
  const mtdGross       = mtdDeals.reduce((s, d) => s + d.grossAmount, 0);
  const mtdEvanNet     = mtdDeals.reduce((s, d) => s + d.payouts.evanTakeHome, 0);

  // ── Pipeline from sns-dashboard-v1 ──
  const dashboard = await kv.get<SalesData>("sns-dashboard-v1");
  const pipeline  = dashboard?.pipeline;
  const monthlyGoal = dashboard?.dashboard?.monthlyGoal ?? 0;
  const paceToGoal  = monthlyGoal > 0 ? Math.round((mtdGross / monthlyGoal) * 100) : null;

  // ── Student health ──
  const studentKeys = (await kv.keys("sns:checkins:*")).filter(k => !k.endsWith(":flagged"));
  const weekStart   = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const studentData = await Promise.all(
    studentKeys.map(async (key) => {
      const records = (await kv.get<CheckInRecord[]>(key)) ?? [];
      if (!records.length) return null;
      const latest = records[records.length - 1];
      return { name: latest.studentName, score: latest.healthScore, lastIn: latest.submittedAt };
    })
  );
  const students   = studentData.filter(Boolean) as { name: string; score: number; lastIn: string }[];
  const active     = students.length;
  const onTrack    = students.filter(s => s.score >= 8).length;
  const atRisk     = students.filter(s => s.score >= 6 && s.score <= 7).length;
  const offTrack   = students.filter(s => s.score <= 5);
  const missingIn  = students.filter(s => new Date(s.lastIn) < weekStart);

  const needsAttention = [
    ...offTrack.map(s => `🔴 ${s.name} — score ${s.score}/10`),
    ...missingIn.map(s => `⚠️ ${s.name} — no check-in this week`),
  ];

  const showRate = pipeline?.callsMade
    ? Math.round(((pipeline.callsAnswered ?? 0) / pipeline.callsMade) * 100)
    : null;

  const fmt$ = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Discord DMs to admins (fire-and-forget, non-blocking)
  const discordMsg = [
    `📋 **SNS Daily Brief — ${dateLabel}**`,
    "",
    `💰 **Revenue**`,
    `Yesterday: ${fmt$(yesterdayGross)}`,
    `MTD Gross: ${fmt$(mtdGross)}`,
    `MTD Evan Take Home: ${fmt$(mtdEvanNet)}`,
    paceToGoal !== null ? `Pace to ${fmt$(monthlyGoal)}: ${paceToGoal}%` : "",
    "",
    `📅 **Pipeline**`,
    `Deals Closed Yesterday: ${yesterdayDeals.length}`,
    pipeline ? `Calls Showed: ${pipeline.callsAnswered ?? 0}` : "",
    showRate !== null ? `Show Rate: ${showRate}%` : "",
    "",
    `👥 **Students**`,
    `Active: ${active} | 🟢 ${onTrack} on track | 🟡 ${atRisk} at risk | 🔴 ${offTrack.length} off track`,
    missingIn.length ? `⚠️ Missing check-in: ${missingIn.length}` : "",
    needsAttention.length ? `\n🚨 **Needs Attention**\n${needsAttention.join("\n")}` : "",
  ].filter(l => l !== "").join("\n");

  const adminIds = [
    process.env.DISCORD_CAELUM_USER_ID,
    process.env.EVAN_DISCORD_USER_ID,
  ].filter(Boolean) as string[];
  void Promise.all(adminIds.map(id => sendDiscordDM(id, discordMsg).catch(e => console.error(`Discord DM error (${id}):`, e))));

  return Response.json({
    date: dateLabel,
    revenue: { yesterdayGross, mtdGross, mtdEvanNet, monthlyGoal, paceToGoal },
    pipeline: {
      dealsClosedYesterday: yesterdayDeals.length,
      callsMade:    pipeline?.callsMade    ?? 0,
      callsShowed:  pipeline?.callsAnswered ?? 0,
      showRate,
    },
    students: { active, onTrack, atRisk, offTrack: offTrack.length, missingCheckIn: missingIn.length },
    needsAttention,
  });
}
