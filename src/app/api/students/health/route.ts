import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { CheckInRecord } from "@/lib/health-score";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const keys = await kv.keys("sns:checkins:*");
  const studentKeys = keys.filter(k => !k.endsWith(":flagged"));

  const students = await Promise.all(
    studentKeys.map(async (key) => {
      const records = (await kv.get<CheckInRecord[]>(key)) ?? [];
      if (!records.length) return null;
      const latest = records[records.length - 1];
      const trend  = records.slice(-4).map(r => r.healthScore);
      return {
        studentId:    key.replace("sns:checkins:", ""),
        studentName:  latest.studentName,
        healthScore:  latest.healthScore,
        lastCheckIn:  latest.submittedAt,
        programWeek:  latest.programWeek,
        trend,
        status:
          latest.healthScore >= 8 ? "green" :
          latest.healthScore >= 6 ? "orange" : "red",
      };
    })
  );

  const valid = students.filter(Boolean);
  valid.sort((a, b) => (a!.healthScore ?? 0) - (b!.healthScore ?? 0));

  return Response.json({ students: valid });
}
