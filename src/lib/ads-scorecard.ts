// Shared types and pure scoring logic for the Ads Scorecard.
// Imported by both the webhook handler (server) and the page (client).

export interface ScoredAd {
  name: string;
  tier: "green" | "yellow" | "red";
  score: number;
  spend: number;
  impressions: number;
  ctr: number;
  metaLeads: number;
  ghlLeads: number;
  qualifiedLeads: number;
  qualLeadRate: number;
  cpql: number;
  costPerBooked: number;
  roas: number;
  booked: number;
  shows: number;
  revenue: number;
  trend7d: number;
  trendDays: { date: string; qualLeads: number }[];
  recommendation: string;
}

export interface KPISummary {
  spendMTD: number;
  totalLeads: number;
  qualifiedLeads: number;
  qualLeadRate: number;
  cpql: number;
  roas: number;
  bookedCalls: number;
  redSpend: number;
}

export interface ScorecardCache {
  ads: ScoredAd[];
  summary: KPISummary;
  computedAt: string;
}

export interface ScoringWeights {
  qualRate: number;   // 0–1, default 0.35
  efficiency: number; // 0–1, default 0.30
  roas: number;       // 0–1, default 0.25
  volume: number;     // 0–1, default 0.10
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  qualRate: 0.35, efficiency: 0.30, roas: 0.25, volume: 0.10,
};

export function buildRecommendation(ad: Omit<ScoredAd, "recommendation">): string {
  if (ad.tier === "green") {
    if (ad.trend7d > 20) return "Scaling fast — increase budget 20% and keep running.";
    if (ad.trend7d < -15) return "Top performer cooling — watch trend before increasing budget.";
    return "Top performer — keep running, consider pushing budget higher.";
  }
  if (ad.tier === "yellow") {
    if (ad.trend7d > 15) return "Trending up — lean in, bump budget slightly and revisit next week.";
    if (ad.trend7d < -20) return "Declining — keep live for now, cut if it slides into red.";
    return "Decent performer — keep live and re-check in 7 days.";
  }
  if (ad.ghlLeads === 0 && ad.metaLeads === 0) return "Zero leads — kill immediately and reallocate budget.";
  if (ad.qualifiedLeads === 0) return "No qualified leads — bad creative or audience. Cut and test a new angle.";
  if (ad.cpql > 0 && ad.cpql > 400) return "CPQL too high — not economical. Cut and move budget to green ads.";
  return "Low quality, high cost — cut and reallocate spend to green ads.";
}

export function scoreAds(
  ads: Omit<ScoredAd, "tier" | "score" | "recommendation">[],
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoredAd[] {
  if (ads.length === 0) return [];

  const maxQualRate = Math.max(...ads.map(a => a.qualLeadRate), 0.001);
  const maxROAS     = Math.max(...ads.map(a => a.roas), 0.001);
  const maxLeads    = Math.max(...ads.map(a => a.ghlLeads), 1);
  const minCPQL     = Math.min(...ads.filter(a => a.cpql > 0).map(a => a.cpql), Infinity);
  const safMinCPQL  = isFinite(minCPQL) ? minCPQL : 1;

  return ads.map(ad => {
    const qualRateNorm = ad.qualLeadRate / maxQualRate;
    const cpqlNorm     = ad.cpql > 0 ? safMinCPQL / ad.cpql : 0;
    const roasNorm     = ad.roas / maxROAS;
    const volNorm      = ad.ghlLeads / maxLeads;

    const score = Math.round(
      (qualRateNorm * weights.qualRate +
       cpqlNorm     * weights.efficiency +
       roasNorm     * weights.roas +
       volNorm      * weights.volume) * 100
    );

    const tier: ScoredAd["tier"] = score >= 68 ? "green" : score >= 40 ? "yellow" : "red";
    const partial = { ...ad, tier, score };
    return { ...partial, recommendation: buildRecommendation(partial) };
  });
}
