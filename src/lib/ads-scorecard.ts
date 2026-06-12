// Shared types and pure scoring logic for the Ads Scorecard.
// Imported by both the webhook handler (server) and the page (client).

// ── Tuneable constants ────────────────────────────────────────────────────────

export const CPL_TARGET  = 35;   // $ — all verdict thresholds derive from this
export const WINDOW_DAYS = 14;   // trailing window length

export const SPEC_WEIGHTS = {
  cplEfficiency: 0.40, // $10 CPL = 100, $90 CPL = 0, linear
  ctr:           0.20, // 3% CTR = 100
  volume:        0.20, // relative to top ad in the account
  apptRate:      0.20, // 30% of leads booked = 100
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredAd {
  name: string;
  tier: "green" | "yellow" | "red";
  verdict: "scale" | "keep" | "watch" | "cut";
  score: number;
  cpl: number;             // spend / ghlLeads
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
  qualRate: number;
  efficiency: number;
  roas: number;
  volume: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  qualRate: 0.35, efficiency: 0.30, roas: 0.25, volume: 0.10,
};

// ── Recommendation builder ────────────────────────────────────────────────────

export function buildRecommendation(ad: Omit<ScoredAd, "recommendation">): string {
  const { verdict, cpl, ghlLeads, trend7d, booked } = ad;
  const target = CPL_TARGET;

  if (verdict === "scale") {
    if (trend7d > 20) return `Best performer and growing — CPL $${cpl} vs $${target} target. Increase budget 20–30%.`;
    return `Best performer — CPL $${cpl} vs $${target} target. Push budget higher.`;
  }
  if (verdict === "keep") {
    if (trend7d < -15) return `Strong performer cooling — leads slipped ${Math.abs(trend7d)}%. Hold budget, revisit in 5 days.`;
    return `Solid ad — CPL $${cpl} vs $${target} target. Keep running.`;
  }
  if (verdict === "watch") {
    if (trend7d < -20) return `Leads slipped ${Math.abs(trend7d)}% over the last week. Give it 3–5 more days, then cut.`;
    if (trend7d > 15) return `Trending up ${trend7d}% — lean in slightly and revisit next week.`;
    if (booked === 0) return `No appointments booked yet. Monitor close rate before scaling.`;
    return `Middle of the pack — CPL $${cpl} vs $${target} target. Re-check in 7 days.`;
  }
  // cut
  if (ghlLeads === 0) return `Zero leads recorded — kill immediately and reallocate budget.`;
  if (cpl > 0) {
    const mult = (cpl / target).toFixed(1);
    return `$${cpl} CPL is ${mult}× your $${target} target on just ${ghlLeads} leads — stop the spend.`;
  }
  return `Low quality, high cost — cut and reallocate spend to performing ads.`;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

type UnscoredAd = Omit<ScoredAd, "tier" | "verdict" | "score" | "cpl" | "recommendation">;

// weights param kept for backward compat with existing callers — ignored, SPEC_WEIGHTS always used
export function scoreAds(ads: UnscoredAd[], _weights?: ScoringWeights): ScoredAd[] {
  if (ads.length === 0) return [];

  const maxLeads = Math.max(...ads.map(a => a.ghlLeads), 1);

  // First pass: compute per-ad cpl + raw component scores
  const withCpl = ads.map(ad => {
    const cpl      = ad.ghlLeads > 0 ? parseFloat((ad.spend / ad.ghlLeads).toFixed(2)) : 0;
    const apptRate = ad.ghlLeads > 0 ? ad.booked / ad.ghlLeads : 0;

    // CPL efficiency: $10 → 100, $90 → 0, linear, clamped 0–100
    const cplScore  = cpl > 0 ? Math.max(0, Math.min(100, ((90 - cpl) / (90 - 10)) * 100)) : 0;
    // CTR: 3% → 100, linear, clamped
    const ctrScore  = Math.max(0, Math.min(100, (ad.ctr / 3) * 100));
    // Volume: relative to top ad
    const volScore  = (ad.ghlLeads / maxLeads) * 100;
    // Appointment rate: 30% → 100, linear, clamped
    const apptScore = Math.max(0, Math.min(100, (apptRate / 0.30) * 100));

    const composite = Math.round(
      SPEC_WEIGHTS.cplEfficiency * cplScore  +
      SPEC_WEIGHTS.ctr           * ctrScore  +
      SPEC_WEIGHTS.volume        * volScore  +
      SPEC_WEIGHTS.apptRate      * apptScore
    );

    return { ad, cpl, composite };
  });

  // Identify the top scorer for "scale" designation
  const maxScore = Math.max(...withCpl.map(x => x.composite));

  return withCpl.map(({ ad, cpl, composite }) => {
    // Verdict logic
    let verdict: ScoredAd["verdict"];
    if (cpl >= 1.8 * CPL_TARGET && ad.ghlLeads < 60) {
      verdict = "cut";
    } else if (composite < 45) {
      verdict = "cut";
    } else if (composite >= 68) {
      verdict = composite === maxScore ? "scale" : "keep";
    } else {
      verdict = "watch";
    }

    const tier: ScoredAd["tier"] =
      verdict === "cut"   ? "red"    :
      verdict === "watch" ? "yellow" : "green";

    const partial: Omit<ScoredAd, "recommendation"> = {
      ...ad, cpl, score: composite, tier, verdict,
    };
    return { ...partial, recommendation: buildRecommendation(partial) };
  });
}
