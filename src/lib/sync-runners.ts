import { kv } from "@vercel/kv";
import { SEED, type SalesData, type CampaignLead, type AdSetCPL, type LeadPoint, type StageCount, type Rep, type TimePoint, type NameAmount } from "@/lib/sales-data";
import { getIntegrations, saveIntegrations } from "@/lib/integrations";

const clientKey = (id: string) => id === "admin" ? "sns-dashboard-v1" : `sns-client-${id}`;

async function getClientData(clientId: string): Promise<SalesData> {
  try {
    return (await kv.get<SalesData>(clientKey(clientId))) ?? SEED;
  } catch {
    return SEED;
  }
}

async function saveClientData(clientId: string, data: SalesData) {
  await kv.set(clientKey(clientId), data);
}

export async function syncMeta(clientId: string): Promise<void> {
  const integrations = await getIntegrations(clientId);
  if (!integrations.meta?.accessToken || !integrations.meta?.adAccountId) return;

  const { accessToken, adAccountId } = integrations.meta;
  const base = `https://graph.facebook.com/v21.0/act_${adAccountId}/insights`;
  const common = `access_token=${accessToken}&date_preset=this_month`;

  const summaryRes = await fetch(`${base}?${common}&fields=spend,impressions,reach,ctr,cpc,actions,action_values`);
  const summary = await summaryRes.json();
  const row = summary?.data?.[0] ?? {};

  const spend = parseFloat(row.spend ?? "0");
  const impressions = parseInt(row.impressions ?? "0");
  const reach = parseInt(row.reach ?? "0");
  const ctr = parseFloat(row.ctr ?? "0");
  const cpc = parseFloat(row.cpc ?? "0");
  const leadActions = (row.actions ?? []).filter((a: { action_type: string }) => a.action_type === "lead");
  const totalLeads = leadActions.reduce((s: number, a: { value: string }) => s + parseInt(a.value ?? "0"), 0);
  const cpl = totalLeads > 0 ? spend / totalLeads : 0;
  const roas = spend > 0
    ? (row.action_values ?? []).reduce((s: number, a: { value: string }) => s + parseFloat(a.value ?? "0"), 0) / spend
    : 0;

  const campaignRes = await fetch(`${base}?${common}&level=campaign&fields=campaign_name,actions&limit=10`);
  const campaignData = await campaignRes.json();
  const leadsByCampaign: CampaignLead[] = (campaignData?.data ?? [])
    .map((c: { campaign_name: string; actions?: { action_type: string; value: string }[] }) => ({
      campaign: c.campaign_name,
      leads: (c.actions ?? []).filter((a) => a.action_type === "lead").reduce((s: number, a) => s + parseInt(a.value ?? "0"), 0),
    }))
    .filter((c: CampaignLead) => c.leads > 0);

  const adsetRes = await fetch(`${base}?${common}&level=adset&fields=adset_name,spend,actions&limit=10`);
  const adsetData = await adsetRes.json();
  const cplByAdSet: AdSetCPL[] = (adsetData?.data ?? [])
    .map((a: { adset_name: string; spend: string; actions?: { action_type: string; value: string }[] }) => {
      const adSetLeads = (a.actions ?? []).filter((ac) => ac.action_type === "lead").reduce((s: number, ac) => s + parseInt(ac.value ?? "0"), 0);
      const adSetSpend = parseFloat(a.spend ?? "0");
      return { adSet: a.adset_name, cpl: adSetLeads > 0 ? adSetSpend / adSetLeads : 0 };
    })
    .filter((a: AdSetCPL) => a.cpl > 0);

  const dailyRes = await fetch(`${base}?${common}&time_increment=1&fields=date_start,actions&limit=31`);
  const dailyData = await dailyRes.json();
  const leadsOverTime: LeadPoint[] = (dailyData?.data ?? [])
    .map((d: { date_start: string; actions?: { action_type: string; value: string }[] }) => ({
      date: d.date_start,
      leads: (d.actions ?? []).filter((a) => a.action_type === "lead").reduce((s: number, a) => s + parseInt(a.value ?? "0"), 0),
    }))
    .filter((d: LeadPoint) => d.leads > 0);

  const existing = await getClientData(clientId);
  await saveClientData(clientId, {
    ...existing,
    ads: { ...existing.ads, totalAdSpend: spend, totalLeads, cpl: parseFloat(cpl.toFixed(2)), roas: parseFloat(roas.toFixed(2)), ctr: parseFloat(ctr.toFixed(2)), cpc: parseFloat(cpc.toFixed(2)), impressions, reach, leadsByCampaign, cplByAdSet, leadsOverTime },
  });
}

