import { kv } from "@vercel/kv";
import type { Deal } from "@/lib/deal-types";
import { type SalesData, BLANK } from "@/lib/sales-data";
import { getSheetsToken, sheetsGet } from "@/lib/sheets-sync";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const SETTER_KPI_ID = process.env.GOOGLE_SHEETS_SETTER_KPI_ID ?? "1mASm-QAFu7gMIH23fG1Qb_TdBec_ZCgc2Ymsriwqf2E";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function dealYM(deal: Deal): string {
  return deal.date.slice(0, 7); // "2026-05"
}

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function offerLabel(offer: string): string {
  return offer === "10K" ? "Scale (10K)" : offer === "5K" ? "Starter (5K)" : offer;
}

// ─── Meta Ads fetch ───────────────────────────────────────────────────────────

async function fetchMetaAds(cashCollectedMTD: number, closedMTD: number): Promise<Partial<SalesData["ads"]> | null> {
  const token     = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return null;

  const base = `https://graph.facebook.com/v19.0/act_${accountId}`;
  const qp   = `access_token=${encodeURIComponent(token)}&date_preset=this_month`;

  try {
    // Account-level totals
    const [summaryRes, dailyRes, campaignRes] = await Promise.all([
      fetch(`${base}/insights?${qp}&fields=spend,impressions,reach,ctr,cpc,actions`),
      fetch(`${base}/insights?${qp}&fields=date_start,actions&time_increment=1`),
      fetch(`${base}/insights?${qp}&level=campaign&fields=campaign_name,actions`),
    ]);
    if (!summaryRes.ok || !dailyRes.ok || !campaignRes.ok) return null;
    const [summary, daily, campaigns] = await Promise.all([
      summaryRes.json(),
      dailyRes.json(),
      campaignRes.json(),
    ]);

    type MetaAction = { action_type: string; value: string };
    const isLead = (a: MetaAction) =>
      a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead";

    const sd = summary.data?.[0] ?? {};
    const totalLeads   = parseInt((sd.actions ?? []).find(isLead)?.value ?? "0");
    const totalAdSpend = parseFloat(sd.spend ?? "0");
    const impressions  = parseInt(sd.impressions ?? "0");
    const reach        = parseInt(sd.reach ?? "0");
    const ctr          = parseFloat(sd.ctr ?? "0");
    const cpc          = parseFloat(sd.cpc ?? "0");
    const cpl          = totalLeads > 0 ? parseFloat((totalAdSpend / totalLeads).toFixed(2)) : 0;
    const roas         = totalAdSpend > 0 ? parseFloat((cashCollectedMTD / totalAdSpend).toFixed(2)) : 0;

    const leadsOverTime = (daily.data ?? []).map((row: { date_start: string; actions?: MetaAction[] }) => ({
      date:  row.date_start,
      leads: parseInt((row.actions ?? []).find(isLead)?.value ?? "0"),
    }));

    const leadsByCampaign = (campaigns.data ?? []).map((row: { campaign_name: string; actions?: MetaAction[] }) => ({
      campaign: row.campaign_name,
      leads:    parseInt((row.actions ?? []).find(isLead)?.value ?? "0"),
    }));

    return {
      totalAdSpend,
      totalLeads,
      cpl,
      roas,
      ctr,
      cpc,
      impressions,
      reach,
      instaCPL: cpl,
      leadsOverTime,
      leadsByCampaign,
      cplByAdSet:  [],
      topAds:      [],
      spendSplit:  [],
    };
  } catch {
    return null;
  }
}

// ─── Setter sheet reader ──────────────────────────────────────────────────────

