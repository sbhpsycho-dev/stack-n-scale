import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type CoachingClient, type StudentProgress, STATUS_LABELS, STATUS_ORDER } from "@/lib/coaching-types";
import type { Deal } from "@/lib/deal-types";

const HEALTH_SCORES: Record<string, number> = {
  payment_received:     20,
  id_pending:           25,
  id_pending_review:    35,
  id_verified:          45,
  onboarding_form_sent: 55,
  onboarding_complete:  65,
  coach_assigned:       75,
  kickoff_booked:       85,
  active:              100,
  alumni:              100,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Load clients, deals, and progress notes in parallel
  const [clientKeys, dealIndex, noteKeys] = await Promise.all([
    kv.keys("sns:coaching:client:*"),
    kv.get<string[]>("sns:deals:index"),
    kv.keys("sns:progress:notes:*"),
  ]);

  const [clients, deals, notes] = await Promise.all([
    clientKeys.length
      ? Promise.all(clientKeys.map(k => kv.get<CoachingClient>(k))).then(r => r.filter((c): c is CoachingClient => c !== null))
      : Promise.resolve([] as CoachingClient[]),
    (dealIndex ?? []).length
      ? Promise.all((dealIndex ?? []).map(id => kv.get<Deal>(`sns:deals:${id}`))).then(r => r.filter((d): d is Deal => d !== null))
      : Promise.resolve([] as Deal[]),
    noteKeys.length
      ? Promise.all(noteKeys.map(k => kv.get<StudentProgress>(k))).then(r => r.filter((n): n is StudentProgress => n !== null))
      : Promise.resolve([] as StudentProgress[]),
  ]);

  // Index deals by lowercased client name
  const dealsByName = new Map<string, Deal[]>();
  for (const deal of deals) {
    const key = deal.clientName.toLowerCase();
    const arr = dealsByName.get(key) ?? [];
    arr.push(deal);
    dealsByName.set(key, arr);
  }

  // Index last check-in date by ghlContactId
  const lastCheckIn = new Map<string, string>();
  for (const n of notes) {
    lastCheckIn.set(n.ghlContactId, n.lastUpdated);
  }

  // Current month boundaries (YYYY-MM-DD)
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;

  const rows = clients
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(c => {
      const clientDeals = dealsByName.get(c.name.toLowerCase()) ?? [];

      const cashMTD = clientDeals
        .filter(d => d.date >= monthStart && d.date <= monthEnd)
        .reduce((s, d) => s + d.grossAmount, 0);

      const revShareOwed = clientDeals
        .filter(d => d.payoutStatus === "pending")
        .reduce((s, d) => s + d.payouts.setter + d.payouts.closer, 0);

      const revShareTotal = clientDeals
        .reduce((s, d) => s + d.payouts.setter + d.payouts.closer, 0);

      const dealGross = clientDeals.length > 0
        ? clientDeals.reduce((s, d) => s + d.grossAmount, 0)
        : null;

      const reportedIncome = c.reportedIncome ?? null;
      const roiStat = (reportedIncome !== null && dealGross !== null && dealGross > 0)
        ? Math.round((reportedIncome / dealGross) * 10) / 10
        : null;

      return {
        id:             c.ghlContactId,
        name:           c.name,
        email:          c.email,
        status:         STATUS_LABELS[c.status] ?? c.status,
        healthScore:    HEALTH_SCORES[c.status] ?? 0,
        createdAt:      c.createdAt,
        activeDate:     c.activeDate ?? null,
        coach:          c.coachAssigned ?? null,
        cashMTD,
        lastCheckIn:    lastCheckIn.get(c.ghlContactId) ?? null,
        revShareOwed,
        revShareTotal,
        dealGross,
        reportedIncome,
        roiStat,
      };
    });

  const active   = rows.filter(r => r.status === STATUS_LABELS["active"]).length;
  const churned  = rows.filter(r => r.status === STATUS_LABELS["alumni"]).length;
  const pipeline = rows.length - active - churned;
  const avgHealth = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.healthScore, 0) / rows.length)
    : 0;

  const statusCounts: Record<string, number> = {};
  for (const s of STATUS_ORDER) statusCounts[s] = 0;
  for (const c of clients) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
  const distribution = STATUS_ORDER.map(s => ({ status: STATUS_LABELS[s], count: statusCounts[s] }));

  return Response.json({ rows, active, churned, pipeline, avgHealth, distribution });
}