export async function syncStripe(clientId: string): Promise<void> {
  const integrations = await getIntegrations(clientId);
  if (!integrations.stripe?.secretKey) return;

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(integrations.stripe.secretKey);
  const now = new Date();
  const startTs = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);

  let cashCollectedMTD = 0;
  const txns = await stripe.balanceTransactions.list({ created: { gte: startTs }, type: "charge", limit: 100 }).autoPagingToArray({ limit: 2000 });
  txns.forEach((t) => { cashCollectedMTD += t.net / 100; });

  let mrr = 0;
  const subs = await stripe.subscriptions.list({ status: "active", limit: 100 });
  subs.data.forEach((sub) => {
    sub.items.data.forEach((item) => {
      const amount = (item.price.unit_amount ?? 0) / 100;
      const interval = item.price.recurring?.interval ?? "month";
      const intervalCount = item.price.recurring?.interval_count ?? 1;
      if (interval === "month") mrr += amount / intervalCount;
      else if (interval === "year") mrr += amount / (12 * intervalCount);
      else if (interval === "week") mrr += (amount * 52) / 12 / intervalCount;
    });
  });

  let totalRefund = 0;
  const refunds = await stripe.refunds.list({ created: { gte: startTs }, limit: 100 }).autoPagingToArray({ limit: 2000 });
  refunds.forEach((r) => { totalRefund += r.amount / 100; });

  const dailyMap: Record<string, number> = {};
  txns.forEach((t) => {
    const date = new Date(t.created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dailyMap[date] = (dailyMap[date] ?? 0) + t.net / 100;
  });
  const revenueOverTime: TimePoint[] = Object.entries(dailyMap)
    .map(([date, amount]) => ({ date, amount: parseFloat(amount.toFixed(2)) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Last month cash for trend calculation
  const lastMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000);
  const lastMonthEnd = Math.floor(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).getTime() / 1000);
  let cashCollectedLastMonth = 0;
  const lastMonthTxns = await stripe.balanceTransactions.list({ created: { gte: lastMonthStart, lte: lastMonthEnd }, type: "charge", limit: 100 }).autoPagingToArray({ limit: 2000 });
  lastMonthTxns.forEach((t) => { cashCollectedLastMonth += t.net / 100; });

  const existing = await getClientData(clientId);
  const totalRefundPct = cashCollectedMTD > 0 ? totalRefund / cashCollectedMTD : 0;
  const netRevenueMTD = parseFloat((cashCollectedMTD - totalRefund).toFixed(2));
  await saveClientData(clientId, {
    ...existing,
    dashboard: {
      ...existing.dashboard,
      cashCollectedMTD: parseFloat(cashCollectedMTD.toFixed(2)),
      cashCollectedLastMonth: parseFloat(cashCollectedLastMonth.toFixed(2)),
      netRevenueMTD,
      mrr: parseFloat(mrr.toFixed(2)),
      totalRefund: parseFloat(totalRefund.toFixed(2)),
      totalRefundPct: parseFloat(totalRefundPct.toFixed(4)),
      ...(revenueOverTime.length > 0 ? { revenueOverTime } : {}),
    },
  });
}

export async function syncGHL(clientId: string): Promise<void> {
  const integrations = await getIntegrations(clientId);
  if (!integrations.ghl?.apiKey || !integrations.ghl?.locationId) return;

  const { apiKey, locationId } = integrations.ghl;
  const headers = { Authorization: `Bearer ${apiKey}`, Version: "2021-07-28" };
  const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const contactsRes = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&startDate=${since}&limit=100`, { headers });
  const contactsData = await contactsRes.json();
  const leadsThisMonth = contactsData?.meta?.total ?? contactsData?.contacts?.length ?? 0;

  const oppsRes = await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${locationId}&date=${since}&limit=100`, { headers });
  const oppsData = await oppsRes.json();
  const opps: { status: string; assignedTo?: string; monetaryValue?: number }[] = oppsData?.opportunities ?? [];

  const stageMap: Record<string, number> = {};
  opps.forEach((o) => { stageMap[o.status ?? "Unknown"] = (stageMap[o.status ?? "Unknown"] ?? 0) + 1; });
  const stageBreakdown: StageCount[] = Object.entries(stageMap).map(([stage, count]) => ({ stage, count }));

  const closed = opps.filter((o) => o.status === "won").length;
  const totalOpps = opps.length;
  const closeRate = totalOpps > 0 ? parseFloat(((closed / totalOpps) * 100).toFixed(2)) : 0;

  const existing = await getClientData(clientId);
  const existingLeaderboard = existing.reps.leaderboard ?? [];

  const repMap: Record<string, { cashCollected: number; dealsClosed: number }> = {};
  opps.forEach((o) => {
    const rep = o.assignedTo ?? "Unassigned";
    if (!repMap[rep]) repMap[rep] = { cashCollected: 0, dealsClosed: 0 };
    if (o.status === "won") { repMap[rep].dealsClosed += 1; repMap[rep].cashCollected += o.monetaryValue ?? 0; }
  });
  const leaderboard: Rep[] = Object.entries(repMap)
    .map(([name, s]) => {
      const prev = existingLeaderboard.find((r) => r.name === name);
      return {
        name,
        callsMade: prev?.callsMade ?? 0,
        callsAnswered: prev?.callsAnswered ?? 0,
        demosSet: prev?.demosSet ?? 0,
        demosShowed: prev?.demosShowed ?? 0,
        pitched: prev?.pitched ?? 0,
        dealsClosed: s.dealsClosed,
        cashCollected: s.cashCollected,
        answerRate: prev?.answerRate ?? 0,
      };
    })
    .sort((a, b) => b.cashCollected - a.cashCollected);

  const topRepCash = leaderboard[0]?.cashCollected ?? existing.reps.topRepCash;
  const totalRepCash = leaderboard.reduce((s, r) => s + r.cashCollected, 0);
  const totalRepDeals = leaderboard.reduce((s, r) => s + r.dealsClosed, 0);
  const avgDealSize = totalRepDeals > 0 ? Math.round(totalRepCash / totalRepDeals) : existing.reps.avgDealSize;

  await saveClientData(clientId, {
    ...existing,
    dashboard: { ...existing.dashboard, leadsThisMonth, totalDealsClosedMTD: closed },
    pipeline: { ...existing.pipeline, closed, closeRate, stageBreakdown },
    reps: {
      ...existing.reps,
      dealClose: closed,
      closeRatePct: closeRate,
      topRepCash,
      avgDealSize,
      ...(leaderboard.length > 0 ? { leaderboard } : {}),
    },
  });
}

