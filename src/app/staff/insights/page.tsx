"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, LayoutDashboard, DollarSign, Megaphone, Users, TrendingUp, Activity, Share2 } from "lucide-react";
import type { SocialAccount } from "@/app/api/staff/kpi/social/route";
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-sm text-muted-foreground text-center max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function fmt$(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }

// ─── Tab components ─────────────────────────────────────────────────────────

interface PayoutMTD {
  evanTakeHomeMTD: number;
  totalPayoutsMTD: number;
  caelumOwedMTD: number;
  salesTeamOwedMTD: number;
}

function OverviewTab({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [payouts, setPayouts] = useState<PayoutMTD | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [insRes, moneyRes] = await Promise.all([
        fetch("/api/staff/insights"),
        fetch("/api/staff/money"),
      ]);
      if (insRes.ok) setData(await insRes.json());
      else setError("Failed to load overview data.");
      if (moneyRes.ok) {
        const m = await moneyRes.json();
        setPayouts({
          evanTakeHomeMTD:  m.mtd?.evanTakeHome  ?? 0,
          totalPayoutsMTD:  m.mtd?.totalPayouts  ?? 0,
          caelumOwedMTD:    m.mtd?.caelumOwed    ?? 0,
          salesTeamOwedMTD: m.mtd?.salesTeamOwed ?? 0,
        });
      }
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !data) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;
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

function RevenueTab({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/revenue");
      if (res.ok) setData(await res.json());
      else setError("Failed to load revenue data.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !data) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;
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
        <CC title="Revenue Over Time">
          {data.revenueOverTime.length > 0
            ? <RevenueOverTimeChart data={data.revenueOverTime} />
            : <p className="text-xs text-muted-foreground py-8 text-center">No revenue data yet.</p>}
        </CC>
        <CC title="Revenue by Processor">
          {data.netByProcessor.length > 0
            ? <NetByProcessorChart data={data.netByProcessor} />
            : <p className="text-xs text-muted-foreground py-8 text-center">No processor data yet.</p>}
        </CC>
        <CC title="Revenue by Product">
          {data.netByProduct.length > 0
            ? <NetByProductChart data={data.netByProduct} />
            : <p className="text-xs text-muted-foreground py-8 text-center">No product data yet.</p>}
        </CC>
      </div>
    </div>
  );
}

function AdsTab({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/ads");
      if (res.ok) setData(await res.json());
      else setError("Failed to load ads data.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !data) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;
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
        <CC title="Leads Over Time">
          {data.leadsOverTime.length > 0
            ? <LeadsOverTimeChart data={data.leadsOverTime} />
            : <p className="text-xs text-muted-foreground py-8 text-center">No leads data yet — connect Meta Ads and run a sync.</p>}
        </CC>
        <CC title="Leads by Campaign">
          {data.leadsByCampaign.length > 0
            ? <LeadsByCampaignChart data={data.leadsByCampaign} />
            : <p className="text-xs text-muted-foreground py-8 text-center">No campaign data yet.</p>}
        </CC>
      </div>
    </div>
  );
}

function SettersTab({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<SettersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/setters");
      if (res.ok) setData(await res.json());
      else setError("Failed to load setter data. Ensure the Setter KPI sheet is shared with the service account.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !data) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;
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

function TrendsTab({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/trends");
      if (res.ok) setData(await res.json());
      else setError("Failed to load trend data.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !data) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;
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

function ClientsTab({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<ClientsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/clients");
      if (res.ok) setData(await res.json());
      else setError("Failed to load client data.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshSignal]);

  if (loading && !data) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={load} />;
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

// ─── Social Tab ──────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, ReactNode> = {
  instagram: <span className="text-[10px] font-bold leading-none">IG</span>,
  tiktok:    <span className="text-[10px] font-bold leading-none">TK</span>,
  youtube:   <span className="text-[10px] font-bold leading-none">YT</span>,
  twitter:   <span className="text-[10px] font-bold leading-none">X</span>,
};

const PLATFORM_COLOR: Record<string, string> = {
  instagram: "text-pink-400",
  tiktok:    "text-sky-400",
  youtube:   "text-red-400",
  twitter:   "text-blue-400",
};

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function SocialAccountCard({ account }: { account: SocialAccount }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className={PLATFORM_COLOR[account.platform]}>{PLATFORM_ICONS[account.platform]}</span>
          <span className="text-xs font-semibold truncate">{account.handle}</span>
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
            account.brand === "personal"
              ? "bg-orange-500/15 text-orange-400"
              : "bg-emerald-500/15 text-emerald-400"
          }`}>
            {account.brand === "personal" ? "Personal" : "SNS"}
          </span>
        </div>
        {account.error ? (
          <p className="text-xs text-muted-foreground">{account.error}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-bold">{fmtFollowers(account.followers)}</p>
              <p className="text-[10px] text-muted-foreground">Followers</p>
            </div>
            {account.platform !== "youtube" && (
              <div>
                <p className="text-base font-bold">{fmtFollowers(account.following)}</p>
                <p className="text-[10px] text-muted-foreground">Following</p>
              </div>
            )}
            <div className={account.platform === "youtube" ? "col-span-2" : ""}>
              <p className="text-base font-bold">{fmtFollowers(account.posts)}</p>
              <p className="text-[10px] text-muted-foreground">{account.platform === "youtube" ? "Videos" : "Posts"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SocialTab({ refreshSignal }: { refreshSignal: number }) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const url = force ? "/api/staff/kpi/social?refresh=1" : "/api/staff/kpi/social";
      const res = await fetch(url);
      if (!res.ok) { setError("Failed to load social stats."); return; }
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setRefreshedAt(data.refreshedAt ?? null);
      setFromCache(data.fromCache ?? false);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (refreshSignal > 0) load(true); }, [load, refreshSignal]);

  const personal = accounts.filter(a => a.brand === "personal");
  const sns      = accounts.filter(a => a.brand === "sns");

  if (loading && accounts.length === 0) return <Spin />;
  if (error) return <ErrorState message={error} onRetry={() => load(false)} />;

  return (
    <div className="space-y-5">
      {refreshedAt && (
        <p className="text-[11px] text-muted-foreground">
          {fromCache ? "Cached" : "Live"} · Last refreshed {new Date(refreshedAt).toLocaleString()}
          {fromCache && <span className="ml-1 text-orange-400">· Click refresh for live data (takes ~30s)</span>}
        </p>
      )}

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Caelum Harris ENT — Personal Brand
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {personal.length > 0
            ? personal.map((a, i) => <SocialAccountCard key={i} account={a} />)
            : <p className="text-xs text-muted-foreground col-span-4">No data — click refresh.</p>}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          StackNScale Enterprises
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sns.length > 0
            ? sns.map((a, i) => <SocialAccountCard key={i} account={a} />)
            : <p className="text-xs text-muted-foreground col-span-3">No data — confirm SNS handles and click refresh.</p>}
        </div>
        {sns.some(a => a.error?.includes("confirm")) && (
          <p className="text-[11px] text-orange-400 mt-2">
            Some SNS accounts could not be found. Confirm handles are live: @stacknscaleent (IG/TikTok), StackNScale Enterprises (YouTube).
          </p>
        )}
      </div>

      {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Fetching live data from Apify...</div>}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type Tab = "overview" | "revenue" | "ads" | "setters" | "trends" | "clients" | "social";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview",      icon: LayoutDashboard },
  { id: "revenue",  label: "Revenue",       icon: DollarSign      },
  { id: "ads",      label: "Ads",           icon: Megaphone       },
  { id: "setters",  label: "Setters",       icon: Users           },
  { id: "trends",   label: "Monthly Trend", icon: TrendingUp      },
  { id: "clients",  label: "Client Health", icon: Activity        },
  { id: "social",   label: "Social",        icon: Share2          },
];

// Per-tab refresh signals — only the active tab increments when refresh is clicked
type TabRefreshSignals = Record<Tab, number>;

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [refreshSignals, setRefreshSignals] = useState<TabRefreshSignals>({
    overview: 0, revenue: 0, ads: 0, setters: 0, trends: 0, clients: 0, social: 0,
  });

  function handleRefresh() {
    setRefreshSignals(prev => ({ ...prev, [tab]: prev[tab] + 1 }));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">KPI Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Live data across revenue, ads, setters, and client health</p>
        </div>
        <button
          onClick={handleRefresh}
          aria-label="Refresh current tab"
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-orange-500 text-orange-500"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — each tab mounts once and listens to its own refresh signal */}
      <div>
        {tab === "overview" && <OverviewTab refreshSignal={refreshSignals.overview} />}
        {tab === "revenue"  && <RevenueTab  refreshSignal={refreshSignals.revenue}  />}
        {tab === "ads"      && <AdsTab      refreshSignal={refreshSignals.ads}      />}
        {tab === "setters"  && <SettersTab  refreshSignal={refreshSignals.setters}  />}
        {tab === "trends"   && <TrendsTab   refreshSignal={refreshSignals.trends}   />}
        {tab === "clients"  && <ClientsTab  refreshSignal={refreshSignals.clients}  />}
        {tab === "social"   && <SocialTab   refreshSignal={refreshSignals.social}   />}
      </div>
    </div>
  );
}
