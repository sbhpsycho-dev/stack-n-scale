import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BLANK, type SalesData, type Rep } from "@/lib/sales-data";
import { STAFF_KV_KEY, type StaffMeta } from "@/lib/staff-registry";
import type { DailyEntry } from "@/app/api/replog/route";

const ADMIN_KEY = "sns-dashboard-v1";
const clientKey = (id: string) => `sns-client-${id}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const isAdminLike = session.user.role === "admin" || session.user.role === "sales_exec";
  if (target && !isAdminLike) return new Response("Forbidden", { status: 403 });
  const key =
    isAdminLike && target ? clientKey(target)
    : isAdminLike          ? ADMIN_KEY
    :                        clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const raw = ((await kv.get(key)) ?? BLANK) as SalesData;

    // Aggregate main KPIs live from staff replog entries — no GHL dependency
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-06"
    const currentYear  = new Date().toISOString().slice(0, 4); // "2026"
    const staffList    = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
    const replogArrays = await Promise.all(
      staffList.map(s =>
        kv.get<DailyEntry[]>(`sns-replog-${s.id}`).then(r => r ?? [])
      )
    );
    const allEntries  = replogArrays.flat();
    const mtdEntries  = allEntries.filter(e => e.date.startsWith(currentMonth));
    const ytdEntries  = allEntries.filter(e => e.date.startsWith(currentYear));

    function toIsoWeek(dateStr: string): string {
      const d = new Date(dateStr + "T00:00:00Z");
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const wk = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
    }

    type WeekBucket = { callsMade: number; callsAnswered: number; demosSet: number; demosShowed: number; pitched: number; closed: number };
    const weekMap = new Map<string, WeekBucket>();
    for (const e of allEntries) {
      const wk = toIsoWeek(e.date);
      const cur = weekMap.get(wk) ?? { callsMade: 0, callsAnswered: 0, demosSet: 0, demosShowed: 0, pitched: 0, closed: 0 };
      weekMap.set(wk, {
        callsMade:     cur.callsMade     + (e.callsMade     ?? 0),
        callsAnswered: cur.callsAnswered + (e.callsAnswered ?? 0),
        demosSet:      cur.demosSet      + (e.demosSet      ?? 0),
        demosShowed:   cur.demosShowed   + (e.demosShowed   ?? 0),
        pitched:       cur.pitched       + (e.pitched       ?? 0),
        closed:        cur.closed        + (e.closed        ?? 0),
      });
    }
    const liveFunnelByWeek = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, v]) => ({ week, ...v }));

    const liveCash  = mtdEntries.reduce((s, e) => s + (e.cashCollected ?? 0), 0);
    const liveDeals = mtdEntries.reduce((s, e) => s + (e.closed       ?? 0), 0);
    const liveLeads = mtdEntries.reduce((s, e) => s + (e.demosSet     ?? 0), 0);
    const liveYTD   = ytdEntries.reduce((s, e) => s + (e.cashCollected ?? 0), 0);

    // Build per-rep live leaderboard from replog entries
    const liveLeaderboard: Rep[] = staffList
      .map((s, i) => {
        const entries = replogArrays[i].filter(e => e.date.startsWith(currentMonth));
        if (!entries.length) return null;
        const callsMade     = entries.reduce((sum, e) => sum + (e.callsMade     ?? 0), 0);
        const callsAnswered = entries.reduce((sum, e) => sum + (e.callsAnswered ?? 0), 0);
        const demosSet      = entries.reduce((sum, e) => sum + (e.demosSet      ?? 0), 0);
        const demosShowed   = entries.reduce((sum, e) => sum + (e.demosShowed   ?? 0), 0);
        const pitched       = entries.reduce((sum, e) => sum + (e.pitched       ?? 0), 0);
        const dealsClosed   = entries.reduce((sum, e) => sum + (e.closed        ?? 0), 0);
        const cashCollected = entries.reduce((sum, e) => sum + (e.cashCollected ?? 0), 0);
        const answerRate    = callsMade > 0 ? parseFloat((callsAnswered / callsMade * 100).toFixed(1)) : 0;
        return { name: s.name, callsMade, callsAnswered, demosSet, demosShowed, pitched, dealsClosed, cashCollected, answerRate };
      })
      .filter((r): r is Rep => r !== null)
      .sort((a, b) => b.cashCollected - a.cashCollected);

    const topRepCash   = liveLeaderboard[0]?.cashCollected ?? 0;
    const totalDealsL  = liveLeaderboard.reduce((s, r) => s + r.dealsClosed, 0);
    const totalCashL   = liveLeaderboard.reduce((s, r) => s + r.cashCollected, 0);
    const totalShowedL = liveLeaderboard.reduce((s, r) => s + r.demosShowed, 0);
    const totalSetL    = liveLeaderboard.reduce((s, r) => s + r.demosSet, 0);
    const avgDealSize  = totalDealsL  > 0 ? Math.round(totalCashL   / totalDealsL)   : 0;
    const closeRatePct = totalShowedL > 0 ? parseFloat((totalDealsL / totalShowedL * 100).toFixed(1)) : 0;
    const showRatePct  = totalSetL    > 0 ? parseFloat((totalShowedL / totalSetL  * 100).toFixed(1)) : 0;

    return Response.json({
      ...raw,
      _syncedMonth: currentMonth,
      dashboard: {
        ...raw.dashboard,
        cashCollectedMTD:    Math.round(liveCash),
        totalDealsClosedMTD: liveDeals,
        leadsThisMonth:      liveLeads,
        cashCollectedYTD:    Math.round(liveYTD),
      },
      reps: liveLeaderboard.length ? {
        ...raw.reps,
        leaderboard:  liveLeaderboard,
        topRepCash,
        avgDealSize,
        closeRatePct,
        showRatePct,
      } : raw.reps,
      pipeline: {
        ...(raw.pipeline ?? {}),
        funnelByWeek: liveFunnelByWeek.length ? liveFunnelByWeek : (raw.pipeline?.funnelByWeek ?? []),
      },
    });
  } catch {
    return Response.json(BLANK);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.user.role === "sales_exec") return new Response("Forbidden", { status: 403 });

  const target = new URL(req.url).searchParams.get("target");
  if (target && session.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const key = session.user.role === "admin" && target
    ? clientKey(target)
    : session.user.role === "admin"
    ? ADMIN_KEY
    : clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const body = await req.json();
    const month = new Date().toISOString().slice(0, 7);
    await kv.set(key, { ...body, _syncedMonth: month });
    return Response.json({ ok: true, persisted: true });
  } catch {
    return Response.json({ ok: false, persisted: false });
  }
}
