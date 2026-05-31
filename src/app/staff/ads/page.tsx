"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Loader2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Megaphone, CircleDollarSign, Users, Target, Zap, Phone,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdLeadsBarChart, QualLeadTrendAreaChart, AdScoreMiniBar } from "@/components/charts/ads-scorecard-charts";
import { scoreAds, DEFAULT_WEIGHTS, type ScoredAd, type KPISummary, type ScoringWeights } from "@/lib/ads-scorecard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScorecardData {
  ads: ScoredAd[];
  summary: KPISummary;
  computedAt: string | null;
}

type TierFilter = "all" | "green" | "yellow" | "red";
type SortKey = "score" | "spend" | "ghlLeads" | "qualifiedLeads" | "cpql" | "roas" | "trend7d";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = { green: "Scale", yellow: "Watch", red: "Cut" };
const TIER_BG: Record<string, string>    = {
  green:  "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  yellow: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  red:    "bg-rose-500/10 border-rose-500/30 text-rose-400",
};
const TIER_DOT: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-rose-500",
};

function fmt$(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }
function fmtPct(n: number, dec = 1) { return `${(n * 100).toFixed(dec)}%`; }
function fmtSince(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function Spin() {
  return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-sm text-muted-foreground text-center max-w-xs">{message}</p>
      <button onClick={onRetry} className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors">
        Retry
      </button>
    </div>
  );
}

