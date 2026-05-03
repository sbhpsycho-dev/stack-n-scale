import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { CheckInRecord } from "@/lib/health-score";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron && (!session || (session.user.role !== "admin" && session.user.role !== "staff"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const keys = await kv.keys("sns:checkins:*");
  const studentKeys = keys.filter(k => !k.endsWith(":flagged"));

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const students = await Promise.all(
    studentKeys.map(async (key) => {
      const records = (await kv.get<CheckInRecord[]>(key)) ?? [];
      if (!records.length) return null;
      const latest      = records[records.length - 1];
      const checkedIn   = new Date(latest.submittedAt) >= weekStart;
      return {
        studentName:  latest.studentName,
        healthScore:  latest.healthScore,
        lastCheckIn:  latest.submittedAt,
        checkedIn,
        couldDoBetter: latest.couldDoBetter,
      };
    })
  );

  const valid = students.filter(Boolean) as NonNullable<typeof students[number]>[];

  const checkedIn   = valid.filter(s => s.checkedIn);
  const missing     = valid.filter(s => !s.checkedIn).map(s => s.studentName);
  const green       = checkedIn.filter(s => s.healthScore >= 8);
  const orange      = checkedIn.filter(s => s.healthScore >= 6 && s.healthScore <= 7);
  const red         = checkedIn.filter(s => s.healthScore <= 5);
  const topPerf     = [...checkedIn].sort((a, b) => b.healthScore - a.healthScore).slice(0, 3);

  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const telegramText = [
    `📊 *Weekly Student Summary — Week of ${weekLabel}*`,
    "",
    `✅ Check-Ins Received: ${checkedIn.length} / ${valid.length}`,
    missing.length ? `❌ Missing Check-Ins: ${missing.join(", ")}` : "",
    "",
    `🟢 On Track (8-10): ${green.length} students`,
    orange.length ? `🟡 At Risk (6-7): ${orange.length} students — ${orange.map(s => s.studentName).join(", ")}` : "",
    red.length    ? `🔴 Off Track (1-5): ${red.length} students — ${red.map(s => s.studentName).join(", ")} ⚠️ CALL THESE TODAY` : "",
    "",
    topPerf.length ? `🏆 Top Performers This Week:` : "",
    ...topPerf.map((s, i) => `${i + 1}. ${s.studentName} — Score: ${s.healthScore}`),
  ].filter(Boolean).join("\n");

  return Response.json({
    weekLabel,
    total: valid.length,
    checkedInCount: checkedIn.length,
    missing,
    green: green.map(s => s.studentName),
    orange: orange.map(s => s.studentName),
    red: red.map(s => s.studentName),
    topPerformers: topPerf.map(s => ({ name: s.studentName, score: s.healthScore })),
    telegramText,
  });
}
