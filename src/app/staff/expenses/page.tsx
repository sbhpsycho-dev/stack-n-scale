"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Loader2, Plus, Download, X, RefreshCw, TrendingDown } from "lucide-react";
import { toast, toastError } from "@/lib/toast";
import type { SNSExpense, ExpenseSummary, BreakevenResult, ExpenseCategory, ExpenseRecurrence } from "@/lib/expense-types";
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/expense-types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function currentMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-US", {
    month: "long", year: "numeric",
  });
}

function recurrenceBadge(r: ExpenseRecurrence) {
  const cls = r === "fixed"
    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
    : "bg-orange-500/10 text-orange-400 border-orange-500/20";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {r === "fixed" ? "Fixed" : "Variable"}
    </span>
  );
}

function categoryBadge(c: ExpenseCategory) {
  const color = CATEGORY_COLORS[c];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
      style={{ color, borderColor: `${color}33`, backgroundColor: `${color}15` }}
    >
      {CATEGORY_LABELS[c]}
    </span>
  );
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────

type FormData = {
  vendor: string;
  description: string;
  amount: string;
  category: ExpenseCategory;
  recurrence: ExpenseRecurrence;
  date: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  vendor: "", description: "", amount: "",
  category: "software", recurrence: "variable",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

function AddExpenseModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (e: SNSExpense) => void;
}) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }));

  const inp = "w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 placeholder:text-muted-foreground";
  const sel = `${inp} cursor-pointer`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.vendor.trim()) { setError("Vendor is required."); return; }
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid amount."); return; }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to save. Please try again.");
        return;
      }
      const { expense } = await res.json();
      onSaved(expense);
      toast("Expense added", { description: `${form.vendor} · ${fmt$(amount)}` });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="add-expense-title" className="font-bold text-base">Add Expense</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Vendor / Name</label>
            <input className={inp} placeholder="e.g. Extra Meta spend" value={form.vendor} onChange={e => set("vendor", e.target.value)} required />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description (optional)</label>
            <input className={inp} placeholder="Brief description" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Amount ($)</label>
              <input type="number" className={inp} placeholder="500" min="0.01" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} required />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</label>
              <input type="date" className={inp} value={form.date} onChange={e => set("date", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Category</label>
              <select className={sel} value={form.category} onChange={e => set("category", e.target.value as ExpenseCategory)}>
                <option value="advertising">Advertising</option>
                <option value="software">Software</option>
                <option value="payment_processing">Payment Processing</option>
                <option value="team">Team</option>
                <option value="legal">Legal</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Type</label>
              <select className={sel} value={form.recurrence} onChange={e => set("recurrence", e.target.value as ExpenseRecurrence)}>
                <option value="variable">Variable (one-off)</option>
                <option value="fixed">Fixed (recurring)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
            <textarea className={`${inp} resize-none h-14`} placeholder="Optional notes" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Category Pie Chart ───────────────────────────────────────────────────────

function CategoryChart({ summary }: { summary: ExpenseSummary }) {
  const data = (Object.entries(summary.byCategory) as [ExpenseCategory, number][])
    .filter(([, v]) => v > 0)
    .map(([cat, value]) => ({ name: CATEGORY_LABELS[cat], value, color: CATEGORY_COLORS[cat] }));

  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(val) => typeof val === "number" ? fmt$(val) : val}
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
        />
        <Legend
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
          wrapperStyle={{ fontSize: "11px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";

  // Admin-only page — redirect staff and unauthenticated users
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated" || (status === "authenticated" && !isAdmin)) {
      router.replace("/staff");
    }
  }, [status, isAdmin, router]);

  const [month, setMonth] = useState(currentMonthStr());
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [breakeven, setBreakeven] = useState<BreakevenResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "">("");
  const [runningDebrief, setRunningDebrief] = useState(false);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const [sRes, bRes] = await Promise.all([
        fetch(`/api/expenses/summary?month=${m}`),
        fetch(`/api/expenses/breakeven?month=${m}`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      else toastError("Failed to load expenses");
      if (bRes.ok) setBreakeven(await bRes.json());
    } catch {
      toastError("Network error", "Could not fetch expense data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month); }, [load, month]);

  function onExpenseAdded(e: SNSExpense) {
    setShowModal(false);
    // Refresh data to pick up the new expense
    load(month);
    void e; // suppress unused warning
  }

  async function triggerDebrief() {
    setRunningDebrief(true);
    try {
      const res = await fetch("/api/agents/monthly-expense-debrief");
      if (res.ok) {
        toast("Debrief sent!", { description: "Monthly P&L report posted to Discord." });
      } else {
        toastError("Debrief failed", "Check server logs for details.");
      }
    } catch {
      toastError("Network error", "Could not run debrief agent.");
    } finally {
      setRunningDebrief(false);
    }
  }

  function exportCSV() {
    if (!summary) return;
    const headers = ["Vendor", "Description", "Amount", "Category", "Type", "Date", "Notes"];
    const rows = summary.expenses.map(e => [
      e.vendor, e.description, e.amount, e.category, e.recurrence, e.date, e.notes ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `sns-expenses-${month}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const displayedExpenses = (summary?.expenses ?? []).filter(e => {
    if (!categoryFilter) return true;
    return e.category === categoryFilter;
  });

  const inp = "bg-muted border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-orange-500/60 placeholder:text-muted-foreground";

  if (loading && !summary) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 bg-muted/40 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}
        </div>
        <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
        <div className="h-64 rounded-xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showModal && (
        <AddExpenseModal onClose={() => setShowModal(false)} onSaved={onExpenseAdded} />
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Operating Costs</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {monthLabel(month)} — fixed + variable overhead
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="month"
            className={inp}
            value={month}
            onChange={e => setMonth(e.target.value)}
          />
          <button
            onClick={() => load(month)}
            aria-label="Refresh"
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={exportCSV}
            aria-label="Export CSV"
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors text-muted-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          {isAdmin && (
            <>
              <button
                onClick={triggerDebrief}
                disabled={runningDebrief}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 text-blue-400 text-xs hover:bg-blue-500/10 transition-colors disabled:opacity-50"
              >
                {runningDebrief ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingDown className="h-3.5 w-3.5" />}
                Run Debrief
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="h-10 px-5 flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-md shadow-orange-500/20"
              >
                <Plus className="h-4 w-4" /> Add Expense
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Fixed Costs"    value={summary?.totalFixed ?? 0}    prefix="$" variant="black"   index={0} />
        <MetricCard label="Variable Costs" value={summary?.totalVariable ?? 0} prefix="$" variant="orange"  index={1} />
        <MetricCard label="Total Overhead" value={summary?.grandTotal ?? 0}    prefix="$" variant="default" index={2} />
        <MetricCard label="Line Items"     value={summary?.expenses.length ?? 0}            variant="default" index={3} />
      </div>

      {/* ── Break-Even Card ───────────────────────────────────────────────── */}
      {breakeven && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Break-Even Calculator</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-muted/30 border border-border p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Deals @ $5K</p>
                <p className="text-3xl font-bold text-orange-400">{breakeven.dealsAt5K}</p>
                <p className="text-[11px] text-muted-foreground mt-1">to cover overhead</p>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Deals @ $10K</p>
                <p className="text-3xl font-bold text-green-400">{breakeven.dealsAt10K}</p>
                <p className="text-[11px] text-muted-foreground mt-1">to cover overhead</p>
              </div>
              <div className="rounded-xl bg-muted/30 border border-border p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Revenue Benchmark</p>
                <p className="text-2xl font-bold">{fmt$(breakeven.revenueBenchmark)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">gross needed to break even</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">
              * Based on avg 2.9% processor fee + 25% commission rate on gross revenue
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Category Breakdown ────────────────────────────────────────────── */}
      {summary && summary.grandTotal > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">By Category</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <CategoryChart summary={summary} />
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Category Totals</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {(Object.entries(summary.byCategory) as [ExpenseCategory, number][])
                  .filter(([, v]) => v > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amt]) => {
                    const pct = summary.grandTotal > 0 ? ((amt / summary.grandTotal) * 100).toFixed(1) : "0";
                    return (
                      <div key={cat} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                        <span className="text-xs text-muted-foreground flex-1">{CATEGORY_LABELS[cat]}</span>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                        <span className="text-xs font-semibold">{fmt$(amt)}</span>
                      </div>
                    );
                  })}
                <div className="border-t border-border mt-2 pt-2 flex justify-between text-xs font-bold">
                  <span>Total</span>
                  <span>{fmt$(summary.grandTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Expense Table ─────────────────────────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">All Expenses</CardTitle>
          <select
            className="bg-muted border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-orange-500/60"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as ExpenseCategory | "")}
          >
            <option value="">All Categories</option>
            <option value="advertising">Advertising</option>
            <option value="software">Software</option>
            <option value="payment_processing">Payment Processing</option>
            <option value="team">Team</option>
            <option value="legal">Legal</option>
            <option value="other">Other</option>
          </select>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
            ) : displayedExpenses.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No expenses found.</p>
                {isAdmin && (
                  <button
                    onClick={() => setShowModal(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
                  >
                    <Plus className="h-4 w-4" /> Add First Expense
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {["Vendor", "Description", "Category", "Type", "Amount"].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedExpenses.map((e, i) => (
                    <tr key={e.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-2.5 font-medium">{e.vendor}</td>
                      <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">{e.description || "—"}</td>
                      <td className="px-4 py-2.5">{categoryBadge(e.category)}</td>
                      <td className="px-4 py-2.5">{recurrenceBadge(e.recurrence)}</td>
                      <td className="px-4 py-2.5 font-semibold text-right pr-6">
                        <span className={e.recurrence === "fixed" ? "text-foreground" : "text-orange-400"}>
                          {fmt$(e.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Footer total row */}
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={4} className="px-4 py-2.5 font-bold text-sm">Total</td>
                    <td className="px-4 py-2.5 font-bold text-sm text-right pr-6">
                      {fmt$(displayedExpenses.reduce((s, e) => s + e.amount, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
