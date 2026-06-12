import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import {
  scoreAds, buildRecommendation,
  type ScoredAd, type KPISummary, type ScorecardCache,
} from "@/lib/ads-scorecard";

export const runtime = "nodejs";

// ── Helpers (same logic as webhook) ──────────────────────────────────────────

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}
function sumActions(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  return (actions ?? []).filter(a => a.action_type === type).reduce((s, a) => s + parseInt(a.value ?? "0", 10), 0);
}
function sumActionValues(values: { value: string }[] | undefined): number {
  return (values ?? []).reduce((s, a) => s + parseFloat(a.value ?? "0"), 0);
}

// ── GHL fetch helpers ─────────────────────────────────────────────────────────

async function fetchGHLContacts(since: string): Promise<unknown[]> {
  const key = process.env.GHL_API_KEY;
  const loc  = process.env.GHL_LOCATION_ID;
  if (!key || !loc) return [];

  const contacts: unknown[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://rest.gohighlevel.com/v1/contacts/?locationId=${loc}&startAfter=${since}&limit=100&page=${page}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) break;
    const json = await res.json() as { contacts?: unknown[] };
    const batch = json.contacts ?? [];
    contacts.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return contacts;
}

async function fetchGHLOpportunities(since: string): Promise<unknown[]> {
  const key = process.env.GHL_API_KEY;
  const loc  = process.env.GHL_LOCATION_ID;
  if (!key || !loc) return [];

  const opps: unknown[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://rest.gohighlevel.com/v1/opportunities/?locationId=${loc}&startAfter=${since}&limit=100&page=${page}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) break;
    const json = await res.json() as { opportunities?: unknown[] };
    const batch = json.opportunities ?? [];
    opps.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return opps;
}

// ── Meta fetch ────────────────────────────────────────────────────────────────

async function fetchMetaAds(): Promise<{ ads: unknown[]; daily: unknown[] }> {
  const token   = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) return { ads: [], daily: [] };

  const acct = account.startsWith("act_") ? account : `act_${account}`;
  const fields = "name,insights{spend,impressions,reach,ctr,cpc,actions,action_values}";
  const url = `https://graph.facebook.com/v19.0/${acct}/ads?fields=${fields}&date_preset=last_14d&limit=50&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) return { ads: [], daily: [] };
  const json = await res.json() as { data?: unknown[] };
  const ads = (json.data ?? []).map((ad: unknown) => {
    const a = ad as Record<string, unknown>;
    const ins = ((a.insights as Record<string, unknown>)?.data as unknown[])?.[0] as Record<string, unknown> | undefined;
    return {
      ad_name: a.name,
      spend: ins?.spend ?? "0",
      impressions: ins?.impressions ?? "0",
      ctr: ins?.ctr ?? "0",
      cpc: ins?.cpc ?? "0",
      actions: ins?.actions,
      action_values: ins?.action_values,
    };
  });

  // daily breakdown
  const dailyFields = "name,insights.time_increment(1){spend,actions}";
  const dailyUrl = `https://graph.facebook.com/v19.0/${acct}/ads?fields=${dailyFields}&date_preset=last_14d&limit=50&access_token=${token}`;
  const dailyRes = await fetch(dailyUrl);
  const daily: unknown[] = [];
  if (dailyRes.ok) {
    const dj = await dailyRes.json() as { data?: unknown[] };
    for (const ad of dj.data ?? []) {
      const a = ad as Record<string, unknown>;
      const ins = ((a.insights as Record<string, unknown>)?.data as unknown[]) ?? [];
      for (const row of ins) {
        const r = row as Record<string, unknown>;
        daily.push({ ad_name: a.name, date_start: r.date_start, actions: r.actions });
      }
    }
  }
  return { ads, daily };
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  const [{ ads: metaAds, daily: metaDailyAds }, ghlContacts, ghlOpportunities] = await Promise.all([
    fetchMetaAds(),
    fetchGHLContacts(since14),
    fetchGHLOpportunities(since14),
  ]);

  type GHLContact = {
    id: string; tags?: string[];
    attributionSource?: { utmContent?: string; utm_content?: string };
    createdAt?: string; dateAdded?: string;
    pipelineStageName?: string; contactStage?: { name?: string };
  };
  type GHLOpportunity = {
    contactId?: string; contact?: { id?: string };
    monetaryValue?: number; status?: string;
    pipelineStageName?: string; stageName?: string;
    createdAt?: string; dateAdded?: string;
  };
  type MetaAdRow = {
    ad_name: string; spend: string; impressions: string; ctr: string;
    actions?: { action_type: string; value: string }[];
    action_values?: { value: string }[];
  };
  type MetaDailyRow = {
    ad_name: string; date_start: string;
    actions?: { action_type: string; value: string }[];
  };

  const contacts = ghlContacts as GHLContact[];
  const opps     = ghlOpportunities as GHLOpportunity[];
  const adRows   = metaAds as MetaAdRow[];
  const dailyRows = metaDailyAds as MetaDailyRow[];

  // contact maps
  const contactUtm  = new Map<string, string>();
  const contactQual = new Map<string, boolean>();
  const contactDate = new Map<string, string>();
  for (const c of contacts) {
    if (!c.id) continue;
    const utm = norm(c.attributionSource?.utmContent ?? c.attributionSource?.utm_content ?? "");
    if (utm) contactUtm.set(c.id, utm);
    const tags = (c.tags ?? []).map(t => t.toLowerCase());
    const stage = norm(c.pipelineStageName ?? c.contactStage?.name ?? "");
    const isQual = tags.some(t => t.includes("qualified") || t === "ql" || t === "sql")
      || (stage !== "" && !["new lead", "unqualified", "disqualified", ""].some(d => stage.includes(d)));
    contactQual.set(c.id, isQual);
    const raw = c.createdAt ?? c.dateAdded ?? "";
    if (raw) contactDate.set(c.id, raw.slice(0, 10));
  }

  // opp maps
  const contactRevenue = new Map<string, number>();
  const contactBooked  = new Map<string, boolean>();
  const contactShowed  = new Map<string, boolean>();
  for (const opp of opps) {
    const cid = opp.contactId ?? opp.contact?.id ?? "";
    if (!cid) continue;
    if ((opp.monetaryValue ?? 0) > 0 && opp.status === "won") {
      contactRevenue.set(cid, (contactRevenue.get(cid) ?? 0) + (opp.monetaryValue ?? 0));
    }
    const s = norm(opp.pipelineStageName ?? opp.stageName ?? "");
    if (s.includes("book") || s.includes("demo") || s.includes("appoint")) contactBooked.set(cid, true);
    if (s.includes("show") || s.includes("showed") || s.includes("attended")) contactShowed.set(cid, true);
  }

  // GHL per-ad stats
  type AdStats = { leads: number; qualLeads: number; booked: number; shows: number; revenue: number; dailyQual: Record<string, number> };
  const ghlByAd = new Map<string, AdStats>();
  for (const cid of contactUtm.keys()) {
    const adName = contactUtm.get(cid)!;
    if (!ghlByAd.has(adName)) ghlByAd.set(adName, { leads: 0, qualLeads: 0, booked: 0, shows: 0, revenue: 0, dailyQual: {} });
    const stats = ghlByAd.get(adName)!;
    stats.leads++;
    const date = contactDate.get(cid) ?? "";
    if (contactQual.get(cid)) { stats.qualLeads++; if (date) stats.dailyQual[date] = (stats.dailyQual[date] ?? 0) + 1; }
    if (contactBooked.get(cid)) stats.booked++;
    if (contactShowed.get(cid)) stats.shows++;
    stats.revenue += contactRevenue.get(cid) ?? 0;
  }

  // Meta daily trend
  const metaDailyByAd: Record<string, Record<string, number>> = {};
  for (const row of dailyRows) {
    const adName = norm(row.ad_name);
    const date   = row.date_start ?? "";
    const leads  = sumActions(row.actions, "lead");
    if (!metaDailyByAd[adName]) metaDailyByAd[adName] = {};
    metaDailyByAd[adName][date] = (metaDailyByAd[adName][date] ?? 0) + leads;
  }

  // Build 14-day window
  const today = new Date();
  const last14: string[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  type UnscoredAd = Omit<ScoredAd, "tier" | "score" | "recommendation" | "cpl" | "verdict">;
  const unscoredAds: UnscoredAd[] = adRows.map(metaRow => {
    const adKey   = norm(metaRow.ad_name);
    const spend   = parseFloat(metaRow.spend ?? "0");
    const impressions = parseInt(metaRow.impressions ?? "0", 10);
    const ctr     = parseFloat(metaRow.ctr ?? "0");
    const metaLeads   = sumActions(metaRow.actions, "lead");
    const metaRevenue = sumActionValues(metaRow.action_values);
    const ghl = ghlByAd.get(adKey) ?? { leads: 0, qualLeads: 0, booked: 0, shows: 0, revenue: 0, dailyQual: {} };
    const revenue = ghl.revenue > 0 ? ghl.revenue : metaRevenue;
    const qualLeadRate  = ghl.leads > 0 ? ghl.qualLeads / ghl.leads : 0;
    const cpql          = ghl.qualLeads > 0 ? parseFloat((spend / ghl.qualLeads).toFixed(2)) : 0;
    const costPerBooked = ghl.booked > 0 ? parseFloat((spend / ghl.booked).toFixed(2)) : 0;
    const roas          = spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0;
    const trendDays = last14.map(date => ({ date, qualLeads: ghl.dailyQual[date] ?? 0 }));
    const last7  = last14.slice(7).reduce((s, d) => s + (ghl.dailyQual[d] ?? 0), 0);
    const prior7 = last14.slice(0, 7).reduce((s, d) => s + (ghl.dailyQual[d] ?? 0), 0);
    const trend7d = prior7 > 0 ? parseFloat(((last7 - prior7) / prior7 * 100).toFixed(1)) : last7 > 0 ? 100 : 0;
    return {
      name: metaRow.ad_name, spend, impressions, ctr, metaLeads,
      ghlLeads: ghl.leads, qualifiedLeads: ghl.qualLeads,
      qualLeadRate: parseFloat(qualLeadRate.toFixed(4)),
      cpql, costPerBooked, roas, booked: ghl.booked, shows: ghl.shows,
      revenue, trend7d, trendDays,
    };
  });

  const scoredAds = scoreAds(unscoredAds);

  const spendMTD     = scoredAds.reduce((s, a) => s + a.spend, 0);
  const totalLeads   = scoredAds.reduce((s, a) => s + a.ghlLeads, 0);
  const totalQual    = scoredAds.reduce((s, a) => s + a.qualifiedLeads, 0);
  const totalRevenue = scoredAds.reduce((s, a) => s + a.revenue, 0);
  const totalBooked  = scoredAds.reduce((s, a) => s + a.booked, 0);
  const redSpend     = scoredAds.filter(a => a.tier === "red").reduce((s, a) => s + a.spend, 0);

  const summary: KPISummary = {
    spendMTD:       parseFloat(spendMTD.toFixed(2)),
    totalLeads,
    qualifiedLeads: totalQual,
    qualLeadRate:   totalLeads > 0 ? parseFloat((totalQual / totalLeads).toFixed(4)) : 0,
    cpql:           totalQual > 0 ? parseFloat((spendMTD / totalQual).toFixed(2)) : 0,
    roas:           spendMTD > 0 ? parseFloat((totalRevenue / spendMTD).toFixed(2)) : 0,
    bookedCalls:    totalBooked,
    redSpend:       parseFloat(redSpend.toFixed(2)),
  };

  const cache: ScorecardCache = { ads: scoredAds, summary, computedAt: new Date().toISOString() };
  await kv.set("sns:ads:scorecard:cache", cache, { ex: 7200 });

  return Response.json({ ok: true, adCount: scoredAds.length, computedAt: cache.computedAt });
}