export async function syncSheets(clientId: string): Promise<void> {
  const integrations = await getIntegrations(clientId);
  if (!integrations.sheets?.sheetUrl) return;

  const match = integrations.sheets.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = match?.[1];
  if (!sheetId) return;

  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`);
  if (!res.ok) return;

  const csv = await res.text();
  const lines = csv.split("\n").filter(Boolean);
  if (lines.length < 2) return;

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, ""));
  const values = lines[1].split(",").map((v) => v.trim().replace(/['"$%,]/g, ""));

  type Setter = (d: SalesData, v: number) => SalesData;
  const FIELD_MAP: Record<string, Setter> = {
    // Dashboard
    cashcollectedmtd:        (d, v) => ({ ...d, dashboard: { ...d.dashboard, cashCollectedMTD: v } }),
    cashcollectedlastmonth:  (d, v) => ({ ...d, dashboard: { ...d.dashboard, cashCollectedLastMonth: v } }),
    netrevenuemtd:           (d, v) => ({ ...d, dashboard: { ...d.dashboard, netRevenueMTD: v } }),
    leadsthismonth:          (d, v) => ({ ...d, dashboard: { ...d.dashboard, leadsThisMonth: v } }),
    totaldealsclosedmtd:     (d, v) => ({ ...d, dashboard: { ...d.dashboard, totalDealsClosedMTD: v } }),
    mrr:                     (d, v) => ({ ...d, dashboard: { ...d.dashboard, mrr: v } }),
    totalrefund:             (d, v) => ({ ...d, dashboard: { ...d.dashboard, totalRefund: v } }),
    monthlygoal:             (d, v) => ({ ...d, dashboard: { ...d.dashboard, monthlyGoal: v } }),
    costperclose:            (d, v) => ({ ...d, dashboard: { ...d.dashboard, costPerClose: v } }),
    avgleadresponsemin:      (d, v) => ({ ...d, dashboard: { ...d.dashboard, avgLeadResponseTimeMin: v } }),
    // Pipeline
    callsmade:    (d, v) => ({ ...d, pipeline: { ...d.pipeline, callsMade: v } }),
    callsanswered:(d, v) => ({ ...d, pipeline: { ...d.pipeline, callsAnswered: v } }),
    demosset:     (d, v) => ({ ...d, pipeline: { ...d.pipeline, demosSet: v } }),
    demosshowed:  (d, v) => ({ ...d, pipeline: { ...d.pipeline, demosShowed: v } }),
    pitched:      (d, v) => ({ ...d, pipeline: { ...d.pipeline, pitched: v } }),
    closed:       (d, v) => ({ ...d, pipeline: { ...d.pipeline, closed: v } }),
    answerrate:   (d, v) => ({ ...d, pipeline: { ...d.pipeline, answerRate: v } }),
    showrate:     (d, v) => ({ ...d, pipeline: { ...d.pipeline, showRate: v } }),
    closerate:    (d, v) => ({ ...d, pipeline: { ...d.pipeline, closeRate: v } }),
    demotoclose:  (d, v) => ({ ...d, pipeline: { ...d.pipeline, demoToClose: v } }),
    // Ads
    totaladspend: (d, v) => ({ ...d, ads: { ...d.ads, totalAdSpend: v } }),
    totalleads:   (d, v) => ({ ...d, ads: { ...d.ads, totalLeads: v } }),
    cpl:          (d, v) => ({ ...d, ads: { ...d.ads, cpl: v } }),
    roas:         (d, v) => ({ ...d, ads: { ...d.ads, roas: v } }),
    ctr:          (d, v) => ({ ...d, ads: { ...d.ads, ctr: v } }),
    cpc:          (d, v) => ({ ...d, ads: { ...d.ads, cpc: v } }),
    impressions:  (d, v) => ({ ...d, ads: { ...d.ads, impressions: v } }),
    reach:        (d, v) => ({ ...d, ads: { ...d.ads, reach: v } }),
    instacpl:     (d, v) => ({ ...d, ads: { ...d.ads, instaCPL: v } }),
    // Reps
    cashcollectedweek: (d, v) => ({ ...d, reps: { ...d.reps, cashCollectedWeek: v } }),
    dealclose:         (d, v) => ({ ...d, reps: { ...d.reps, dealClose: v } }),
    callsmadeweek:     (d, v) => ({ ...d, reps: { ...d.reps, callsMadeWeek: v } }),
    rateof:            (d, v) => ({ ...d, reps: { ...d.reps, rateOf: v } }),
    closerateweek:     (d, v) => ({ ...d, reps: { ...d.reps, closeRateWeek: v } }),
    closeratepct:      (d, v) => ({ ...d, reps: { ...d.reps, closeRatePct: v } }),
    showratepct:       (d, v) => ({ ...d, reps: { ...d.reps, showRatePct: v } }),
    avgdealsize:       (d, v) => ({ ...d, reps: { ...d.reps, avgDealSize: v } }),
    toprepcash:        (d, v) => ({ ...d, reps: { ...d.reps, topRepCash: v } }),
  };

  const existing = await getClientData(clientId);
  let updated = existing;
  headers.forEach((header, i) => {
    const setter = FIELD_MAP[header];
    if (setter) {
      const num = parseFloat(values[i] ?? "0");
      if (!isNaN(num)) updated = setter(updated, num);
    }
  });

  // gid=1 — Revenue Log: columns Date, Amount, Processor, Product
  const revRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=1`);
  if (revRes.ok) {
    const revCsv = await revRes.text();
    const revLines = revCsv.split("\n").filter(Boolean);
    if (revLines.length >= 2) {
      const revHeaders = revLines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
      const dateIdx = revHeaders.indexOf("date");
      const amountIdx = revHeaders.indexOf("amount");
      const processorIdx = revHeaders.indexOf("processor");
      const productIdx = revHeaders.indexOf("product");

      const revenueOverTime: TimePoint[] = [];
      const processorMap: Record<string, number> = {};
      const productMap: Record<string, number> = {};

      for (const line of revLines.slice(1)) {
        const cols = line.split(",").map((v) => v.trim().replace(/['"$,]/g, ""));
        const date = dateIdx >= 0 ? cols[dateIdx] : "";
        const amount = amountIdx >= 0 ? parseFloat(cols[amountIdx] ?? "0") : 0;
        const processor = processorIdx >= 0 ? cols[processorIdx] : "";
        const product = productIdx >= 0 ? cols[productIdx] : "";
        if (!date || isNaN(amount)) continue;
        revenueOverTime.push({ date, amount });
        if (processor) processorMap[processor] = (processorMap[processor] ?? 0) + amount;
        if (product) productMap[product] = (productMap[product] ?? 0) + amount;
      }

      const netByProcessor: NameAmount[] = Object.entries(processorMap).map(([name, amount]) => ({ name, amount: parseFloat(amount.toFixed(2)) }));
      const netByProduct: NameAmount[] = Object.entries(productMap).map(([name, amount]) => ({ name, amount: parseFloat(amount.toFixed(2)) }));

      updated = {
        ...updated,
        dashboard: {
          ...updated.dashboard,
          ...(revenueOverTime.length > 0 ? { revenueOverTime } : {}),
          ...(netByProcessor.length > 0 ? { netByProcessor } : {}),
          ...(netByProduct.length > 0 ? { netByProduct } : {}),
        },
      };
    }
  }

  // gid=2 — DM/Calls Production: columns Rep Name, Calls Made, Calls Answered, Demos Set, Demos Showed, Pitched, Deals Closed, Cash Collected
  const repsRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=2`);
  if (repsRes.ok) {
    const repsCsv = await repsRes.text();
    const repsLines = repsCsv.split("\n").filter(Boolean);
    if (repsLines.length >= 2) {
      const repsHeaders = repsLines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
      const col = (name: string) => repsHeaders.indexOf(name);

      const leaderboard: Rep[] = repsLines.slice(1).map((line) => {
        const cols = line.split(",").map((v) => v.trim().replace(/['"$,]/g, ""));
        const get = (idx: number) => idx >= 0 ? parseFloat(cols[idx] ?? "0") || 0 : 0;
        const name = col("repname") >= 0 ? cols[col("repname")] : cols[0] ?? "Unknown";
        const callsMade = get(col("callsmade"));
        const callsAnswered = get(col("callsanswered"));
        const demosSet = get(col("demosset"));
        const demosShowed = get(col("demosshowed"));
        const pitched = get(col("pitched"));
        const dealsClosed = get(col("dealsclosed"));
        const cashCollected = get(col("cashcollected"));
        const answerRate = callsMade > 0 ? parseFloat(((callsAnswered / callsMade) * 100).toFixed(2)) : 0;
        return { name, callsMade, callsAnswered, demosSet, demosShowed, pitched, dealsClosed, cashCollected, answerRate };
      }).filter((r) => r.name && r.name !== "Unknown");

      if (leaderboard.length > 0) {
        updated = { ...updated, reps: { ...updated.reps, leaderboard } };
      }
    }
  }

  await saveClientData(clientId, updated);
}

export async function syncAll(clientId: string): Promise<void> {
  const results = await Promise.allSettled([syncMeta(clientId), syncStripe(clientId), syncGHL(clientId), syncSheets(clientId)]);
  const anyOk = results.some(r => r.status === "fulfilled");

  // Derive cross-source metrics from fully merged data
  const merged = await getClientData(clientId);
  const adSpend = merged.ads.totalAdSpend;
  const dealsClosed = merged.dashboard.totalDealsClosedMTD;
  const demosShowed = merged.pipeline.demosShowed;

  const dashboardPatch: Partial<typeof merged.dashboard> = {};
  if (adSpend > 0 && dealsClosed > 0) {
    dashboardPatch.costPerClose = parseFloat((adSpend / dealsClosed).toFixed(2));
  }

  const demoToClose = demosShowed > 0
    ? parseFloat(((merged.pipeline.closed / demosShowed) * 100).toFixed(2))
    : merged.pipeline.demoToClose;

  await saveClientData(clientId, {
    ...merged,
    dashboard: { ...merged.dashboard, ...dashboardPatch },
    pipeline: { ...merged.pipeline, demoToClose },
  });

  if (anyOk) {
    const integrations = await getIntegrations(clientId);
    await saveIntegrations(clientId, { ...integrations, lastSyncedAt: new Date().toISOString() });
  }
}
