import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { DailyEntry } from "@/app/api/replog/route";

const GHL_BASE = "https://services.leadconnectorhq.com";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const apiKey     = process.env.GHL_API_KEY     ?? "";
  const locationId = process.env.GHL_LOCATION_ID ?? "";
  const userName   = session.user.name ?? "";
  const userId     = session.user.role === "admin" ? "admin" : (session.user.clientId ?? "");

  // MTD call counts from replog (GHL has no call-tracking data)
  const replogEntries = (await kv.get<DailyEntry[]>(`sns-replog-${userId}`)) ?? [];
  const thisYM = new Date().toISOString().slice(0, 7);
  const { callsMade, callsAnswered } = replogEntries
    .filter(e => e.date.startsWith(thisYM))
    .reduce(
      (acc, e) => ({
        callsMade:     acc.callsMade     + e.callsMade,
        callsAnswered: acc.callsAnswered + e.callsAnswered,
      }),
      { callsMade: 0, callsAnswered: 0 }
    );

  const blank = {
    callsMade, callsAnswered,
    demosSet: 0, demosShowed: 0, pitched: 0, closed: 0, cashCollected: 0,
    answerRate: 0, showRate: 0, closeRate: 0, demoToClose: 0,
    stageBreakdown: [] as { stage: string; count: number }[],
  };

  if (!apiKey || !locationId || !userName) return Response.json(blank);

  const ghlHeaders = { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28" };
  const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Build stage ID → name map
  const stageNameMap: Record<string, string> = {};
  try {
    const res = await fetch(
      `${GHL_BASE}/opportunities/pipelines?locationId=${locationId}`,
      { headers: ghlHeaders }
    );
    const data = await res.json();
    const pipelines: { stages?: { id: string; name: string }[] }[] = data?.pipelines ?? [];
    pipelines.forEach(p => (p.stages ?? []).forEach(s => { stageNameMap[s.id] = s.name; }));
  } catch { /* non-fatal — fall back to raw status */ }

  // Fetch this month's opportunities
  let allOpps: {
    status?: string;
    assignedTo?: string;
    monetaryValue?: number;
    pipelineStageId?: string;
  }[] = [];
  try {
    const res = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${locationId}&date=${since}&limit=100`,
      { headers: ghlHeaders }
    );
    const data = await res.json();
    allOpps = data?.opportunities ?? [];
  } catch { return Response.json(blank); }

  // Filter to this staff member's opportunities (first-name prefix match, case-insensitive)
  const firstNameLower = userName.trim().toLowerCase().split(" ")[0];
  const myOpps = allOpps.filter(
    o => (o.assignedTo ?? "").trim().toLowerCase().startsWith(firstNameLower)
  );

  // Fuzzy stage matching — same keywords used in syncGHL
  const stageCount = (keywords: string[]) =>
    myOpps.filter(o => {
      const name = ((o.pipelineStageId && stageNameMap[o.pipelineStageId]) ?? o.status ?? "").toLowerCase();
      return keywords.some(k => name.includes(k));
    }).length;

  const demosSet    = stageCount(["demo set", "booked", "appointment"]);
  const demosShowed = stageCount(["demo showed", "showed", "show"]);
  const pitched     = stageCount(["pitched", "pitch", "presented"]);
  const wonOpps     = myOpps.filter(o => o.status === "won");
  const closed      = wonOpps.length;
  const cashCollected = wonOpps.reduce((sum, o) => sum + (o.monetaryValue ?? 0), 0);

  const answerRate = callsMade   > 0 ? parseFloat(((callsAnswered / callsMade)  * 100).toFixed(1)) : 0;
  const showRate   = demosSet    > 0 ? parseFloat(((demosShowed   / demosSet)   * 100).toFixed(1)) : 0;
  const closeRate  = demosShowed > 0 ? parseFloat(((closed        / demosShowed)* 100).toFixed(1)) : 0;

  return Response.json({
    callsMade, callsAnswered,
    demosSet, demosShowed, pitched, closed, cashCollected,
    answerRate, showRate, closeRate, demoToClose: closeRate,
    stageBreakdown: [],
  });
}
