"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PersonalKPI {
  totalDeals: number;
  totalGross: number;
  totalCommission: number;
  mtdDeals: number;
  mtdGross: number;
  mtdCommission: number;
  weekDeals: number;
  weekCommission: number;
  recentDeals: { date: string; clientName: string; gross: number; commission: number; role: string }[];
  growthByWeek: { week: string; commission: number; deals: number }[];
  growthByMonth: { month: string; commission: number; deals: number }[];
}

interface MyPipelineData {
  callsMade: number; callsAnswered: number; demosSet: number;
  demosShowed: number; pitched: number; closed: number; cashCollected: number;
  answerRate: number; showRate: number; closeRate: number; demoToClose: number;
}

const TT = {
  contentStyle: { background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "#e4e4e7" },
};

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function MyNumbersPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<PersonalKPI | null>(null);
  const [pipelineData, setPipelineData] = useState<MyPipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kpiRes, pipeRes] = await Promise.all([
        fetch("/api/staff/personal/kpi"),
        fetch("/api/staff/kpi/my-pipeline"),
      ]);
      if (!kpiRes.ok) {
        setError("Failed to load your numbers. Contact Evan if this persists.");
        return;
      }
      setData(await kpiRes.json());
      if (pipeRes.ok) setPipelineData(await pipeRes.json());
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const name = session?.user?.name ?? "Rep";
  const hasData = data && data.totalDeals > 0;
  const isMonthly = Boolean(data && data.growthByMonth.length > 0);
  const chartData: { label: string; commission: number; deals: number }[] = data
    ? (isMonthly
        ? data.growthByMonth.map((d) => ({ label: d.month, commission: d.commission, deals: d.deals }))
        : data.growthByWeek.map((d) => ({ label: d.week, commission: d.commission, deals: d.deals })))
    : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-500" />
            My Numbers
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{name} — personal deal stats from your sheet</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh"
          className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground text-xs disabled:opacity-50"
        >
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
          <button
            onClick={load}
            className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* No sheet configured or no data yet */}
      {!loading && !error && data && !hasData && (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-xs text-muted-foreground">
            {session?.user?.sheetId
              ? "No deals found on your sheet yet. Deals will appear here after the next sync."
              : "Your personal Google Sheet isn't linked yet. Ask admin to connect your sheet ID in Staff Settings."}
          </CardContent>
        </Card>
      )}

      {/* Data */}
      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="All-Time Deals"      value={data.totalDeals}      variant="default" index={0} />
            <MetricCard label="All-Time Commission" value={data.totalCommission}  prefix="$" variant="green"  index={1} />
            <MetricCard label="MTD Deals"           value={data.mtdDeals}         variant="orange"  index={2} />
            <MetricCard label="MTD Commission"      value={data.mtdCommission}    prefix="$" variant="orange" index={3} />
          </div>

          {/* This week quick stats */}
          {(data.weekDeals > 0 || data.mtdDeals > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="This Week — Deals"      value={data.weekDeals}      variant="black"   index={4} />
              <MetricCard label="This Week — Commission" value={data.weekCommission}  prefix="$" variant="black" index={5} />
            </div>
          )}

          {/* Pipeline metrics */}
          {pipelineData && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline — MTD</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Calls Made"     value={pipelineData.callsMade}     variant="default" index={6} />
                <MetricCard label="Calls Answered" value={pipelineData.callsAnswered}  variant="default" index={7} />
                <MetricCard label="Demos Set"      value={pipelineData.demosSet}       variant="orange"  index={8} />
                <MetricCard label="Demos Showed"   value={pipelineData.demosShowed}    variant="orange"  index={9} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Deals Closed"    value={pipelineData.closed}        variant="green"   index={10} />
                <MetricCard label="Cash Collected"  value={pipelineData.cashCollected}  prefix="$" variant="green" index={11} />
                <MetricCard label="Answer Rate"     value={pipelineData.answerRate}     suffix="%" decimals={1} variant="default" index={12} />
                <MetricCard label="Close Rate"      value={pipelineData.closeRate}      suffix="%" decimals={1} variant="default" index={13} />
              </div>
            </div>
          )}

          {/* Growth chart */}
          {chartData.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">
                  Commission Growth — {isMonthly ? "Monthly" : "Weekly"}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#777", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                      tick={{ fill: "#777", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      {...TT}
                      formatter={(v) => [fmt$(Number(v)), "Commission"]}
                    />
                    <Bar dataKey="commission" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={700} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Recent deals table */}
          {data.recentDeals.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Recent Deals</CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {["Date", "Client", "Deal Size", "My Cut", "Role"].map((h) => (
                          <th key={h} className="text-left px-4 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentDeals.map((deal, i) => (
                        <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(deal.date)}</td>
                          <td className="px-4 py-2 font-medium">{deal.clientName}</td>
                          <td className="px-4 py-2 text-orange-400">{fmt$(deal.gross)}</td>
                          <td className="px-4 py-2 text-green-400 font-semibold">{fmt$(deal.commission)}</td>
                          <td className="px-4 py-2 text-muted-foreground">{deal.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
