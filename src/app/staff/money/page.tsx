"use client";

import { useState, useEffect, useCallback } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayoutSplitChart } from "@/components/charts/payout-charts";
import { Loader2, RefreshCw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MoneyData {
  week: {
    gross: number;
    totalPayouts: number;
    evanTakeHome: number;
    dealCount: number;
  };
  mtd: {
    gross: number;
    fees: number;
    net: number;
    totalPayouts: number;
    evanTakeHome: number;
    caelumOwed: number;
    salesTeamOwed: number;
    mediaBuyerOwed: number;
  };
  pie: { name: string; value: number }[];
  monthlyHistory: {
    month: string;
    gross: number;
    fees: number;
    net: number;
    evanTakeHome: number;
    totalPayouts: number;
  }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MoneyPage() {
  const [data, setData] = useState<MoneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/staff/money");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approveWeek() {
    setApproving(true);
    await fetch("/api/payouts/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setApproving(false);
  }

  if (loading && !data) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  const w = data?.week;
  const m = data?.mtd;

  const mtdRows: [string, number, number][] = m ? [
    ["Gross",          m.gross,        0],
    ["Processor Fees", m.fees,         0],
    ["Net",            m.net,          0],
    ["Caelum Owed",    m.caelumOwed,   0],
    ["Media Buyer Owed", m.mediaBuyerOwed, 0],
    ["Sales Team Owed",  m.salesTeamOwed,  0],
    ["Evan Take Home", m.evanTakeHome, 0],
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Money Clarity</h1>
          <p className="text-xs text-muted-foreground mt-0.5">What did you actually make? Real-time breakdown.</p>
        </div>
        <button
          onClick={load}
          className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Section 1 — This Week */}
      <CC title="This Week">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <MetricCard label="Gross"          value={w?.gross ?? 0}        prefix="$" variant="orange"  index={0} />
          <MetricCard label="Payouts Out"    value={w?.totalPayouts ?? 0} prefix="$" variant="black"   index={1} />
          <MetricCard label="Evan Net"       value={w?.evanTakeHome ?? 0} prefix="$" variant="green"   index={2} />
          <MetricCard label="Deals"          value={w?.dealCount ?? 0}               variant="default" index={3} />
        </div>
        <button
          onClick={approveWeek}
          disabled={approving}
          className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {approving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Approve This Week&apos;s Payouts
        </button>
      </CC>

      {/* Section 2 — MTD Breakdown */}
      <CC title="Month to Date">
        <div className="space-y-1">
          {mtdRows.map(([label, val], i) => {
            const isEvan    = label === "Evan Take Home";
            const isGross   = label === "Gross";
            const isFee     = label === "Processor Fees";
            return (
              <div
                key={label}
                className={`flex justify-between items-center py-1.5 text-sm ${
                  isEvan ? "font-bold text-green-400 border-t border-border mt-1 pt-2" :
                  isFee  ? "text-red-400" : isGross ? "font-semibold text-orange-400" : ""
                }`}
              >
                <span className={isEvan ? "" : "text-muted-foreground"}>{label}</span>
                <span>{isFee ? `-${fmt$(val)}` : fmt$(val)}</span>
              </div>
            );
          })}
        </div>
      </CC>

      {/* Section 3 — Pie chart */}
      {data?.pie && data.pie.length > 0 && (
        <CC title="Where the Money Goes (MTD)">
          <PayoutSplitChart data={data.pie} />
        </CC>
      )}

      {/* Section 4 — Monthly History */}
      {data?.monthlyHistory && data.monthlyHistory.length > 0 && (
        <CC title="Monthly History (Last 12 Months)">
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Month", "Gross", "Fees", "Payouts", "Evan Net"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.monthlyHistory].reverse().map((row, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{fmtMonth(row.month)}</td>
                    <td className="px-3 py-2 text-orange-400">{fmt$(row.gross)}</td>
                    <td className="px-3 py-2 text-red-400">-{fmt$(row.fees)}</td>
                    <td className="px-3 py-2">{fmt$(row.totalPayouts)}</td>
                    <td className="px-3 py-2 text-green-400 font-semibold">{fmt$(row.evanTakeHome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CC>
      )}
    </div>
  );
}
