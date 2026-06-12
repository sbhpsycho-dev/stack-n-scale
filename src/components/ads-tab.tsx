"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Cell, LineChart,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ScoredAd, type ScorecardCache, CPL_TARGET } from "@/lib/ads-scorecard";

const VERDICT_COLOR: Record<ScoredAd["verdict"], string> = {
  scale: "#34d399", keep: "#34d399", watch: "#fbbf24", cut: "#f87171",
};
const VERDICT_CLS: Record<ScoredAd["verdict"], string> = {
  scale: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  keep:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  watch: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  cut:   "bg-red-500/10 text-red-400 border-red-500/20",
};
const VERDICT_CALLOUT_CLS: Record<ScoredAd["verdict"], string> = {
  scale: "bg-emerald-500/5 border-emerald-500/15",
  keep:  "bg-emerald-500/5 border-emerald-500/15",
  watch: "bg-amber-500/5 border-amber-500/15",
  cut:   "bg-red-500/5 border-red-500/15",
};
const TT = {
  contentStyle: { background: "#0a0a0a", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: "hsl(var(--muted-foreground))" },
};

const fmt$ = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtD = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });

function ScoreRing({ score, verdict }: { score: number; verdict: ScoredAd["verdict"] }) {
  const r = 20; const c = 2 * Math.PI * r;
  const fill = c - (score / 100) * c;
  const color = VERDICT_COLOR[verdict];
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" className="flex-shrink-0">
      <circle cx={26} cy={26} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
      <circle cx={26} cy={26} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={c} strokeDashoffset={fill}
        strokeLinecap="round" transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x={26} y={30} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>{score}</text>
    </svg>
  );
}

function VerdictBadge({ verdict }: { verdict: ScoredAd["verdict"] }) {
  return (
    <Badge className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 border ${VERDICT_CLS[verdict]}`}>
      {verdict}
    </Badge>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  const up = pct > 0; const flat = pct === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const cls = flat ? "text-muted-foreground" : up ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-mono ${cls}`}>
      <Icon size={11} />
      {up ? "+" : ""}{fmtD(pct)}%
    </span>
  );
}

