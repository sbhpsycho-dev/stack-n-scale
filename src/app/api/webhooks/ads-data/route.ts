import { kv } from "@vercel/kv";
import {
  scoreAds, buildRecommendation,
  type ScoredAd, type KPISummary, type ScorecardCache,
} from "@/lib/ads-scorecard";

export const runtime = "nodejs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetaAdRow {
  ad_name: string;
  ad_id?: string;
  spend: string;
  impressions: string;
  reach?: string;
  ctr: string;
  cpc?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { value: string }[];
}

interface MetaDailyRow {
  ad_name: string;
  date_start: string;
  actions?: { action_type: string; value: string }[];
}

interface GHLContact {
  id: string;
  tags?: string[];
  attributionSource?: { utmContent?: string; utm_content?: string };
  createdAt?: string;
  dateAdded?: string;
  pipelineStageName?: string;
  contactStage?: { name?: string };
}

interface GHLOpportunity {
  contactId?: string;
  contact?: { id?: string };
  monetaryValue?: number;
  status?: string;
  pipelineStageName?: string;
  stageName?: string;
  createdAt?: string;
  dateAdded?: string;
}

interface WebhookPayload {
  metaAds: MetaAdRow[];
  metaDailyAds: MetaDailyRow[];
  ghlContacts: GHLContact[];
  ghlOpportunities: GHLOpportunity[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function sumActions(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  return (actions ?? [])
    .filter(a => a.action_type === type)
    .reduce((s, a) => s + parseInt(a.value ?? "0", 10), 0);
}

function sumActionValues(values: { value: string }[] | undefined): number {
  return (values ?? []).reduce((s, a) => s + parseFloat(a.value ?? "0"), 0);
}

function isQualified(contact: GHLContact): boolean {
  const tags = (contact.tags ?? []).map(t => t.toLowerCase());
  if (tags.some(t => t.includes("qualified") || t === "ql" || t === "sql")) return true;
  const stage = norm(contact.pipelineStageName ?? contact.contactStage?.name ?? "");
  const disqualified = ["new lead", "unqualified", "disqualified", ""];
  return stage !== "" && !disqualified.some(d => stage.includes(d));
}

function getContactId(opp: GHLOpportunity): string {
  return opp.contactId ?? opp.contact?.id ?? "";
}

function getStageName(opp: GHLOpportunity): string {
  return norm(opp.pipelineStageName ?? opp.stageName ?? "");
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Auth via shared secret
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.ADS_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { metaAds = [], metaDailyAds = [], ghlContacts = [], ghlOpportunities = [] } = body;

  // ── 1. Build contact → utmContent map ────────────────────────────────────
  const contactUtm = new Map<string, string>(); // contactId → normalized ad name
  const contactQual = new Map<string, boolean>(); // contactId → isQualified
  const contactDate = new Map<string, string>(); // contactId → YYYY-MM-DD

  for (const c of ghlContacts) {
    if (!c.id) continue;
    const utmContent = norm(
      c.attributionSource?.utmContent ?? c.attributionSource?.utm_content ?? ""
    );
    if (utmContent) contactUtm.set(c.id, utmContent);
    contactQual.set(c.id, isQualified(c));
    const rawDate = c.createdAt ?? c.dateAdded ?? "";
    if (rawDate) contactDate.set(c.id, rawDate.slice(0, 10));
  }

  // ── 2. Build opp → contactId, and contactId → revenue/booked/shows ────────
  const contactRevenue = new Map<string, number>();
  const contactBooked  = new Map<string, boolean>();
  const contactShowed  = new Map<string, boolean>();

  for (const opp of ghlOpportunities) {
    const cid = getContactId(opp);
    if (!cid) continue;
    if ((opp.monetaryValue ?? 0) > 0 && opp.status === "won") {
      contactRevenue.set(cid, (contactRevenue.get(cid) ?? 0) + (opp.monetaryValue ?? 0));
    }
    const stage = getStageName(opp);
    if (stage.includes("book") || stage.includes("demo") || stage.includes("appoint")) {
      contactBooked.set(cid, true);
    }
    if (stage.includes("show") || stage.includes("showed") || stage.includes("attended")) {
      contactShowed.set(cid, true);
    }
  }

  // ── 3. Aggregate per-ad GHL attribution ───────────────────────────────────
  type AdGHLStats = {
    leads: number; qualLeads: number; booked: number; shows: number; revenue: number;
    dailyQual: Record<string, number>;
  };
  const ghlByAd = new Map<string, AdGHLStats>();

  for (const cid of contactUtm.keys()) {
    const adName = contactUtm.get(cid)!;
    if (!ghlByAd.has(adName)) {
      ghlByAd.set(adName, { leads: 0, qualLeads: 0, booked: 0, shows: 0, revenue: 0, dailyQual: {} });
    }
    const stats = ghlByAd.get(adName)!;
    stats.leads++;
    const date = contactDate.get(cid) ?? "";
    if (contactQual.get(cid)) {
      stats.qualLeads++;
      if (date) stats.dailyQual[date] = (stats.dailyQual[date] ?? 0) + 1;
    }
    if (contactBooked.get(cid)) stats.booked++;
    if (contactShowed.get(cid)) stats.shows++;
    stats.revenue += contactRevenue.get(cid) ?? 0;
  }

  // ── 4. Aggregate per-ad Meta daily trend data ─────────────────────────────
  type DailyMetaLead = Record<string, Record<string, number>>; // adName → date → metaLeads
  const metaDailyByAd: DailyMetaLead = {};
  for (const row of metaDailyAds) {
    const adName = norm(row.ad_name);
    const date   = row.date_start ?? "";
    const leads  = sumActions(row.actions, "lead");
    if (!metaDailyByAd[adName]) metaDailyByAd[adName] = {};
    metaDailyByAd[adName][date] = (metaDailyByAd[adName][date] ?? 0) + leads;
  }

  // ── 5. Build joined per-ad array ──────────────────────────────────────────
  // Collect the last 14 dates
  const today = new Date();
  const last14: string[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  type UnscoredAd = Omit<ScoredAd, "tier" | "score" | "recommendation" | "cpl" | "verdict">;
  const unscoredAds: UnscoredAd[] = metaAds.map(metaRow => {
    const adKey    = norm(metaRow.ad_name);
    const spend    = parseFloat(metaRow.spend ?? "0");
    const impressions = parseInt(metaRow.impressions ?? "0", 10);
    const ctr      = parseFloat(metaRow.ctr ?? "0");
    const metaLeads = sumActions(metaRow.actions, "lead");
    const metaRevenue = sumActionValues(metaRow.action_values);

    const ghl = ghlByAd.get(adKey) ?? { leads: 0, qualLeads: 0, booked: 0, shows: 0, revenue: 0, dailyQual: {} };
    // Use GHL revenue if available (source of truth), otherwise fall back to Meta
    const revenue = ghl.revenue > 0 ? ghl.revenue : metaRevenue;

    const qualLeadRate  = ghl.leads > 0 ? ghl.qualLeads / ghl.leads : 0;
    const cpql          = ghl.qualLeads > 0 ? parseFloat((spend / ghl.qualLeads).toFixed(2)) : 0;
    const costPerBooked = ghl.booked > 0 ? parseFloat((spend / ghl.booked).toFixed(2)) : 0;
    const roas          = spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : 0;

    // 14-day qualified lead trend (from GHL daily)
    const trendDays = last14.map(date => ({
      date,
      qualLeads: ghl.dailyQual[date] ?? 0,
    }));

    // 7d trend: last 7 days vs prior 7 days
    const last7  = last14.slice(7).reduce((s, d) => s + (ghl.dailyQual[d] ?? 0), 0);
    const prior7 = last14.slice(0, 7).reduce((s, d) => s + (ghl.dailyQual[d] ?? 0), 0);
    const trend7d = prior7 > 0
      ? parseFloat(((last7 - prior7) / prior7 * 100).toFixed(1))
      : last7 > 0 ? 100 : 0;

    return {
      name: metaRow.ad_name,
      spend, impressions, ctr, metaLeads,
      ghlLeads: ghl.leads,
      qualifiedLeads: ghl.qualLeads,
      qualLeadRate: parseFloat(qualLeadRate.toFixed(4)),
      cpql, costPerBooked, roas,
      booked: ghl.booked, shows: ghl.shows, revenue,
      trend7d, trendDays,
    };
  });

  // ── 6. Score and tier ─────────────────────────────────────────────────────
  const scoredAds = scoreAds(unscoredAds);

  // ── 7. Summary KPIs ───────────────────────────────────────────────────────
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

  // ── 8. Cache in KV (2h TTL) ───────────────────────────────────────────────
  const cache: ScorecardCache = {
    ads: scoredAds,
    summary,
    computedAt: new Date().toISOString(),
  };

  await kv.set("sns:ads:scorecard:cache", cache, { ex: 7200 });

  console.log(`[ads-data webhook] processed ${scoredAds.length} ads, saved to KV`);
  return Response.json({ ok: true, adCount: scoredAds.length });
}
