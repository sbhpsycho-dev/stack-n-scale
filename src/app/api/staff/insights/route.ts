import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type CoachingClient, STATUS_ORDER, STATUS_LABELS } from "@/lib/coaching-types";
import { type StudentProgress } from "@/lib/coaching-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin" && session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const clientKeys = await kv.keys("sns:coaching:client:*");
  const clients = clientKeys.length
    ? (await Promise.all(clientKeys.map((k) => kv.get<CoachingClient>(k)))).filter(
        (c): c is CoachingClient => c !== null
      )
    : [];

  // Pipeline distribution
  const statusCounts: Record<string, number> = {};
  for (const s of STATUS_ORDER) statusCounts[s] = 0;
  for (const c of clients) {
    if (c.status in statusCounts) statusCounts[c.status]++;
  }
  const pipelineDistribution = STATUS_ORDER.map((s) => ({
    status: STATUS_LABELS[s],
    count: statusCounts[s],
  }));

  // Coach workload
  const coachMap: Record<string, number> = {};
  for (const c of clients) {
    const coach = c.coachAssigned ?? "Unassigned";
    coachMap[coach] = (coachMap[coach] ?? 0) + 1;
  }
  const coachWorkload = Object.entries(coachMap).map(([coach, count]) => ({ coach, count }));

  // Alumni conversion rate
  const alumni = clients.filter((c) => c.status === "alumni").length;
  const conversionRate = clients.length > 0 ? Math.round((alumni / clients.length) * 100) : 0;

  // Active students count
  const active = clients.filter((c) => c.status === "active").length;

  // Progress velocity — avg days per student (based on activeDate vs createdAt)
  const withDates = clients.filter((c) => c.activeDate && c.createdAt);
  const avgDaysToActive = withDates.length
    ? Math.round(
        withDates.reduce((sum, c) => {
          const diff = new Date(c.activeDate!).getTime() - new Date(c.createdAt).getTime();
          return sum + diff / (1000 * 60 * 60 * 24);
        }, 0) / withDates.length
      )
    : null;

  // Notes activity per student
  const progressKeys = clients.map((c) => `sns:progress:notes:${c.ghlContactId}`);
  const progressData = progressKeys.length
    ? await Promise.all(progressKeys.map((k) => kv.get<StudentProgress>(k)))
    : [];
  const totalNotes = progressData.reduce(
    (sum, p) => sum + (p?.notes.length ?? 0),
    0
  );

  return Response.json({
    totalStudents: clients.length,
    active,
    alumni,
    conversionRate,
    avgDaysToActive,
    totalNotes,
    pipelineDistribution,
    coachWorkload,
  });
}
