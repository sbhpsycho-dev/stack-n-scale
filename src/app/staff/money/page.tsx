"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayoutSplitChart } from "@/components/charts/payout-charts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { toast, toastError } from "@/lib/toast";
import type { ExpenseSummary } from "@/lib/expense-types";

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
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [data, setData] = useState<MoneyData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approving, setApproving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    try {
      const [moneyRes, expenseRes] = await Promise.all([
        fetch("/api/staff/money"),
        fetch(`/api/expenses/summary?month=${currentMonth}`),
      ]);
      if (moneyRes.ok) {
        setData(await moneyRes.json());
      } else {
        setError("Failed to load financial data.");
      }
      if (expenseRes.ok) setExpenses(await expenseRes.json());
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approveWeek() {
    setApproving(true);
    try {
      const res = await fetch("/api/payouts/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast("Payouts approved", { description: "All reps have been notified." });
      } else {
        toastError("Failed to approve payouts", "Please try again or contact support.");
      }
    } catch {
      toastError("Network error", "Payouts could not be approved.");
    } finally {
      setApproving(false);
      setConfirmOpen(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Money Clarity</h1>
            <p className="text-xs text-muted-foreground mt-0.5">What did you actually make? Real-time breakdown.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
        <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={load}
          className="h-8 px-4 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
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
    <>
      <ConfirmDialog
        open={confirmOpen}
        title="Approve this week's payouts?"
        description="This will mark all pending deals as approved and notify reps. This action cannot be undone."
        confirmLabel="Approve Payouts"
        confirmVariant="primary"
        loading={approving}
        onConfirm={approveWeek}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Money Clarity</h1>
            <p className="text-xs text-muted-foreground mt-0.5">What did you actually make? Real-time breakdown.</p>
          </div>
          <button
            onClick={load}
            aria-label="Refresh data"
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Section 1 — This Week */}
        <CC title="This Week">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Gross"          value={w?.gross ?? 0}        prefix="$" variant="orange"  index={0} />
            <MetricCard label="Payouts Out"    value={w?.totalPayouts ?? 0} prefix="$" variant="black"   index={1} />
            <MetricCard label="Evan Net"       value={w?.evanTakeHome ?? 0} prefix="$" variant="green"   index={2} />
            <MetricCard label="Deals"          value={w?.dealCount ?? 0}               variant="default" index={3} />
          </div>
        </CC>

        {/* Approve action — admin only */}
        {isAdmin && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-400">Approve This Week&apos;s Payouts</p>
              <p className="text-xs text-muted-foreground mt-0.5">Mark all pending deals as paid and notify your reps.</p>
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={approving}
              className="shrink-0 py-3 px-6 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-blue-500/20"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Approve Payouts
            </button>
          </div>
        )}

        {/* Section 2 — MTD Breakdown */}
        <CC title="Month to Date">
          <div className="space-y-1">
            {mtdRows.map(([label, val]) => {
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

        {/* Section 2b — Operating Costs & True P&L */}
        {expenses && expenses.grandTotal > 0 && m && (
          <CC title="Operating Costs & True P&L (MTD)">
            <div className="space-y-1">
              {([
                ["Evan Take Home",       m.evanTakeHome,            false] as [string, number, boolean],
                ["Fixed Overhead",       expenses.totalFixed,       true ] as [string, number, boolean],
                ["Variable Overhead",    expenses.totalVariable,    true ] as [string, number, boolean],
                ["Total Overhead",       expenses.grandTotal,       true ] as [string, number, boolean],
              ]).map(([label, val, isExpense]) => (
                <div key={label} className={`flex justify-between items-center py-1.5 text-sm ${isExpense ? "text-red-400" : ""}`}>
                  <span className={isExpense ? "" : "text-muted-foreground"}>{label}</span>
                  <span>{isExpense ? `-${fmt$(val)}` : fmt$(val)}</span>
                </div>
              ))}
              {/* True Net separator */}
              {(() => {
                const trueNet = m.evanTakeHome - expenses.grandTotal;
                const isPositive = trueNet >= 0;
                return (
                  <div className={`flex justify-between items-center py-1.5 text-sm font-bold border-t border-border mt-1 pt-2 ${isPositive ? "text-green-400" : "text-red-400"}`}>
                    <span>True Net</span>
                    <span>{isPositive ? "" : "-"}{fmt$(Math.abs(trueNet))}</span>
                  </div>
                );
              })()}
              <p className="text-[10px] text-muted-foreground pt-1">
                True Net = Evan Take Home − Operating Overhead
              </p>
            </div>
          </CC>
        )}

        {/* Section 3 — Pie chart */}
        {data?.pie && data.pie.length > 0 && (
          <CC title="Where the Money Goes (MTD)">
            <PayoutSplitChart data={data.pie} />
          </CC>
        )}

        {/* Section 4 — Monthly History */}
        {data?.monthlyHistory && data.monthlyHistory.length > 0 && (
          <CC title="Monthly History (Last 12 Months)">
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {["Month", "Gross", "Fees", "Payouts", "Evan Net"].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...data.monthlyHistory].reverse().map((row, i) => (
                    <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{fmtMonth(row.month)}</td>
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
    </>
  );
}