async function readSetterLeaderboard(): Promise<SalesData["reps"]["leaderboard"] | null> {
  if (!process.env.GOOGLE_SA_EMAIL || !process.env.GOOGLE_SA_PRIVATE_KEY) return null;

  try {
    const token = await getSheetsToken();
    let rows: string[][] | null = null;

    for (const tab of ["Leaderboard", "Weekly Summary", "Daily Log", "Sheet1"]) {
      try {
        const res = await sheetsGet(token, SETTER_KPI_ID, `${tab}!A1:Z`);
        if (res.values && res.values.length >= 2) {
          rows = res.values as string[][];
          break;
        }
      } catch { continue; }
    }
    if (!rows) return null;

    const headers    = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
    const col        = (n: string) => headers.indexOf(n);
    const nameIdx    = col("name") >= 0 ? col("name")
                     : col("settername") >= 0 ? col("settername")
                     : col("setter") >= 0 ? col("setter") : 0;
    const cashIdx    = col("cashcollected") >= 0 ? col("cashcollected")
                     : col("grosscollected($)") >= 0 ? col("grosscollected($)")
                     : col("grossdealvalue($)") >= 0 ? col("grossdealvalue($)")
                     : col("grossdealvalue") >= 0 ? col("grossdealvalue")
                     : col("grosscollected");
    const callsIdx   = col("callsmade") >= 0 ? col("callsmade") : col("callsdialed");
    const answIdx    = col("callsanswered") >= 0 ? col("callsanswered") : col("callsconnected");
    const dSetIdx    = col("demosset") >= 0 ? col("demosset") : col("zoomsbooked");
    const dShowIdx   = col("demosshowed") >= 0 ? col("demosshowed")
                     : col("showedups") >= 0 ? col("showedups")
                     : col("zoomsshowed");
    const closedIdx  = col("dealsclosed") >= 0 ? col("dealsclosed") : col("closed");

    const HEADER_LABELS = new Set(["name", "setter name", "setter", "settername"]);
    type Agg = { cash: number; calls: number; answered: number; dSet: number; dShow: number; closed: number };
    const repMap = new Map<string, Agg>();

    for (const row of rows.slice(1)) {
      const name = row[nameIdx]?.trim() ?? "";
      if (!name || HEADER_LABELS.has(name.toLowerCase())) continue;
      const p  = (i: number) => i >= 0 ? parseFloat((row[i] ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const prev = repMap.get(name) ?? { cash: 0, calls: 0, answered: 0, dSet: 0, dShow: 0, closed: 0 };
      repMap.set(name, {
        cash:     prev.cash     + p(cashIdx),
        calls:    prev.calls    + p(callsIdx),
        answered: prev.answered + p(answIdx),
        dSet:     prev.dSet     + p(dSetIdx),
        dShow:    prev.dShow    + p(dShowIdx),
        closed:   prev.closed   + p(closedIdx),
      });
    }

    return Array.from(repMap.entries()).map(([name, s]) => ({
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
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const session    = await getServerSession(authOptions);
  if (!verifyCronSecret(authHeader) && session?.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const now    = new Date();
  const thisYM = ymOf(now);
  const lastYM = ymOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  // Load all deals from KV
  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const deals   = dealIds.length > 0
    ? (await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))).filter((d): d is Deal => d !== null)
    : [];

  const dealsThisMonth = deals.filter(d => dealYM(d) === thisYM);
  const dealsLastMonth = deals.filter(d => dealYM(d) === lastYM);

  // ─── Dashboard metrics ──────────────────────────────────────────────────────

  const cashCollectedMTD       = dealsThisMonth.reduce((s, d) => s + d.grossAmount, 0);
  const cashCollectedLastMonth = dealsLastMonth.reduce((s, d) => s + d.grossAmount, 0);
  const netRevenueMTD          = dealsThisMonth.reduce((s, d) => s + d.netAmount, 0);
  const totalDealsClosedMTD    = dealsThisMonth.length;

  // MRR = avg gross over last 3 complete months
  const last3YMs = [1, 2, 3].map(i => ymOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const last3Rev = last3YMs.map(ym => deals.filter(d => dealYM(d) === ym).reduce((s, d) => s + d.grossAmount, 0));
  const mrr      = parseFloat((last3Rev.reduce((s, v) => s + v, 0) / 3).toFixed(2));

  // Revenue over time — all deals grouped by date
  const byDate = new Map<string, number>();
  for (const deal of deals) {
    byDate.set(deal.date, (byDate.get(deal.date) ?? 0) + deal.grossAmount);
  }
  const revenueOverTime = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));

  // Net by processor (MTD)
  const byProcessor = new Map<string, number>();
  for (const d of dealsThisMonth) {
    const label = d.processor === "fanbasis" ? "Fanbasis" : "Stripe";
    byProcessor.set(label, (byProcessor.get(label) ?? 0) + d.netAmount);
  }
  const netByProcessor = Array.from(byProcessor.entries()).map(([name, amount]) => ({ name, amount }));

  // Net by product (MTD)
  const byProduct = new Map<string, number>();
  for (const d of dealsThisMonth) {
    const label = offerLabel(d.offer);
    byProduct.set(label, (byProduct.get(label) ?? 0) + d.netAmount);
  }
  const netByProduct = Array.from(byProduct.entries()).map(([name, amount]) => ({ name, amount }));

  // Leads by source (MTD)
  const bySource = new Map<string, number>();
  for (const d of dealsThisMonth) {
    const label = d.leadSource === "ad" ? "Ad" : "Organic";
    bySource.set(label, (bySource.get(label) ?? 0) + 1);
  }
  const leadsBySource = Array.from(bySource.entries()).map(([name, amount]) => ({ name, amount }));

  // ─── Setter / reps data ─────────────────────────────────────────────────────

  const sheetLeaderboard = await readSetterLeaderboard();
  let leaderboard: SalesData["reps"]["leaderboard"];
  let callsMade = 0, callsAnswered = 0, demosSet = 0, demosShowed = 0, closed = 0;

  if (sheetLeaderboard && sheetLeaderboard.length > 0) {
    leaderboard   = sheetLeaderboard;
    callsMade     = leaderboard.reduce((s, r) => s + r.callsMade, 0);
    callsAnswered = leaderboard.reduce((s, r) => s + r.callsAnswered, 0);
    demosSet      = leaderboard.reduce((s, r) => s + r.demosSet, 0);
    demosShowed   = leaderboard.reduce((s, r) => s + r.demosShowed, 0);
    closed        = leaderboard.reduce((s, r) => s + r.dealsClosed, 0);
  } else {
    // Fallback: derive from deals KV
    type RepAgg = { cashCollected: number; demosSet: number; dealsClosed: number };
    const repMap = new Map<string, RepAgg>();
    for (const deal of deals) {
      if (deal.setter) {
        const r = repMap.get(deal.setter) ?? { cashCollected: 0, demosSet: 0, dealsClosed: 0 };
        repMap.set(deal.setter, { ...r, demosSet: r.demosSet + 1 });
      }
      if (deal.closer) {
        const r = repMap.get(deal.closer) ?? { cashCollected: 0, demosSet: 0, dealsClosed: 0 };
        repMap.set(deal.closer, { ...r, dealsClosed: r.dealsClosed + 1, cashCollected: r.cashCollected + deal.grossAmount });
      }
    }
    leaderboard = Array.from(repMap.entries()).map(([name, s]) => ({
      name,
      cashCollected: s.cashCollected,
      callsMade:     0,
      callsAnswered: 0,
      demosSet:      s.demosSet,
      demosShowed:   0,
      pitched:       0,
      dealsClosed:   s.dealsClosed,
      answerRate:    0,
    }));
    closed  = totalDealsClosedMTD;
    demosSet = deals.filter(d => d.setter || d.dmSetter).length;
  }

  const answerRate  = callsMade   > 0 ? parseFloat(((callsAnswered / callsMade)  * 100).toFixed(1)) : 0;
  const showRate    = demosSet    > 0 ? parseFloat(((demosShowed   / demosSet)   * 100).toFixed(1)) : 0;
  const closeRate   = demosShowed > 0 ? parseFloat(((closed        / demosShowed)* 100).toFixed(1)) : 0;
  const demoToClose = closeRate;

  const topRepCash  = leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.cashCollected)) : 0;
  const avgDealSize = closed > 0 ? Math.round(cashCollectedMTD / closed) : 0;

  // ─── Meta Ads ───────────────────────────────────────────────────────────────

  const metaAds   = await fetchMetaAds(cashCollectedMTD, closed);
  const adsUpdated = metaAds !== null;
  const adData: SalesData["ads"] = {
    ...BLANK.ads,
    ...(metaAds ?? {}),
  };

  const costPerClose = adData.totalAdSpend > 0 && closed > 0
    ? parseFloat((adData.totalAdSpend / closed).toFixed(2))
    : 0;

  // ─── Monthly goal from KV (admin can set via /api/admin/set-goal) ───────────

  const monthlyGoal = (await kv.get<number>("sns:monthly-goal")) ?? 0;

  // ─── Build and persist ──────────────────────────────────────────────────────

  const data: SalesData = {
    ...BLANK,
    dashboard: {
      cashCollectedYTD:      0,
      cashCollectedMTD,
      cashCollectedLastMonth,
      netRevenueMTD,
      leadsThisMonth:        metaAds?.totalLeads ?? totalDealsClosedMTD,
      totalDealsClosedMTD,
      costPerClose,
      mrr,
      totalRefund:           0,
      totalRefundPct:        0,
      monthlyGoal,
      avgLeadResponseTimeMin: 0,
      reactivation:          BLANK.dashboard.reactivation,
      checkInScores:         BLANK.dashboard.checkInScores,
      revenueOverTime,
      netByProduct,
      netByProcessor,
      leadsBySource,
    },
    pipeline: {
      callsMade,
      callsAnswered,
      demosSet,
      demosShowed,
      pitched:       demosShowed,
      closed,
      answerRate,
      showRate,
      closeRate,
      demoToClose,
      funnelByWeek:   [],
      stageBreakdown: [],
    },
    ads: adData,
    reps: {
      cashCollectedWeek: cashCollectedMTD,
      dealClose:         closed,
      callsMadeWeek:     callsMade,
      rateOf:            answerRate,
      closeRateWeek:     closeRate,
      topRepCash,
      showRatePct:       showRate,
      closeRatePct:      closeRate,
      avgDealSize,
      leaderboard,
    },
    clients:        BLANK.clients,
    clientRegistry: BLANK.clientRegistry,
  };

  await kv.set("sns-dashboard-v1", data);

  return Response.json({
    ok: true,
    updated: {
      revenue: true,
      ads:     adsUpdated,
      setters: sheetLeaderboard !== null,
    },
    stats: {
      totalDeals:     deals.length,
      dealsThisMonth: dealsThisMonth.length,
      cashMTD:        cashCollectedMTD,
      mrr,
    },
  });
}