function TierPill({ tier }: { tier: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${TIER_BG[tier]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TIER_DOT[tier]}`} />
      {TIER_LABEL[tier]}
    </span>
  );
}

function CC({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect non-admins
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.replace("/staff/insights");
    }
  }, [status, session, router]);

  const [data, setData] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Scoring weights (client-side, default = server defaults)
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);

  // Table controls
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortKey, setSortKey]       = useState<SortKey>("score");
  const [sortAsc, setSortAsc]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/ads/scorecard");
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load ad scorecard data.");
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-score client-side when weights change
  const ads: ScoredAd[] = useMemo(() => {
    if (!data?.ads?.length) return [];
    // Strip tier/score/recommendation and re-score with current weights
    const stripped = data.ads.map(({ tier: _t, score: _s, recommendation: _r, ...rest }) => rest);
    return scoreAds(stripped, weights);
  }, [data, weights]);

  // Filtered + sorted table rows
  const tableRows = useMemo(() => {
    const filtered = tierFilter === "all" ? ads : ads.filter(a => a.tier === tierFilter);
    return [...filtered].sort((a, b) => {
      const v = sortAsc ? 1 : -1;
      if (sortKey === "cpql") {
        // Lower CPQL is better — ascending = best first when sortAsc
        const aVal = a.cpql || Infinity;
        const bVal = b.cpql || Infinity;
        return (aVal - bVal) * v;
      }
      return ((a[sortKey] as number) - (b[sortKey] as number)) * v;
    });
  }, [ads, tierFilter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(p => !p);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className="text-left px-3 py-2 font-semibold text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors"
      >
        {label}{active ? (sortAsc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  // Normalize weights so sliders always sum to 1
  function adjustWeight(key: keyof ScoringWeights, pct: number) {
    const raw = pct / 100;
    setWeights(prev => {
      const others = (Object.keys(prev) as (keyof ScoringWeights)[]).filter(k => k !== key);
      const remaining = Math.max(0, 1 - raw);
      const otherSum = others.reduce((s, k) => s + prev[k], 0);
      const scaled = otherSum > 0
        ? others.reduce((acc, k) => ({ ...acc, [k]: parseFloat(((prev[k] / otherSum) * remaining).toFixed(4)) }), {} as Partial<ScoringWeights>)
        : others.reduce((acc, k) => ({ ...acc, [k]: parseFloat((remaining / others.length).toFixed(4)) }), {} as Partial<ScoringWeights>);
      return { ...prev, ...scaled, [key]: raw };
    });
  }

  const greenCount  = ads.filter(a => a.tier === "green").length;
  const yellowCount = ads.filter(a => a.tier === "yellow").length;
  const redCount    = ads.filter(a => a.tier === "red").length;

  if (status === "loading" || (loading && !data)) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { summary } = data ?? { summary: { spendMTD: 0, totalLeads: 0, qualifiedLeads: 0, qualLeadRate: 0, cpql: 0, roas: 0, bookedCalls: 0, redSpend: 0 } };

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-orange-500" />
            Ad Scorecard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data?.computedAt
              ? `Last synced ${fmtSince(data.computedAt)} via Make.com`
              : "No data yet — run the Make.com scenario to populate"}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground text-xs disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Spend MTD"        value={summary.spendMTD}        prefix="$"  variant="black"   index={0} />
        <MetricCard label="Total Leads"      value={summary.totalLeads}                  variant="default"  index={1} />
        <MetricCard label="Qualified Leads"  value={summary.qualifiedLeads}              variant="orange"   index={2}
          hint={summary.totalLeads > 0 ? fmtPct(summary.qualLeadRate) + " qual rate" : undefined} />
        <MetricCard label="Cost / Qual Lead" value={summary.cpql}            prefix="$"  variant="default"  index={3} decimals={2} />
        <MetricCard label="Blended ROAS"     value={summary.roas}            suffix="x"  variant="green"    index={4} decimals={2} />
        <MetricCard label="Booked Calls"     value={summary.bookedCalls}                 variant="default"  index={5} />
      </div>

      {/* ── Tier banner ── */}
      <div className="grid grid-cols-3 gap-3">
        {(["green", "yellow", "red"] as const).map((tier, i) => {
          const count = tier === "green" ? greenCount : tier === "yellow" ? yellowCount : redCount;
          const label = TIER_LABEL[tier];
          return (
            <Card key={tier} className={`border ${TIER_BG[tier].split(" ").slice(0, 2).join(" ")} cursor-pointer hover:opacity-90 transition-opacity`}
              onClick={() => setTierFilter(p => p === tier ? "all" : tier)}>
              <CardContent className="px-4 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${TIER_DOT[tier]}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${TIER_BG[tier].split(" ")[2]}`}>
                    {label}
                  </span>
                </div>
                <p className="text-2xl font-bold leading-none mt-1">{count}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {tier === "green" ? "ads performing" : tier === "yellow" ? "ads to watch" : "ads to cut"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Action callout ── */}
      {summary.redSpend > 0 && (
        <Card className="bg-rose-500/5 border-rose-500/20">
          <CardContent className="px-4 py-3 flex items-start gap-3">
            <CircleDollarSign className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-400">{fmt$(summary.redSpend)} sitting in red ads</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cut underperforming ads and reallocate this budget to your green performers to improve blended ROAS.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Weight sliders ── */}
      <CC title="Scoring Weights (drag to adjust — scores update instantly)">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            ["qualRate",   "Qual Lead Rate", Target,           35],
            ["efficiency", "Efficiency",      Zap,              30],
            ["roas",       "ROAS",            CircleDollarSign, 25],
            ["volume",     "Lead Volume",     Users,            10],
          ] as [keyof ScoringWeights, string, React.ElementType, number][]).map(([key, label, Icon, _def]) => {
            const pct = Math.round(weights[key] * 100);
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
                  </div>
                  <span className="text-xs font-bold tabular-nums">{pct}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5} value={pct}
                  onChange={e => adjustWeight(key, parseInt(e.target.value, 10))}
                  className="w-full h-1.5 rounded-full appearance-none bg-muted accent-orange-500 cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </CC>

      {/* ── Charts ── */}
      {ads.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CC title="Leads by Ad (Total vs Qualified)">
            <AdLeadsBarChart ads={ads} />
          </CC>
          <CC title="Qualified Lead Trend (14 days)">
            <QualLeadTrendAreaChart ads={ads} />
          </CC>
        </div>
      )}

      {/* ── Per-ad table ── */}
      <div className="space-y-3">
        {/* Filter pills */}
        <div className="flex items-center gap-2">
          {(["all", "green", "yellow", "red"] as TierFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setTierFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                tierFilter === f
                  ? f === "all" ? "bg-orange-500 border-orange-500 text-white"
                    : f === "green" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                    : f === "yellow" ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                    : "bg-rose-500/20 border-rose-500/50 text-rose-400"
                  : "bg-transparent border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? `All (${ads.length})` : f === "green" ? `Scale (${greenCount})` : f === "yellow" ? `Watch (${yellowCount})` : `Cut (${redCount})`}
            </button>
          ))}
        </div>

        {tableRows.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              {data?.computedAt
                ? "No ads match this filter."
                : "No data yet — trigger the Make.com scenario to populate the scorecard."}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs min-w-[860px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Ad</th>
                  <SortHeader k="ghlLeads"       label="Leads" />
                  <SortHeader k="qualifiedLeads" label="Qual" />
                  <SortHeader k="cpql"           label="CPQL" />
                  <SortHeader k="roas"           label="ROAS" />
                  <SortHeader k="trend7d"        label="7d Trend" />
                  <SortHeader k="score"          label="Score" />
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((ad, i) => {
                  const qualPct = ad.ghlLeads > 0 ? Math.round((ad.qualifiedLeads / ad.ghlLeads) * 100) : 0;
                  return (
                    <tr key={i} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <div className="flex items-center gap-2">
                          <TierPill tier={ad.tier} />
                          <span className="font-medium truncate" title={ad.name}>{ad.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{ad.ghlLeads}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        <span>{ad.qualifiedLeads}</span>
                        <span className="text-muted-foreground ml-1">({qualPct}%)</span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {ad.cpql > 0 ? fmt$(ad.cpql) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {ad.roas > 0
                          ? <span className={ad.roas >= 3 ? "text-emerald-400" : ""}>{ad.roas}x</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {isNaN(ad.trend7d) || ad.trend7d === 0
                          ? <span className="flex items-center gap-0.5 text-muted-foreground"><Minus className="h-3 w-3" /> —</span>
                          : ad.trend7d > 0
                          ? <span className="flex items-center gap-0.5 text-emerald-400"><TrendingUp className="h-3 w-3" />+{ad.trend7d}%</span>
                          : <span className="flex items-center gap-0.5 text-rose-400"><TrendingDown className="h-3 w-3" />{ad.trend7d}%</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <AdScoreMiniBar score={ad.score} tier={ad.tier} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[260px]">
                        {ad.recommendation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {ads.length === 0 && !loading && (
        <Card className="bg-card border-border">
          <CardContent className="py-10 flex flex-col items-center gap-3">
            <Phone className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No ad data yet</p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Run the Make.com scenario to fetch Meta + GHL data and populate the scorecard.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
