import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type SalesData, BLANK } from "@/lib/sales-data";
import { getSheetsToken, sheetsGet, ingestSetterKPISheet, updatePipelineFromReplogs, bumpPipelineVersion } from "@/lib/sheets-sync";
import { STAFF_KV_KEY, type StaffMeta } from "@/lib/staff-registry";
import { calculatePayouts } from "@/lib/payout-calc";
import type { Deal } from "@/lib/deal-types";

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

function isoDate(raw: string): string | null {
  const a = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (a) return `${a[3]}-${a[1].padStart(2, "0")}-${a[2].padStart(2, "0")}`;
  const b = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (b) return `${b[1]}-${b[2]}-${b[3]}`;
  return null;
}

const parseMoney = (s: string) => parseFloat((s ?? "0").replace(/[$,]/g, "")) || 0;

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

  // ── 0. Sync individual rep sheets → sns:deals:index ─────────────────────────
  let repSheetDeals = 0;
  try {
    const staffList = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
    const repsWithSheets = staffList.filter(r => r.sheetId);
    if (repsWithSheets.length > 0) {
      const token0 = await getSheetsToken();
      const newDealIds: string[] = [];

      for (const rep of repsWithSheets) {
        try {
          const res = await sheetsGet(token0, rep.sheetId!, "A:F");
          const rows = (res.values ?? []) as string[][];
          for (const row of rows) {
            const rawDate = (row[0] ?? "").trim();
            if (!rawDate || rawDate.toLowerCase() === "date") continue;
            const date = isoDate(rawDate);
            if (!date) continue;
            const gross = parseMoney(row[2] ?? "");
            if (gross <= 0) continue;
            const clientName = (row[1] ?? "Unknown").trim();
            const role = (row[4] ?? "").trim().toLowerCase();
            const slug = clientName.toLowerCase().replace(/\W+/g, "-").replace(/-+$/, "").slice(0, 30);
            const dealId = `rep-${rep.id}-${date}-${slug}`;
            if (await kv.get(`sns:deals:${dealId}`)) continue;
            const processorFee = parseFloat((gross * 0.029 + 0.30).toFixed(2));
            const deal: Deal = {
              id:           dealId,
              date,
              clientName,
              offer:        gross >= 8000 ? "10K" : "5K",
              grossAmount:  gross,
              processor:    "stripe",
              processorFee,
              netAmount:    parseFloat((gross - processorFee).toFixed(2)),
              leadSource:   "ad",
              dmSetter:     null,
              setter:       role.includes("setter") ? rep.name : null,
              closer:       role.includes("closer") ? rep.name : null,
              payouts:      {} as Deal["payouts"],
              payoutStatus: "pending",
              notes:        "",
            };
            deal.payouts = calculatePayouts(deal);
            await kv.set(`sns:deals:${dealId}`, deal);
            newDealIds.push(dealId);
            repSheetDeals++;
          }
        } catch (e) {
          console.error(`Rep sheet sync failed for ${rep.name}:`, e);
        }
      }

      if (newDealIds.length > 0) {
        const existingIdx = (await kv.get<string[]>("sns:deals:index")) ?? [];
        const merged = [...new Set([...newDealIds, ...existingIdx])];
        await kv.set("sns:deals:index", merged);
      }
    }
  } catch (e) {
    console.error("Phase 0 rep sheet sync error:", e);
  }

  // ── 1. Setter KPI Daily Log → MTD leaderboard + pipeline ─────────────────────
  let setterRows: string[][] | null = null;
  let sheetsError: string | null = null;
  try {
    const token = await getSheetsToken();
    for (const tab of ["Leaderboard", "Weekly Summary", "Daily Log", "Sheet1"]) {
      try {
        const res = await sheetsGet(token, SETTER_KPI_ID, `${tab}!A1:Z`);
        if (res.values && res.values.length >= 2) { setterRows = res.values as string[][]; break; }
      } catch { continue; }
    }
  } catch (e) {
    sheetsError = e instanceof Error ? e.message : String(e);
  }

  type RepAgg = { cash: number; calls: number; answered: number; dSet: number; dShow: number; closed: number };
  const repMapMTD = new Map<string, RepAgg>();
  const HEADER_LABELS = new Set(["name", "setter name", "setter", "settername"]);
  let pipeCallsMTD = 0, pipeAnswMTD = 0, pipeDSetMTD = 0, pipeDShowMTD = 0, pipeClosedMTD = 0;

  if (setterRows) {
    // Find first data row (cell 0 is a date) — skips merged title rows
    let dataStartIdx = 1;
    for (let i = 0; i < Math.min(5, setterRows.length); i++) {
      const c0 = (setterRows[i][0] ?? "").trim();
      if (c0.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) || c0.match(/^\d{4}-\d{2}-\d{2}/)) {
        dataStartIdx = i;
        break;
      }
    }
    // Use row just before data as header (if it exists), else empty
    const maybeHeader = dataStartIdx > 0 ? (setterRows[dataStartIdx - 1] ?? []) : [];
    const headers   = maybeHeader.map((h: string) => (h ?? "").trim().toLowerCase().replace(/\s+/g, ""));
    const col       = (n: string) => headers.indexOf(n);
    // Named lookup first, positional fallback to confirmed sheet layout
    const dateIdx   = col("date")          >= 0 ? col("date")          : 0;
    const nameIdx   = col("settername")    >= 0 ? col("settername")    : col("setter") >= 0 ? col("setter") : col("name") >= 0 ? col("name") : 1;
    const callsIdx  = col("callsmade")     >= 0 ? col("callsmade")     : col("callsdialed")    >= 0 ? col("callsdialed")    : 2;
    const answIdx   = col("callsanswered") >= 0 ? col("callsanswered") : col("callsconnected") >= 0 ? col("callsconnected") : 3;
    const dSetIdx   = col("demosset")      >= 0 ? col("demosset")      : col("zoomsbooked")    >= 0 ? col("zoomsbooked")    : 6;
    const dShowIdx  = col("demosshowed")   >= 0 ? col("demosshowed")   : col("showedups")      >= 0 ? col("showedups")      : col("zoomsshowed") >= 0 ? col("zoomsshowed") : 7;
    const closedIdx = col("dealsclosed")   >= 0 ? col("dealsclosed")   : col("closed")         >= 0 ? col("closed")         : 10;
    const cashIdx   = col("cashcollected") >= 0 ? col("cashcollected")
                    : col("grosscollected($)") >= 0 ? col("grosscollected($)")
                    : col("grossdealvalue($)") >= 0 ? col("grossdealvalue($)")
                    : col("grossdealvalue")    >= 0 ? col("grossdealvalue")
                    : col("grosscollected")    >= 0 ? col("grosscollected") : 11;
    const ps        = (row: string[], i: number) => i >= 0 ? parseFloat((row[i] ?? "0").replace(/[$,]/g, "")) || 0 : 0;

    for (const row of setterRows.slice(dataStartIdx) as string[][]) {
      const name = row[nameIdx]?.trim() ?? "";
      if (!name || HEADER_LABELS.has(name.toLowerCase())) continue;
      const rawDate = (row[dateIdx]?.trim() ?? "");
      const parsed  = rawDate ? parseSheetDate(rawDate) : null;
      if (!parsed || parsed.ym !== thisYM) continue; // MTD only, skip undated rows

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

  const answerRate = pipeCallsMTD > 0 ? parseFloat(((pipeAnswMTD / pipeCallsMTD) * 100).toFixed(1)) : 0;

  // ── 1b. GHL Opportunities → pipeline + leaderboard (fills zeros when sheet empty) ──
  let ghlDSet = 0, ghlDShow = 0, ghlPitch = 0, ghlClosed = 0;
  let ghlCloseRate = 0, ghlShowRate = 0;
  let ghlPipelineUsed = false;
  const ghlRepMap = new Map<string, { cash: number; closed: number }>();

  const GHL_KEY = process.env.GHL_API_KEY ?? "";
  const GHL_LOC = process.env.GHL_LOCATION_ID ?? "";

  if (GHL_KEY && GHL_LOC) {
    try {
      const ghlHeaders = { Authorization: `Bearer ${GHL_KEY}`, Version: "2021-07-28" };
      const sinceISO   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const stageNameMap: Record<string, string> = {};
      try {
        const pipRes  = await fetch(`https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${GHL_LOC}`, { headers: ghlHeaders });
        const pipData = await pipRes.json();
        for (const p of (pipData?.pipelines ?? [])) {
          for (const s of (p.stages ?? [])) stageNameMap[s.id] = s.name;
        }
      } catch { /* non-fatal */ }

      const oppsRes  = await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOC}&date=${sinceISO}&limit=100`, { headers: ghlHeaders });
      const oppsData = await oppsRes.json();
      const opps: { status?: string; assignedTo?: string; monetaryValue?: number; pipelineStageId?: string }[] = oppsData?.opportunities ?? [];

      if (opps.length > 0) {
        const sn = (o: typeof opps[0]) =>
          ((o.pipelineStageId && stageNameMap[o.pipelineStageId]) ?? o.status ?? "").toLowerCase();
        const sc = (keywords: string[]) => opps.filter(o => keywords.some(k => sn(o).includes(k))).length;

        ghlDSet   = sc(["demo set", "booked", "appointment"]);
        ghlDShow  = sc(["demo showed", "showed", "show"]);
        ghlPitch  = sc(["pitched", "pitch", "presented"]);
        const wonOpps = opps.filter(o => o.status === "won");
        ghlClosed     = wonOpps.length;
        ghlCloseRate  = opps.length > 0 ? parseFloat(((ghlClosed / opps.length) * 100).toFixed(1)) : 0;
        ghlShowRate   = ghlDSet > 0     ? parseFloat(((ghlDShow  / ghlDSet)     * 100).toFixed(1)) : 0;

        for (const o of wonOpps) {
          const rep  = (o.assignedTo ?? "Unassigned").trim();
          const prev = ghlRepMap.get(rep) ?? { cash: 0, closed: 0 };
          ghlRepMap.set(rep, { cash: prev.cash + (o.monetaryValue ?? 0), closed: prev.closed + 1 });
        }
        ghlPipelineUsed = true;
      }
    } catch (e) {
      console.error("Phase 1b GHL pipeline sync error:", e);
    }
  }

  // Merge sheet + GHL: sheet wins where non-zero, GHL fills zeros
  const mergedDSet   = pipeDSetMTD   || ghlDSet;
  const mergedDShow  = pipeDShowMTD  || ghlDShow;
  const mergedPitch  = pipeDShowMTD  || ghlPitch;
  const mergedClosed = pipeClosedMTD || ghlClosed;
  const showRate     = mergedDSet  > 0 ? parseFloat(((mergedDShow  / mergedDSet)  * 100).toFixed(1)) : ghlShowRate;
  const closeRate    = mergedDShow > 0 ? parseFloat(((mergedClosed / mergedDShow) * 100).toFixed(1)) : ghlCloseRate;

  // Build final leaderboard: patch GHL cash/deals into sheet rows, add GHL-only reps
  const ghlLeaderboard: SalesData["reps"]["leaderboard"] = Array.from(ghlRepMap.entries()).map(([name, s]) => ({
    name, cashCollected: s.cash, callsMade: 0, callsAnswered: 0,
    demosSet: 0, demosShowed: 0, pitched: 0, dealsClosed: s.closed, answerRate: 0,
  }));

  const finalLeaderboard: SalesData["reps"]["leaderboard"] = leaderboard.length > 0
    ? [
        ...leaderboard.map(entry => {
          const g = ghlRepMap.get(entry.name);
          return g
            ? { ...entry, cashCollected: entry.cashCollected || g.cash, dealsClosed: entry.dealsClosed || g.closed }
            : entry;
        }),
        ...ghlLeaderboard.filter(gr => !leaderboard.find(r => r.name === gr.name)),
      ]
    : ghlLeaderboard;

  const repCashTotal = finalLeaderboard.reduce((s, r) => s + r.cashCollected, 0);
  const topRepCash   = finalLeaderboard.length > 0 ? Math.max(...finalLeaderboard.map(r => r.cashCollected)) : 0;
  const avgDealSize  = mergedClosed > 0 ? parseFloat((repCashTotal / mergedClosed).toFixed(0)) : 0;

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

  // Leaderboard + pipeline (sheet data merged with GHL fallback)
  current.reps.leaderboard      = finalLeaderboard;
  current.reps.topRepCash       = topRepCash;
  current.reps.avgDealSize      = avgDealSize;
  current.reps.dealClose        = mergedClosed;
  current.reps.callsMadeWeek    = pipeCallsMTD;
  current.reps.cashCollectedWeek = repCashTotal;
  current.reps.showRatePct      = showRate;
  current.reps.closeRatePct     = closeRate;
  current.reps.rateOf           = answerRate;
  current.reps.closeRateWeek    = closeRate;
  // Only overwrite pipeline when we actually found data — don't clobber existing KV with zeros
  const hasPipelineData = pipeCallsMTD > 0 || mergedDSet > 0 || mergedClosed > 0 || ghlPipelineUsed;
  if (hasPipelineData) {
    current.pipeline.callsMade     = pipeCallsMTD;
    current.pipeline.callsAnswered = pipeAnswMTD;
    current.pipeline.demosSet      = mergedDSet;
    current.pipeline.demosShowed   = mergedDShow;
    current.pipeline.pitched       = mergedPitch;
    current.pipeline.closed        = mergedClosed;
    current.pipeline.answerRate    = answerRate;
    current.pipeline.showRate      = showRate;
    current.pipeline.closeRate     = closeRate;
    current.pipeline.demoToClose   = closeRate;
  }

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

  await kv.set("sns-dashboard-v1", current);

  // Ingest all personal sheets → replog KV → rebuild pipeline + leaderboard cache
  // Awaited so failures surface in the response and the admin sees accurate staffUpdated count
  let ingestResult = { staffUpdated: 0, rowsProcessed: 0 };
  let ingestError: string | null = null;
  try {
    ingestResult = await ingestSetterKPISheet();
    await updatePipelineFromReplogs();
    await bumpPipelineVersion();
  } catch (e) {
    ingestError = e instanceof Error ? e.message : String(e);
    console.error("[sync-leaderboard] pipeline KV rebuild failed:", e);
  }

  return Response.json({
    ok:               !sheetsError || finalLeaderboard.length > 0,
    sheetsError,
    leaderboardCount: finalLeaderboard.length,
    repSheetDeals,
    ghlPipelineUsed,
    cashMTD,
    cashYTD,
    dealsMTD,
    dealRowsRead:     dealRows?.length ?? 0,
    staffUpdated:     ingestResult.staffUpdated,
    rowsProcessed:    ingestResult.rowsProcessed,
    ingestError,
  });
}
