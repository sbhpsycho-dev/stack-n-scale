"use client";

import { useState, useEffect } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface InsightsData {
  totalStudents: number;
  active: number;
  alumni: number;
  conversionRate: number;
  avgDaysToActive: number | null;
  totalNotes: number;
  pipelineDistribution: { status: string; count: number }[];
  coachWorkload: { coach: string; count: number }[];
}

const ORANGE = "#f97316";
const MUTED = "#3f3f46";

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/staff/insights");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Insights</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Student progress &amp; staff workload reports</p>
        </div>
        <button onClick={load} disabled={loading} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="Total Students"   value={data.totalStudents} variant="default"  index={0} />
            <MetricCard label="Active"            value={data.active}       variant="green"   index={1} />
            <MetricCard label="Alumni"            value={data.alumni}       variant="orange"  index={2} />
            <MetricCard label="Conversion Rate"   value={data.conversionRate} suffix="%" variant="orange" index={3} />
            <MetricCard label="Avg Days to Active" value={data.avgDaysToActive ?? 0} suffix=" d" variant="default" index={4} />
            <MetricCard label="Total Notes"       value={data.totalNotes}   variant="black"   index={5} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Student Pipeline Distribution">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.pipelineDistribution} margin={{ top: 4, right: 8, left: -16, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 9, fill: "#71717a" }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "#e4e4e7" }}
                    itemStyle={{ color: ORANGE }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.pipelineDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.count > 0 ? ORANGE : MUTED} fillOpacity={entry.count > 0 ? 1 : 0.4} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Coach Workload">
              {data.coachWorkload.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No coaches assigned yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.coachWorkload} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#71717a" }} allowDecimals={false} />
                    <YAxis dataKey="coach" type="category" tick={{ fontSize: 11, fill: "#a1a1aa" }} width={80} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "#e4e4e7" }}
                      itemStyle={{ color: ORANGE }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={ORANGE} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
