import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type SalesData, BLANK } from "@/lib/sales-data";
import { getSheetsToken, sheetsGet } from "@/lib/sheets-sync";

const SETTER_KPI_ID = process.env.GOOGLE_SHEETS_SETTER_KPI_ID ?? "1mASm-QAFu7gMIH23fG1Qb_TdBec_ZCgc2Ymsriwqf2E";
const MASTER_LOG_ID = process.env.GOOGLE_SHEETS_MASTER_LOG_ID ?? "1IytiWU-JosLSQp2CXPJp18i_sLzzJpa9VhBBqMLvzjc";

function parseSheetDate(raw: string): { year: string; ym: string } | null {
  // MM/DD/YYYY (format written by sync script)
  const a = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (a) return { year: a[3], ym: `${a[3]}-${a[1].padStart(2, "0")}` };
  // YYYY-MM-DD fallback
  const b = raw.match(/^(\d{4})-(\d{2})/);
  if (b) return { year: b[1], ym: `${b[1]}-${b[2]}` };
  return null;
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const now     = new Date();
  const thisY   = String(now.getFullYear());
  const thisYM  = ymOf(now);
  const prevYM  = ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prev2YM = ymOf(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const prev3YM = ymOf(new Date(now.getFullYear(), now.getMonth() - 3, 1));

  // ── 1. Setter KPI Daily Log → MTD leaderboard + pipeline ─────────────────────
  let setterRows: string[][] | null = null;
  try {
    const token = await getSheetsToken();
    for (const tab of ["Daily Log", "Sheet1"]) {
      try {
        const res = await sheetsGet(token, SETTER_KPI_ID, `${tab}!A1:Z`);
        if (res.values && res.values.length >= 2) { setterRows = res.values as string[][]; break; }
      } catch { continue; }
    }
  } catch { /* sheet unavailable */ }

  type RepAgg = { cash: number; calls: number; answered: number; dSet: number; dShow: number; closed: number };
  const repMapMTD = new Map<string, RepAgg>();
  const HEADER_LABELS = new Set(["name", "setter name", "setter", "settername"]);
  let pipeCallsMTD = 0, pipeAnswMTD = 0, pipeDSetMTD = 0, pipeDShowMTD = 0, pipeClosedMTD = 0;

  if (setterRows) {
    const headers   = setterRows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
    const col       = (n: string) => headers.indexOf(n);
    const dateIdx   = col("date");
    const nameIdx   = col("settername") >= 0 ? col("settername") : col("setter") >= 0 ? col("setter") : col("name") >= 0 ? col("name") : 1;
    const cashIdx   = col("cashcollected") >= 0 ? col("cashcollected") : col("grosscollected($)") >= 0 ? col("grosscollected($)") : col("grossdealvalue($)") >= 0 ? col("grossdealvalue($)") : col("grossdealvalue") >= 0 ? col("grossdealvalue") : col("grosscollected");
    const dSetIdx   = col("demosset") >= 0 ? col("demosset") : col("zoomsbooked");
    const dShowIdx  = col("demosshowed") >= 0 ? col("demosshowed") : col("showedups") >= 0 ? col("showedups") : col("zoomsshowed");
    const closedIdx = col("dealsclosed") >= 0 ? col("dealsclosed") : col("closed");
    const callsIdx  = col("callsmade") >= 0 ? col("callsmade") : col("callsdialed");
    const answIdx   = col("callsanswered") >= 0 ? col("callsanswered") : col("callsconnected");
    const ps        = (row: string[], i: number) => i >= 0 ? parseFloat((row[i] ?? "0").replace(/[$,]/g, "")) || 0 : 0;

    for (const row of setterRows.slice(1) as string[][]) {
      const name = row[nameIdx]?.trim() ?? "";
      if (!name || HEADER_LABELS.has(name.toLowerCase())) continue;
      const rawDate = dateIdx >= 0 ? (row[dateIdx]?.trim() ?? "") : "";
      const parsed  = rawDate ? parseSheetDate(rawDate) : null;
      if (parsed && parsed.ym !== thisYM) continue; // MTD only

      const cash = ps(row, cashIdx), dSet = ps(row, dSetIdx), dShow = ps(row, dShowIdx);
      const closed = ps(row, closedIdx), calls = ps(row, callsIdx), answ = ps(row, answIdx);

      pipeCallsMTD += calls; pipeAnswMTD += answ; pipeDSetMTD += dSet;
      pipeDShowMTD += dShow; pipeClosedMTD += closed;

      const prev = repMapMTD.get(name) ?? { cash: 0, calls: 0, answered: 0, dSet: 0, dShow: 0, closed: 0 };
      repMapMTD.set(name, {
        cash:     prev.cash     + cash,
        calls:    prev.calls    + calls,
        answered: prev.answered + answ,
        dSet:     prev.dSet     + dSet,
        dShow:    prev.dShow    + dShow,
        closed:   prev.closed   + closed,
      });
    }
  }

  const leaderboard: SalesData["reps"]["leaderboard"] = Array.from(repMapMTD.entries()).map(([name, s]) => ({
    name,
    cashCollected: s.cash,
    callsMade:     s.calls,
    callsAnswered: s.answered,
    demosSet:      s.dSet,
    demosShowed:   s.dShow,
    pitched:       s.dShow,
    dealsClosed:   s.closed,
    answerRate:    s.calls > 0 ? parseFloat(((s.answered / s.calls) * 100).toFixed(1)) : 0,
  }));

  const answerRate  = pipeCallsMTD > 0 ? parseFloat(((pipeAnswMTD  / pipeCallsMTD)  * 100).toFixed(1)) : 0;
  const showRate    = pipeDSetMTD  > 0 ? parseFloat(((pipeDShowMTD / pipeDSetMTD)   * 100).toFixed(1)) : 0;
  const closeRate   = pipeDShowMTD > 0 ? parseFloat(((pipeClosedMTD / pipeDShowMTD) * 100).toFixed(1)) : 0;
  const repCashTotal = leaderboard.reduce((s, r) => s + r.cashCollected, 0);
  const topRepCash  = leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.cashCollected)) : 0;
  const avgDealSize = pipeClosedMTD > 0 ? parseFloat((repCashTotal / pipeClosedMTD).toFixed(0)) : 0;

  // ── 2. Master Log Deal Log → revenue metrics ──────────────────────────────────
  let dealRows: string[][] | null = null;
  try {
    const token2 = await getSheetsToken();
    const res2   = await sheetsGet(token2, MASTER_LOG_ID, "Deal Log!A2:G1001");
    if (res2.values && res2.values.length >= 1) dealRows = res2.values as string[][];
  } catch { /* unavailable — skip revenue patch */ }

  let cashMTD = 0, cashLastMonth = 0, cashYTD = 0, dealsMTD = 0, netMTD = 0;
  const byDate    = new Map<string, number>();
  const byProc    = new Map<string, number>();
  const byProduct = new Map<string, number>();
  const last3     = new Map<string, number>();
  const pd = (row: string[], i: number) => parseFloat((row[i] ?? "").replace(/[$,]/g, "")) || 0;

  if (dealRows) {
    for (const row of dealRows as string[][]) {
      const rawDate = row[0]?.trim() ?? "";
      const parsed  = parseSheetDate(rawDate);
      if (!parsed || !rawDate) continue;

      const gross = pd(row, 3); // col D — Gross Amount
      const net   = pd(row, 6); // col G — Net After Fees
      const proc  = row[4]?.trim() || "Other"; // col E — Processor
      const offer = row[2]?.trim() || "Other"; // col C — Offer

      if (parsed.year === thisY) cashYTD += gross;
      if ([prevYM, prev2YM, prev3YM].includes(parsed.ym)) last3.set(parsed.ym, (last3.get(parsed.ym) ?? 0) + gross);

      // Revenue over time = all deals
      byDate.set(rawDate, (byDate.get(rawDate) ?? 0) + gross);

      if (parsed.ym === thisYM) {
        cashMTD  += gross;
        netMTD   += net;
        dealsMTD += 1;
        byProc.set(proc,    (byProc.get(proc)    ?? 0) + net);
        byProduct.set(offer, (byProduct.get(offer) ?? 0) + net);
      } else if (parsed.ym === prevYM) {
        cashLastMonth += gross;
      }
    }
  }

  const mrr = last3.size > 0
    ? parseFloat((Array.from(last3.values()).reduce((s, v) => s + v, 0) / 3).toFixed(2))
    : 0;

  // ── 3. Safe patch — only update what we computed, leave everything else ────────
  const current = (await kv.get<SalesData>("sns-dashboard-v1")) ?? { ...BLANK };
  if (!current.dashboard) current.dashboard = { ...BLANK.dashboard };
  if (!current.reps)      current.reps      = { ...BLANK.reps };
  if (!current.pipeline)  current.pipeline  = { ...BLANK.pipeline };

  // Leaderboard + pipeline (from setter sheet)
  current.reps.leaderboard      = leaderboard;
  current.reps.topRepCash       = topRepCash;
  current.reps.avgDealSize      = avgDealSize;
  current.reps.dealClose        = pipeClosedMTD;
  current.reps.callsMadeWeek    = pipeCallsMTD;
  current.reps.cashCollectedWeek = repCashTotal;
  current.reps.showRatePct      = showRate;
  current.reps.closeRatePct     = closeRate;
  current.reps.rateOf           = answerRate;
  current.reps.closeRateWeek    = closeRate;
  current.pipeline.callsMade    = pipeCallsMTD;
  current.pipeline.callsAnswered = pipeAnswMTD;
  current.pipeline.demosSet     = pipeDSetMTD;
  current.pipeline.demosShowed  = pipeDShowMTD;
  current.pipeline.pitched      = pipeDShowMTD;
  current.pipeline.closed       = pipeClosedMTD;
  current.pipeline.answerRate   = answerRate;
  current.pipeline.showRate     = showRate;
  current.pipeline.closeRate    = closeRate;
  current.pipeline.demoToClose  = closeRate;

  // Revenue metrics (from deal log — only patch if sheet was readable)
  if (dealRows) {
    current.dashboard.cashCollectedMTD       = cashMTD;
    current.dashboard.cashCollectedLastMonth = cashLastMonth;
    current.dashboard.totalDealsClosedMTD   = dealsMTD;
    current.dashboard.netRevenueMTD         = netMTD;
    current.dashboard.mrr                   = mrr;
    current.dashboard.revenueOverTime        = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
    current.dashboard.netByProcessor = Array.from(byProc.entries()).map(([name, amount]) => ({ name, amount }));
    current.dashboard.netByProduct   = Array.from(byProduct.entries()).map(([name, amount]) => ({ name, amount }));
  }
  current.dashboard.cashCollectedYTD = cashYTD;

  await kv.set("sns-dashboard-v1", current, { ex: 21600 });

  return Response.json({
    ok:              true,
    leaderboardCount: leaderboard.length,
    cashMTD,
    cashYTD,
    dealsMTD,
    dealRowsRead:    dealRows?.length ?? 0,
  });
}