function Sparkline({ data, color }: { data: { qualLeads: number }[]; color: string }) {
  const pts = data.map((d, i) => ({ i, v: d.qualLeads }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <LineChart data={pts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AdCard({ ad }: { ad: ScoredAd }) {
  const color = VERDICT_COLOR[ad.verdict];
  const cplOver = ad.cpl > CPL_TARGET;
  return (
    <Card className="bg-card border-border hover:border-orange-500/20 transition-colors">
      <CardContent className="px-4 py-4 space-y-3">
        <div className="flex items-start gap-3">
          <ScoreRing score={ad.score} verdict={ad.verdict} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{ad.name}</p>
              <VerdictBadge verdict={ad.verdict} />
            </div>
            <div className="flex gap-4 mt-1.5 flex-wrap">
              {[
                { label: "Leads",  value: String(ad.ghlLeads) },
                { label: "CPL",    value: fmt$(ad.cpl), warn: cplOver },
                { label: "Spend",  value: fmt$(ad.spend) },
                { label: "Booked", value: ad.ghlLeads > 0 ? `${ad.booked} (${fmtD((ad.booked / ad.ghlLeads) * 100)}%)` : "0" },
              ].map(({ label, value, warn }) => (
                <div key={label}>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{label}</p>
                  <p className={`text-xs font-semibold font-mono ${warn ? "text-amber-400" : "text-foreground"}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1"><Sparkline data={ad.trendDays} color={color} /></div>
          <TrendBadge pct={ad.trend7d} />
        </div>
        <div className={`rounded-md px-3 py-2 border ${VERDICT_CALLOUT_CLS[ad.verdict]}`}>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{ad.recommendation}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueCard({ title, color, ads, footer }: {
  title: string; color: string; ads: ScoredAd[]; footer?: string;
}) {
  return (
    <Card className="flex-1 min-w-[200px]" style={{ borderColor: `${color}25` }}>
      <div className="px-3.5 py-2.5 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{title}</p>
      </div>
      <CardContent className="px-3.5 py-2.5 space-y-2">
        {ads.length === 0 && <p className="text-[11px] text-muted-foreground/50">None</p>}
        {ads.map(ad => (
          <div key={ad.name} className="border-b border-border pb-2 last:border-0 last:pb-0">
            <p className="text-xs font-semibold text-foreground truncate">{ad.name}</p>
            <div className="flex gap-2.5 mt-1 flex-wrap">
              {[
                { k: "CPL",    v: fmt$(ad.cpl) },
                { k: "Leads",  v: String(ad.ghlLeads) },
                { k: "Booked", v: String(ad.booked) },
                { k: "Spend",  v: fmt$(ad.spend) },
              ].map(({ k, v }) => (
                <span key={k} className="text-[10px] font-mono text-muted-foreground">
                  <span className="text-muted-foreground/50">{k} </span>{v}
                </span>
              ))}
            </div>
          </div>
        ))}
        {footer && <p className="text-[10px] font-mono mt-1" style={{ color }}>{footer}</p>}
      </CardContent>
    </Card>
  );
}

function KpiBox({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Card className="flex-1 min-w-[100px] bg-card border-border">
      <CardContent className="px-3.5 py-3">
        <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className={`text-lg font-bold font-mono mt-1 ${warn ? "text-amber-400" : "text-foreground"}`}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SortKey = "score" | "ghlLeads" | "cpl";

export function AdsTab() {
  const [cache, setCache]           = useState<ScorecardCache | null>(null);
  const [loading, setLoading]       = useState(true);
  const [subTab, setSubTab]         = useState<"individual" | "overall">("individual");
  const [sortKey, setSortKey]       = useState<SortKey>("score");
  const [sortAsc, setSortAsc]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncMsg, setSyncMsg]       = useState("");

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/staff/ads/scorecard");
      if (res.ok) setCache(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/admin/sync-ads", { method: "POST" });
      const json = await res.json() as { ok: boolean; adCount?: number };
      if (json.ok) {
        setSyncMsg(`Synced ${json.adCount ?? 0} ads`);
        await load(false);
      } else {
        setSyncMsg("Sync failed — check env vars");
      }
    } catch {
      setSyncMsg("Network error");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 300_000);
    return () => clearInterval(id);
  }, []);

  const ads = useMemo<ScoredAd[]>(() => cache?.ads ?? [], [cache]);
  const summary = cache?.summary;

  const sorted = useMemo(() => {
    return [...ads].sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "cpl") return ((a.cpl || Infinity) - (b.cpl || Infinity)) * mul;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * mul;
    });
  }, [ads, sortKey, sortAsc]);

  const cutAds   = ads.filter(a => a.verdict === "cut");
  const watchAds = ads.filter(a => a.verdict === "watch");
  const scaleAds = ads.filter(a => a.verdict === "scale" || a.verdict === "keep");
  const cutSpend = cutAds.reduce((s, a) => s + a.spend, 0);

  const trendData = useMemo(() => {
    if (!ads.length) return [];
    const dayLeads: Record<string, number> = {};
    for (const ad of ads) {
      for (const d of ad.trendDays) {
        dayLeads[d.date] = (dayLeads[d.date] ?? 0) + d.qualLeads;
      }
    }
    const days = Object.keys(dayLeads).sort();
    const dailySpend = summary ? summary.spendMTD / Math.max(days.length, 1) : 0;
    return days.map(date => ({ date: date.slice(5), leads: dayLeads[date], spend: dailySpend }));
  }, [ads, summary]);

  const barData = useMemo(() =>
    [...ads].sort((a, b) => b.ghlLeads - a.ghlLeads).map(a => ({
      name: a.name.length > 22 ? a.name.slice(0, 20) + "…" : a.name,
      leads: a.ghlLeads,
      verdict: a.verdict,
    })),
  [ads]);

  const blendedCpl = summary && summary.totalLeads > 0
    ? parseFloat((summary.spendMTD / summary.totalLeads).toFixed(2))
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-background">

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <div className="flex gap-1">
          {(["individual", "overall"] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                subTab === t
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}>
              {t === "individual" ? "Individual Ads" : "Overall"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          {cache?.computedAt && (
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {new Date(cache.computedAt).toLocaleTimeString()}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing}
            className="h-7 text-xs gap-1.5 border-orange-500/30 text-orange-400 hover:bg-orange-500/5">
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing}
            className="h-7 text-xs gap-1.5">
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── INDIVIDUAL ADS ── */}
      {subTab === "individual" && (
        <div className="p-4">
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {([["score", "Score"], ["ghlLeads", "Leads"], ["cpl", "CPL"]] as [SortKey, string][]).map(([k, label]) => {
              const active = sortKey === k;
              return (
                <button key={k} onClick={() => { if (active) setSortAsc(p => !p); else { setSortKey(k); setSortAsc(k === "cpl"); } }}
                  className={`px-3 py-1 rounded-md text-xs border transition-colors ${
                    active
                      ? "bg-card border-border text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {label} {active ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              );
            })}
            <span className="ml-auto text-[10px] text-muted-foreground/50 self-center">
              {ads.length} active ad{ads.length !== 1 ? "s" : ""}
            </span>
          </div>

          {sorted.length > 0 ? (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {sorted.map(ad => <AdCard key={ad.name} ad={ad} />)}
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground mb-2">No Meta ads synced yet.</p>
              <p className="text-xs text-muted-foreground/60 mb-5">Click Sync to pull data from Meta + GHL.</p>
              <Button variant="outline" onClick={syncNow} disabled={syncing}
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/5">
                <RefreshCw className={`h-3.5 w-3.5 mr-2 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync Ads Data"}
              </Button>
              {syncMsg && <p className="text-xs text-muted-foreground mt-3">{syncMsg}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── OVERALL ── */}
      {subTab === "overall" && (
        <div className="p-4 space-y-5">

          {/* Action queue */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2.5">Action Queue</p>
            <div className="flex gap-3 flex-wrap">
              <QueueCard title="✂ Cut Now" color="#f87171" ads={cutAds}
                footer={cutSpend > 0 ? `Spend to cut: ${fmt$(cutSpend)}` : undefined} />
              <QueueCard title="👁 Watch" color="#fbbf24" ads={watchAds} />
              <QueueCard title="🚀 Scale / Keep" color="#34d399" ads={scaleAds} />
            </div>
          </div>

          {/* KPI strip */}
          <div className="flex gap-2.5 flex-wrap">
            <KpiBox label="Live Ads"    value={String(ads.length)} />
            <KpiBox label="Total Leads" value={String(summary?.totalLeads ?? 0)} />
            <KpiBox label="Total Spend" value={fmt$(summary?.spendMTD ?? 0)} />
            <KpiBox label="Blended CPL" value={fmt$(blendedCpl)}
              sub={`target ${fmt$(CPL_TARGET)}`} warn={blendedCpl > CPL_TARGET} />
            <KpiBox label="Booked"      value={String(summary?.bookedCalls ?? 0)} />
          </div>

          {/* Dual-axis trend chart */}
          {trendData.length > 0 && (
            <Card className="bg-card border-border">
              <CardContent className="px-4 py-4">
                <p className="text-[11px] font-semibold text-muted-foreground mb-2.5">14-Day: Leads (bars) vs Spend (line)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={trendData} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left"  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#f97316", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip {...TT} />
                    <Bar   yAxisId="left"  dataKey="leads" fill="rgba(52,211,153,0.35)" radius={[3,3,0,0]} animationDuration={600} />
                    <Line  yAxisId="right" dataKey="spend" stroke="#f97316" strokeWidth={2} dot={false} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Leads by ad */}
          {barData.length > 0 && (
            <Card className="bg-card border-border">
              <CardContent className="px-4 py-4">
                <p className="text-[11px] font-semibold text-muted-foreground mb-2.5">Leads by Ad</p>
                <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 32)}>
                  <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip {...TT} formatter={(v) => [v, "Leads"]} />
                    <Bar dataKey="leads" radius={[0, 3, 3, 0]} animationDuration={600}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={VERDICT_COLOR[entry.verdict]} fillOpacity={0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Breakdown table */}
          <Card className="bg-card border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[11px] font-semibold text-muted-foreground">Breakdown</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-border">
                    {["Ad", "Score", "Leads", "CPL", "CTR", "Booked", "Spend", "Verdict"].map(h => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap ${h === "Ad" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-5 text-center text-[11px] text-muted-foreground/50">
                        No data — sync to populate
                      </td>
                    </tr>
                  ) : [...ads].sort((a, b) => b.score - a.score).map((ad, i) => (
                    <tr key={ad.name} className={i < ads.length - 1 ? "border-b border-border" : ""}>
                      <td className="px-3 py-2 text-foreground max-w-[180px] truncate">{ad.name}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: VERDICT_COLOR[ad.verdict] }}>{ad.score}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">{ad.ghlLeads}</td>
                      <td className={`px-3 py-2 text-right font-mono ${ad.cpl > CPL_TARGET ? "text-amber-400" : "text-foreground"}`}>{fmt$(ad.cpl)}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">{fmtD(ad.ctr, 2)}%</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">{ad.booked}</td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">{fmt$(ad.spend)}</td>
                      <td className="px-3 py-2 text-right"><VerdictBadge verdict={ad.verdict} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* GHL Pipeline */}
          <Card className="bg-card border-border">
            <CardContent className="px-4 py-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">GHL Pipeline</p>
              <div className="flex gap-3 flex-wrap">
                {[
                  { label: "Total Leads",  value: String(summary?.totalLeads      ?? 0) },
                  { label: "Qualified",    value: String(summary?.qualifiedLeads   ?? 0) },
                  { label: "Booked Calls", value: String(summary?.bookedCalls      ?? 0) },
                  { label: "Total Spend",  value: fmt$(summary?.spendMTD           ?? 0) },
                  { label: "ROAS",         value: `${(summary?.roas ?? 0).toFixed(2)}x`  },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-background border border-border rounded-lg px-4 py-2.5 min-w-[90px]">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">{label}</p>
                    <p className="text-base font-bold font-mono text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Google Ads placeholder */}
          <Card className="bg-card border-border opacity-60">
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Google Ads</p>
                <Badge className="text-[9px] font-bold tracking-widest bg-muted text-muted-foreground border-border">COMING SOON</Badge>
              </div>
              <p className="text-xs text-muted-foreground/60">Connect a Google Ads account to track spend, CPL, and lead quality alongside Meta.</p>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
