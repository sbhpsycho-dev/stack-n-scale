import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type CoachingClient, STATUS_LABELS, STATUS_ORDER } from "@/lib/coaching-types";

const HEALTH_SCORES: Record<string, number> = {
  payment_received:    20,
  id_pending:          25,
  id_pending_review:   35,
  id_verified:         45,
  onboarding_form_sent: 55,
  onboarding_complete: 65,
  coach_assigned:      75,
  kickoff_booked:      85,
  active:             100,
  alumni:              100,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const keys = await kv.keys("sns:coaching:client:*");
  const clients: CoachingClient[] = keys.length
    ? (await Promise.all(keys.map(k => kv.get<CoachingClient>(k)))).filter((c): c is CoachingClient => c !== null)
    : [];

  const rows = clients
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(c => ({
      name:        c.name,
      email:       c.email,
      status:      STATUS_LABELS[c.status] ?? c.status,
      healthScore: HEALTH_SCORES[c.status] ?? 0,
      createdAt:   c.createdAt,
      activeDate:  c.activeDate ?? null,
      coach:       c.coachAssigned ?? null,
    }));

  const active   = rows.filter(r => r.status === STATUS_LABELS["active"]).length;
  const churned  = rows.filter(r => r.status === STATUS_LABELS["alumni"]).length;
  const pipeline = rows.length - active - churned;
  const avgHealth = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.healthScore, 0) / rows.length)
    : 0;

  // Status distribution for pipeline chart
  const statusCounts: Record<string, number> = {};
  for (const s of STATUS_ORDER) statusCounts[s] = 0;
  for (const c of clients) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  const distribution = STATUS_ORDER.map(s => ({ status: STATUS_LABELS[s], count: statusCounts[s] }));

  return Response.json({ rows, active, churned, pipeline, avgHealth, distribution });
}
