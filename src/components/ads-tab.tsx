"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Cell, LineChart,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { type ScoredAd, type ScorecardCache, CPL_TARGET } from "@/lib/ads-scorecard";

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG     = "#0E1116";
const PANEL  = "#161B22";
const BORDER = "rgba(255,255,255,0.07)";
const MINT   = "#2DD4BF";
const AMBER  = "#F59E0B";
const RED    = "#EF4444";
const BLUE   = "#3B82F6";

const verdictColor: Record<ScoredAd["verdict"], string> = {
  scale: MINT, keep: MINT, watch: AMBER, cut: RED,
};
const verdictBg: Record<ScoredAd["verdict"], string> = {
  scale: "rgba(45,212,191,0.10)", keep: "rgba(45,212,191,0.07)",
  watch: "rgba(245,158,11,0.10)", cut: "rgba(239,68,68,0.10)",
};
const TT = {
  contentStyle: { background: "#1a1f2e", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: "#888" },
};

const fmt$ = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtD = (n: number, d = 1) => n.toLocaleString("en-US", { maximumFractionDigits: d });

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, verdict }: { score: number; verdict: ScoredAd["verdict"] }) {
  const r = 20; const c = 2 * Math.PI * r;
  const fill = c - (score / 100) * c;
  const color = verdictColor[verdict];
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
      <circle cx={26} cy={26} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
      <circle cx={26} cy={26} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={c} strokeDashoffset={fill}
        strokeLinecap="round" transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x={26} y={30} textAnchor="middle" fontSize={13} fontWeight={700}
        fill={color} fontFamily="monospace">{score}</text>
    </svg>
  );
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: ScoredAd["verdict"] }) {
  const color = verdictColor[verdict];
  return (
    <span style={{
      background: verdictBg[verdict], color, border: `1px solid ${color}30`,
      borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase" as const, fontFamily: "monospace",
    }}>
      {verdict}
    </span>
  );
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number }) {
  const up = pct > 0; const flat = pct === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? "#777" : up ? MINT : RED;
  return (
    <span style={{ color, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontFamily: "monospace" }}>
      <Icon size={11} />
      {up ? "+" : ""}{fmtD(pct)}%
    </span>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

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

// ── Ad card ───────────────────────────────────────────────────────────────────

function AdCard({ ad }: { ad: ScoredAd }) {
  const color = verdictColor[ad.verdict];
  const cplOver = ad.cpl > CPL_TARGET;
  return (
    <div style={{
      background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: "16px", display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <ScoreRing score={ad.score} verdict={ad.verdict} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#e8eaed", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ad.name}
            </p>
            <VerdictBadge verdict={ad.verdict} />
          </div>
          {/* Metric row */}
          <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
            {[
              { label: "Leads",  value: String(ad.ghlLeads) },
              { label: "CPL",    value: fmt$(ad.cpl), warn: cplOver },
              { label: "Spend",  value: fmt$(ad.spend) },
              { label: "Booked", value: ad.ghlLeads > 0 ? `${ad.booked} (${fmtD((ad.booked / ad.ghlLeads) * 100)}%)` : "0" },
            ].map(({ label, value, warn }) => (
              <div key={label}>
                <p style={{ fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>{label}</p>
                <p style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 600, color: warn ? AMBER : "#c9d1d9", margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sparkline + trend */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}><Sparkline data={ad.trendDays} color={color} /></div>
        <TrendBadge pct={ad.trend7d} />
      </div>

      {/* Rationale callout */}
      <div style={{ background: verdictBg[ad.verdict], border: `1px solid ${color}20`, borderRadius: 6, padding: "8px 10px" }}>
        <p style={{ fontSize: 11, color: "#c9d1d9", margin: 0, lineHeight: 1.5 }}>{ad.recommendation}</p>
      </div>
    </div>
  );
}

// ── Action queue card ─────────────────────────────────────────────────────────

function QueueCard({ title, color, ads, footer }: {
  title: string; color: string; ads: ScoredAd[]; footer?: string;
}) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${color}25`, borderRadius: 10, flex: 1, minWidth: 200 }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{title}</p>
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {ads.length === 0 && <p style={{ fontSize: 11, color: "#555", margin: 0 }}>None</p>}
        {ads.map(ad => (
          <div key={ad.name} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 7 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#c9d1d9", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ad.name}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
              {[
                { k: "CPL",    v: fmt$(ad.cpl) },
                { k: "Leads",  v: String(ad.ghlLeads) },
                { k: "Booked", v: String(ad.booked) },
                { k: "Spend",  v: fmt$(ad.spend) },
              ].map(({ k, v }) => (
                <span key={k} style={{ fontSize: 10, fontFamily: "monospace", color: "#888" }}>
                  <span style={{ color: "#555" }}>{k} </span>{v}
                </span>
              ))}
            </div>
          </div>
        ))}
        {footer && <p style={{ fontSize: 10, color, fontFamily: "monospace", marginTop: 4, margin: 0 }}>{footer}</p>}
      </div>
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────────

function KpiBox({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", flex: 1, minWidth: 100 }}>
      <p style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 700, color: warn ? AMBER : "#e8eaed", margin: "4px 0 0" }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: "#555", margin: "2px 0 0", fontFamily: "monospace" }}>{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SortKey = "score" | "ghlLeads" | "cpl";

export function AdsTab() {
  const [cache, setCache]       = useState<ScorecardCache | null>(null);
  const [loading, setLoading]   = useState(true);
  const [subTab, setSubTab]     = useState<"individual" | "overall">("individual");
  const [sortKey, setSortKey]   = useState<SortKey>("score");
  const [sortAsc, setSortAsc]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState("");

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

  // Action queue buckets
  const cutAds   = ads.filter(a => a.verdict === "cut");
  const watchAds = ads.filter(a => a.verdict === "watch");
  const scaleAds = ads.filter(a => a.verdict === "scale" || a.verdict === "keep");
  const cutSpend = cutAds.reduce((s, a) => s + a.spend, 0);

  // Dual-axis chart: aggregate daily leads + daily spend across ads
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

  // Horizontal bar data — sorted by leads descending
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

  // ── Empty / loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: BG, minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555", fontSize: 13 }}>Loading scorecard…</p>
      </div>
    );
  }
  if (!ads.length) {
    return (
      <div style={{ background: BG, borderRadius: 12, padding: 40, textAlign: "center" }}>
        <p style={{ color: "#555", fontSize: 13, margin: 0 }}>No ad data yet.</p>
        <p style={{ color: "#444", fontSize: 11, marginTop: 6, marginBottom: 18 }}>
          Pull live data from Meta + GHL to populate the scorecard.
        </p>
        <button
          onClick={syncNow}
          disabled={syncing}
          style={{
            background: syncing ? "rgba(249,115,22,0.1)" : "rgba(249,115,22,0.15)",
            color: "#f97316", border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 600,
            cursor: syncing ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          {syncing ? "Syncing…" : "Sync Ads Data"}
        </button>
        {syncMsg && <p style={{ color: "#888", fontSize: 11, marginTop: 10 }}>{syncMsg}</p>}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, borderRadius: 12, overflow: "hidden" }}>

      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["individual", "overall"] as const).map(t => (
            <button key={t} onClick={() => setSubTab(t)} style={{
              background: subTab === t ? "rgba(255,255,255,0.07)" : "transparent",
              border: `1px solid ${subTab === t ? BORDER : "transparent"}`,
              borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 600,
              color: subTab === t ? "#e8eaed" : "#555", cursor: "pointer",
              textTransform: "capitalize",
            }}>
              {t === "individual" ? "Individual Ads" : "Overall"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {cache?.computedAt && (
            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>
              {new Date(cache.computedAt).toLocaleTimeString()}
            </span>
          )}
          <button onClick={syncNow} disabled={syncing} style={{
            background: syncing ? "rgba(249,115,22,0.08)" : "rgba(249,115,22,0.12)",
            border: "1px solid rgba(249,115,22,0.25)", borderRadius: 6,
            padding: "5px 12px", cursor: syncing ? "not-allowed" : "pointer",
            color: "#f97316", display: "flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={12} style={{ animation: syncing ? "spin 1s linear infinite" : undefined }} />
            <span style={{ fontSize: 11 }}>{syncing ? "Syncing…" : "Sync"}</span>
          </button>
          <button onClick={() => load(true)} disabled={refreshing} style={{
            background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6,
            padding: "5px 10px", cursor: "pointer", color: "#666", display: "flex", alignItems: "center", gap: 5,
          }}>
            <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }} />
            <span style={{ fontSize: 11 }}>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── INDIVIDUAL ADS SUB-TAB ── */}
      {subTab === "individual" && (
        <div style={{ padding: 18 }}>
          {/* Sort controls */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {([["score", "Score"], ["ghlLeads", "Leads"], ["cpl", "CPL"]] as [SortKey, string][]).map(([k, label]) => {
              const active = sortKey === k;
              return (
                <button key={k} onClick={() => { if (active) setSortAsc(p => !p); else { setSortKey(k); setSortAsc(k === "cpl"); } }}
                  style={{
                    background: active ? "rgba(255,255,255,0.08)" : "transparent",
                    border: `1px solid ${active ? BORDER : "rgba(255,255,255,0.04)"}`,
                    borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: active ? 600 : 400,
                    color: active ? "#c9d1d9" : "#555", cursor: "pointer",
                  }}>
                  {label} {active ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              );
            })}
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#444", alignSelf: "center" }}>
              {ads.length} active ad{ads.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Ad cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {sorted.map(ad => <AdCard key={ad.name} ad={ad} />)}
          </div>
        </div>
      )}

      {/* ── OVERALL SUB-TAB ── */}
      {subTab === "overall" && (
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Action queue */}
          <div>
            <p style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10, fontWeight: 600 }}>Action Queue</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <QueueCard title="✂ Cut Now" color={RED} ads={cutAds}
                footer={cutSpend > 0 ? `Spend to cut: ${fmt$(cutSpend)}` : undefined} />
              <QueueCard title="👁 Watch" color={AMBER} ads={watchAds} />
              <QueueCard title="🚀 Scale / Keep" color={MINT} ads={scaleAds} />
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KpiBox label="Live Ads"     value={String(ads.length)} />
            <KpiBox label="Total Leads"  value={String(summary?.totalLeads ?? 0)} />
            <KpiBox label="Total Spend"  value={fmt$(summary?.spendMTD ?? 0)} />
            <KpiBox label="Blended CPL"  value={fmt$(blendedCpl)}
              sub={`target ${fmt$(CPL_TARGET)}`} warn={blendedCpl > CPL_TARGET} />
            <KpiBox label="Booked"       value={String(summary?.bookedCalls ?? 0)} />
          </div>

          {/* Dual-axis trend chart */}
          {trendData.length > 0 && (
            <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", margin: "0 0 10px" }}>14-Day: Leads (bars) vs Spend (line)</p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={trendData} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left"  tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: BLUE, fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `$${v}`} />
                  <Tooltip {...TT} />
                  <Bar    yAxisId="left"  dataKey="leads" fill="rgba(45,212,191,0.35)" radius={[3,3,0,0]} animationDuration={600} />
                  <Line  yAxisId="right" dataKey="spend" stroke={BLUE} strokeWidth={2} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Leads by ad */}
          {barData.length > 0 && (
            <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", margin: "0 0 10px" }}>Leads by Ad</p>
              <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 32)}>
                <BarChart layout="vertical" data={barData} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: "#555", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip {...TT} formatter={(v) => [v, "Leads"]} />
                  <Bar dataKey="leads" radius={[0, 3, 3, 0]} animationDuration={600}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={verdictColor[entry.verdict]} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Breakdown table */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", margin: 0, padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
              Breakdown
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {["Ad", "Score", "Leads", "CPL", "CTR", "Booked", "Spend", "Verdict"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: h === "Ad" ? "left" : "right",
                        color: "#555", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                        whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...ads].sort((a, b) => b.score - a.score).map((ad, i) => (
                    <tr key={ad.name} style={{ borderBottom: i < ads.length - 1 ? `1px solid ${BORDER}` : undefined }}>
                      <td style={{ padding: "8px 12px", color: "#c9d1d9", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: verdictColor[ad.verdict] }}>{ad.score}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#c9d1d9" }}>{ad.ghlLeads}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: ad.cpl > CPL_TARGET ? AMBER : "#c9d1d9" }}>{fmt$(ad.cpl)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#c9d1d9" }}>{fmtD(ad.ctr, 2)}%</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#c9d1d9" }}>{ad.booked}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#c9d1d9" }}>{fmt$(ad.spend)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}><VerdictBadge verdict={ad.verdict} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
