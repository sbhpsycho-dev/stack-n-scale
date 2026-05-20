import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { syncReplogToSheets } from "@/lib/sheets-sync";
import type { StaffMeta } from "@/lib/staff-registry";
import { BLANK, type Rep, type SalesData } from "@/lib/sales-data";

const STAFF_KV_KEY = "sns-staff-registry";

export type DailyEntry = {
  date: string; // YYYY-MM-DD
  callsMade: number;
  callsAnswered: number;
  demosSet: number;
  demosShowed: number;
  pitched: number;
  closed: number;
  cashCollected: number;
};

const replogKey = (clientId: string) => `sns-replog-${clientId}`;

async function updatePipelineFromReplogs(): Promise<void> {
  const staff = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  if (staff.length === 0) return;

  const thisYM = new Date().toISOString().slice(0, 7);

  // Team-wide totals (accumulated across all reps)
  let tCallsMade = 0, tCallsAnswered = 0, tDemosSet = 0, tDemosShowed = 0, tPitched = 0, tClosed = 0;

  // Leaderboard entries built from each rep's MTD replog data
  const leaderboard: Rep[] = [];

  await Promise.all(staff.map(async (s) => {
    const entries = (await kv.get<DailyEntry[]>(replogKey(s.id))) ?? [];
    const mtd = entries.filter(e => e.date.startsWith(thisYM));

    let callsMade = 0, callsAnswered = 0, demosSet = 0, demosShowed = 0, pitched = 0, closed = 0, cashCollected = 0;
    for (const e of mtd) {
      callsMade     += e.callsMade;
      callsAnswered += e.callsAnswered;
      demosSet      += e.demosSet;
      demosShowed   += e.demosShowed;
      pitched       += e.pitched;
      closed        += e.closed;
      cashCollected += e.cashCollected;
    }

    tCallsMade     += callsMade;
    tCallsAnswered += callsAnswered;
    tDemosSet      += demosSet;
    tDemosShowed   += demosShowed;
    tPitched       += pitched;
    tClosed        += closed;

    // Write personal dashboard KV so their main dashboard shows real numbers
    const answerRate = callsMade  > 0 ? parseFloat(((callsAnswered / callsMade)  * 100).toFixed(1)) : 0;
    const showRate   = demosSet   > 0 ? parseFloat(((demosShowed   / demosSet)   * 100).toFixed(1)) : 0;
    const closeRate  = demosShowed > 0 ? parseFloat(((closed       / demosShowed) * 100).toFixed(1)) : 0;

    const existing = (await kv.get<SalesData>(`sns-client-${s.id}`)) ?? BLANK;
    await kv.set(`sns-client-${s.id}`, {
      ...existing,
      dashboard: {
        ...existing.dashboard,
        cashCollectedMTD:     cashCollected,
        totalDealsClosedMTD:  closed,
      },
      pipeline: {
        ...existing.pipeline,
        callsMade, callsAnswered, demosSet, demosShowed, pitched, closed,
        answerRate, showRate, closeRate, demoToClose: closeRate,
      },
    });

    if (callsMade > 0 || demosSet > 0 || cashCollected > 0) {
      leaderboard.push({
        name:          s.name,
        callsMade,
        callsAnswered,
        demosSet,
        demosShowed,
        pitched,
        dealsClosed:   closed,
        cashCollected,
        answerRate,
      });
    }
  }));

  const cached = await kv.get<SalesData>("sns-dashboard-v1");
  if (!cached) return;

  const answerRate = tCallsMade   > 0 ? parseFloat(((tCallsAnswered / tCallsMade)   * 100).toFixed(1)) : 0;
  const showRate   = tDemosSet    > 0 ? parseFloat(((tDemosShowed   / tDemosSet)    * 100).toFixed(1)) : 0;
  const closeRate  = tDemosShowed > 0 ? parseFloat(((tClosed        / tDemosShowed) * 100).toFixed(1)) : 0;

  leaderboard.sort((a, b) => b.cashCollected - a.cashCollected);

  await kv.set("sns-dashboard-v1", {
    ...cached,
    pipeline: {
      ...cached.pipeline,
      callsMade:     tCallsMade,
      callsAnswered: tCallsAnswered,
      demosSet:      tDemosSet,
      demosShowed:   tDemosShowed,
      pitched:       tPitched,
      closed:        tClosed,
      answerRate, showRate, closeRate, demoToClose: closeRate,
    },
    reps: {
      ...cached.reps,
      leaderboard,
    },
  }, { ex: 21600 });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  if (target && session.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const id = session.user.role === "admin" && target
    ? target
    : session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const entries = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    return Response.json(entries);
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const entry = await req.json() as DailyEntry;
    const existing = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    // Replace entry for same date, or append
    const updated = existing.some(e => e.date === entry.date)
      ? existing.map(e => e.date === entry.date ? entry : e)
      : [entry, ...existing].sort((a, b) => b.date.localeCompare(a.date));
    await kv.set(replogKey(id), updated);

    // Sync to Google Sheets (fire-and-forget — don't fail the request if Sheets is unavailable)
    const staffName = session.user.name ?? "Staff";
    syncReplogToSheets(staffName, entry).catch(() => {});

    // Aggregate all staff replogs into sns-dashboard-v1 pipeline so admin sees updated numbers
    updatePipelineFromReplogs().catch(() => {});

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const { date } = await req.json() as { date: string };
    const existing = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    await kv.set(replogKey(id), existing.filter(e => e.date !== date));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
