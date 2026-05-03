"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import { RevenueOverTimeChart, NetByProductChart, NetByProcessorChart } from "@/components/charts/revenue-chart";
import { LeadsOverTimeChart, LeadsByCampaignChart } from "@/components/charts/ads-charts";
import { CashPerRepChart } from "@/components/charts/rep-charts";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InsightsData {
  totalStudents: number; active: number; alumni: number;
  conversionRate: number; avgDaysToActive: number | null; totalNotes: number;
  pipelineDistribution: { status: string; count: number }[];
  coachWorkload: { coach: string; count: number }[];
}
interface RevenueData {
  cashCollectedMTD: number; cashCollectedLastMonth: number; netRevenueMTD: number;
  mrr: number; totalRefund: number; totalRefundPct: number; monthlyGoal: number;
  revenueOverTime: { date: string; amount: number }[];
  netByProcessor: { name: string; amount: number }[];
  netByProduct:   { name: string; amount: number }[];
}
interface AdsData {
  totalAdSpend: number; totalLeads: number; cpl: number; roas: number;
  ctr: number; cpc: number; impressions: number; reach: number; costPerClose: number;
  leadsByCampaign: { campaign: string; leads: number }[];
  leadsOverTime:   { date: string; leads: number }[];
}
interface SetterRow {
  name: string; cashCollected: number; demosSet: number;
  demosShowed: number; dealsClosed: number; showRate: number; closeRate: number;
}
interface SettersData {
  leaderboard: SetterRow[]; totalCash: number; totalDeals: number; avgCloseRate: number;
}
interface TrendMonth { month: string; gross: number; net: number; refunds: number }
interface TrendsData  { months: TrendMonth[] }
interface ClientRow {
  name: string; email: string; status: string; healthScore: number;
  createdAt: string; activeDate: string | null; coach: string | null;
}
interface ClientsData {
  rows: ClientRow[]; active: number; churned: number; pipeline: number;
  avgHealth: number; distribution: { status: string; count: number }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ORANGE = "#f97316";
const TT = {
  contentStyle: { background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "#e4e4e7" },
};

function CC({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function Spin() {
  return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
}

function fmt$(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

// ─── Tab components ─────────────────────────────────────────────────────────

interface PayoutMTD {
  evanTakeHomeMTD: number;
  totalPayoutsMTD: number;
  caelumOwedMTD: number;
  salesTeamOwedMTD: number;
}

function OverviewTab() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [payouts, setPayouts] = useState<PayoutMTD | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [insRes, moneyRes] = await Promise.all([
      fetch("/api/staff/insights"),
      fetch("/api/staff/money"),
    ]);
    if (insRes.ok) setData(await insRes.json());
    if (moneyRes.ok) {
      const m = await moneyRes.json();
      setPayouts({
        evanTakeHomeMTD:  m.mtd?.evanTakeHome  ?? 0,
        totalPayoutsMTD:  m.mtd?.totalPayouts  ?? 0,
        caelumOwedMTD:    m.mtd?.caelumOwed    ?? 0,
        salesTeamOwedMTD: m.mtd?.salesTeamOwed ?? 0,
      });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Students"    value={data.totalStudents}        variant="default" index={0} />
        <MetricCard label="Active"            value={data.active}               variant="green"   index={1} />
        <MetricCard label="Alumni"            value={data.alumni}               variant="orange"  index={2} />
        <MetricCard label="Conversion Rate"   value={data.conversionRate}       suffix="%" variant="orange" index={3} />
        <MetricCard label="Avg Days to Active" value={data.avgDaysToActive ?? 0} suffix=" d" variant="default" index={4} />
        <MetricCard label="Total Notes"       value={data.totalNotes}           variant="black"   index={5} />
      </div>
      {payouts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Evan Take Home MTD"  value={payouts.evanTakeHomeMTD}  prefix="$" variant="green"   index={6} />
          <MetricCard label="Total Payouts MTD"   value={payouts.totalPayoutsMTD}  prefix="$" variant="black"   index={7} />
          <MetricCard label="Caelum Owed MTD"     value={payouts.caelumOwedMTD}    prefix="$" variant="orange"  index={8} />
          <MetricCard label="Sales Team Owed MTD" value={payouts.salesTeamOwedMTD} prefix="$" variant="default" index={9} />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CC title="Student Pipeline Distribution">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.pipelineDistribution} margin={{ top: 4, right: 8, left: -16, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 9, fill: "#71717a" }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
              <Tooltip {...TT} itemStyle={{ color: ORANGE }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.pipelineDistribution.map((e, i) => (
                  <Cell key={i} fill={e.count > 0 ? ORANGE : "#3f3f46"} fillOpacity={e.count > 0 ? 1 : 0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CC>
        <CC title="Coach Workload">
          {data.coachWorkload.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-8">No coaches assigned yet</p>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.coachWorkload} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                  <YAxis dataKey="coach" type="category" tick={{ fontSize: 11, fill: "#a1a1aa" }} width={80} />
                  <Tooltip {...TT} itemStyle={{ color: ORANGE }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={ORANGE} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </CC>
      </div>
    </div>
  );
}

function RevenueTab() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff/kpi/revenue");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return null;

  const goalPct = data.monthlyGoal > 0 ? Math.min(100, Math.round((data.cashCollectedMTD / data.monthlyGoal) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Gross MTD"       value={data.cashCollectedMTD}      prefix="$" variant="orange" index={0} />
        <MetricCard label="Net Revenue MTD" value={data.netRevenueMTD}         prefix="$" variant="green"  index={1} />
        <MetricCard label="MRR"             value={data.mrr}                   prefix="$" variant="default" index={2} />
        <MetricCard label="Refunds MTD"     value={data.totalRefund}           prefix="$" variant="black"  index={3} />
        <MetricCard label="Refund %"        value={parseFloat((data.totalRefundPct * 100).toFixed(1))} suffix="%" variant="default" index={4} decimals={1} />
        <MetricCard label="Last Month"      value={data.cashCollectedLastMonth} prefix="$" variant="default" index={5} />
      </div>

      {data.monthlyGoal > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="px-4 py-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Pace to Goal</span>
              <span>{fmt$(data.cashCollectedMTD)} / {fmt$(data.monthlyGoal)} — {goalPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all duration-700" style={{ width: `${goalPct}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.revenueOverTime.length > 0 && (
          <CC title="Revenue Over Time"><RevenueOverTimeChart data={data.revenueOverTime} /></CC>
        )}
        {data.netByProcessor.length > 0 && (
          <CC title="Revenue by Processor"><NetByProcessorChart data={data.netByProcessor} /></CC>
        )}
        {data.netByProduct.length > 0 && (
          <CC title="Revenue by Product"><NetByProductChart data={data.netByProduct} /></CC>
        )}
      </div>
    </div>
  );
}

function AdsTab() {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff/kpi/ads");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Ad Spend"     value={data.totalAdSpend} prefix="$" variant="black"   index={0} />
        <MetricCard label="Leads"        value={data.totalLeads}              variant="default"  index={1} />
        <MetricCard label="CPL"          value={data.cpl}          prefix="$" variant="orange"  index={2} decimals={2} />
        <MetricCard label="ROAS"         value={data.roas}                    variant="green"    index={3} decimals={2} suffix="x" />
        <MetricCard label="Cost/Close"   value={data.costPerClose} prefix="$" variant="default"  index={4} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="CTR"          value={data.ctr}  suffix="%" variant="default" index={5} decimals={2} />
        <MetricCard label="CPC"          value={data.cpc}  prefix="$" variant="default" index={6} decimals={2} />
        <MetricCard label="Impressions"  value={data.impressions}     variant="default" index={7} />
        <MetricCard label="Reach"        value={data.reach}           variant="default" index={8} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.leadsOverTime.length > 0 && (
          <CC title="Leads Over Time"><LeadsOverTimeChart data={data.leadsOverTime} /></CC>
        )}
        {data.leadsByCampaign.length > 0 && (
          <CC title="Leads by Campaign"><LeadsByCampaignChart data={data.leadsByCampaign} /></CC>
        )}
        {data.totalLeads === 0 && (
          <CC title="Ads Data">
            <p className="text-xs text-muted-foreground py-8 text-center">
              No Meta Ads data yet — run a sync from Settings to pull live data.
            </p>
          </CC>
        )}
      </div>
    </div>
  );
}

function SettersTab() {
  const [data, setData] = useState<SettersData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff/kpi/setters");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Total Cash Collected" value={data.totalCash}     prefix="$" variant="green"   index={0} />
        <MetricCard label="Total Deals Closed"   value={data.totalDeals}               variant="orange"  index={1} />
        <MetricCard label="Avg Close Rate"       value={data.avgCloseRate} suffix="%" variant="default"  index={2} decimals={1} />
      </div>

      {data.leaderboard.length === 0
        ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              No setter data yet — ensure the Setter KPI Tracker sheet is shared with the service account.
            </CardContent>
          </Card>
        )
        : (
          <>
            <CC title="Setter Leaderboard">
              <CashPerRepChart data={data.leaderboard.map(r => ({
                name: r.name, cashCollected: r.cashCollected,
                callsMade: 0, callsAnswered: 0, demosSet: r.demosSet,
                demosShowed: r.demosShowed, pitched: 0, dealsClosed: r.dealsClosed, answerRate: 0,
              }))} />
            </CC>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {["Setter", "Cash Collected", "Demos Set", "Showed", "Closed", "Show Rate", "Close Rate"].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard
                    .sort((a, b) => b.cashCollected - a.cashCollected)
                    .map((r, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-green-400">{fmt$(r.cashCollected)}</td>
                        <td className="px-3 py-2">{r.demosSet}</td>
                        <td className="px-3 py-2">{r.demosShowed}</td>
                        <td className="px-3 py-2">{r.dealsClosed}</td>
                        <td className="px-3 py-2">{r.showRate}%</td>
                        <td className="px-3 py-2">
                          <span className={r.closeRate >= 30 ? "text-green-400" : r.closeRate >= 15 ? "text-orange-400" : "text-red-400"}>
                            {r.closeRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}

function TrendsTab() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff/kpi/trends");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return null;

  const fmtK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CC title="Monthly Gross Revenue (6 Months)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.months} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`$${Number(v).toLocaleString()}`, "Gross"]}
              />
              <Bar dataKey="gross" fill={ORANGE} radius={[4, 4, 0, 0]} animationDuration={900} />
            </BarChart>
          </ResponsiveContainer>
        </CC>
        <CC title="Monthly Net Revenue (6 Months)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.months} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
                formatter={(v) => [`$${Number(v).toLocaleString()}`, "Net"]}
              />
              <Bar dataKey="net" fill="#22c55e" radius={[4, 4, 0, 0]} animationDuration={900} />
            </BarChart>
          </ResponsiveContainer>
        </CC>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {["Month", "Gross", "Refunds", "Net", "MoM Change"].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.months.map((m, i) => {
              const prev = data.months[i - 1];
              const mom  = prev && prev.net > 0 ? ((m.net - prev.net) / prev.net * 100).toFixed(1) : null;
              return (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{m.month}</td>
                  <td className="px-3 py-2 text-orange-400">{fmt$(m.gross)}</td>
                  <td className="px-3 py-2 text-red-400">-{fmt$(m.refunds)}</td>
                  <td className="px-3 py-2 text-green-400">{fmt$(m.net)}</td>
                  <td className="px-3 py-2">
                    {mom !== null ? (
                      <span className={parseFloat(mom) >= 0 ? "text-green-400" : "text-red-400"}>
                        {parseFloat(mom) >= 0 ? "+" : ""}{mom}%
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientsTab() {
  const [data, setData] = useState<ClientsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff/kpi/clients");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return null;

  const healthColor = (score: number) =>
    score >= 85 ? "text-green-400" : score >= 50 ? "text-orange-400" : "text-red-400";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Active Clients"  value={data.active}    variant="green"   index={0} />
        <MetricCard label="In Pipeline"     value={data.pipeline}  variant="orange"  index={1} />
        <MetricCard label="Alumni"          value={data.churned}   variant="black"   index={2} />
        <MetricCard label="Avg Health Score" value={data.avgHealth} suffix="%" variant="default" index={3} />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {["Client", "Status", "Health", "Coach", "Enrolled", "Active Since"].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.status}</td>
                <td className={`px-3 py-2 font-semibold ${healthColor(r.healthScore)}`}>{r.healthScore}%</td>
                <td className="px-3 py-2 text-muted-foreground">{r.coach ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.activeDate
                    ? new Date(r.activeDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type Tab = "overview" | "revenue" | "ads" | "setters" | "trends" | "clients";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview"       },
  { id: "revenue",  label: "Revenue"        },
  { id: "ads",      label: "Ads"            },
  { id: "setters",  label: "Setters"        },
  { id: "trends",   label: "Monthly Trend"  },
  { id: "clients",  label: "Client Health"  },
];

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">KPI Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live data across revenue, ads, setters, and client health</p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-orange-500 text-orange-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — keyed by tab+refreshKey to remount on refresh */}
      <div key={`${tab}-${refreshKey}`}>
        {tab === "overview" && <OverviewTab />}
        {tab === "revenue"  && <RevenueTab />}
        {tab === "ads"      && <AdsTab />}
        {tab === "setters"  && <SettersTab />}
        {tab === "trends"   && <TrendsTab />}
        {tab === "clients"  && <ClientsTab />}
      </div>
    </div>
  );
}
