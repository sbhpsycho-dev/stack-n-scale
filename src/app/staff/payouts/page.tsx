"use client";

import { useState, useEffect, useCallback } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import type { Deal, WeeklyPayout } from "@/lib/deal-types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getWeekId(date: Date = new Date()): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

function offsetWeek(weekId: string, delta: number): string {
  const d = new Date(weekId + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

type SummaryData = WeeklyPayout & { deals: Deal[] };

// ─── Recipient row ───────────────────────────────────────────────────────────

function RecipientRows({ deals }: { deals: Deal[] }) {
  const recipients: { name: string; key: keyof Deal["payouts"] }[] = [
    { name: "Caelum",      key: "caelum" },
    { name: "Media Buyer", key: "mediaBuyer" },
    { name: "Setter",      key: "setter" },
    { name: "Closer",      key: "closer" },
    { name: "Evan",        key: "evanTakeHome" },
  ];

  return (
    <div className="space-y-2">
      {recipients.map(({ name, key }) => {
        const total = deals.reduce((s, d) => s + (d.payouts[key] ?? 0), 0);
        const paid  = deals.filter(d => d.payoutStatus === "paid").reduce((s, d) => s + (d.payouts[key] ?? 0), 0);
        const owed  = total - paid;
        if (total === 0) return null;
        return (
          <div key={name} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Paid {fmt$(paid)} · Owed <span className={owed > 0 ? "text-orange-400" : "text-green-400"}>{fmt$(owed)}</span>
              </p>
            </div>
            <p className="text-lg font-bold text-orange-400">{fmt$(total)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Deal row with mark-paid ─────────────────────────────────────────────────

function DealRow({ deal, onPaid }: { deal: Deal; onPaid: (id: string) => void }) {
  const [loading, setLoading] = useState(false);

  async function markPaid() {
    setLoading(true);
    await fetch(`/api/payouts/${deal.id}/paid`, { method: "POST" });
    onPaid(deal.id);
    setLoading(false);
  }

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="px-3 py-2">{deal.date}</td>
      <td className="px-3 py-2 font-medium max-w-[120px] truncate">{deal.clientName}</td>
      <td className="px-3 py-2 text-orange-400">{fmt$(deal.grossAmount)}</td>
      <td className="px-3 py-2">{fmt$(deal.payouts.caelum)}</td>
      <td className="px-3 py-2">{deal.payouts.mediaBuyer > 0 ? fmt$(deal.payouts.mediaBuyer) : "—"}</td>
      <td className="px-3 py-2">{fmt$(deal.payouts.setter + deal.payouts.closer)}</td>
      <td className="px-3 py-2 text-green-400 font-semibold">{fmt$(deal.payouts.evanTakeHome)}</td>
      <td className="px-3 py-2">
        {deal.payoutStatus === "paid" ? (
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
            <CheckCircle className="h-3.5 w-3.5" /> Paid
          </span>
        ) : (
          <button
            onClick={markPaid}
            disabled={loading}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            Mark Paid
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  const [weekId, setWeekId] = useState(getWeekId());
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async (wid: string) => {
    setLoading(true);
    const res = await fetch(`/api/payouts/summary?weekId=${wid}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(weekId); }, [load, weekId]);

  async function approveAll() {
    setApproving(true);
    await fetch("/api/payouts/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId }),
    });
    await load(weekId);
    setApproving(false);
  }

  function handlePaid(dealId: string) {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        deals: prev.deals.map(d => d.id === dealId ? { ...d, payoutStatus: "paid" as const } : d),
      };
    });
  }

  const totals = data?.totals;
  const isCurrentWeek = weekId === getWeekId();
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weekLabel = data ? `${fmt(data.weekStart)} – ${fmt(data.weekEnd)}` : weekId;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Payout Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Weekly payout review and approval</p>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekId(w => offsetWeek(w, -1))}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold w-36 text-center">{weekLabel}</span>
          <button
            onClick={() => setWeekId(w => offsetWeek(w, 1))}
            disabled={isCurrentWeek}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : !data || data.deals.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center text-xs text-muted-foreground">
            No deals logged for this week.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Gross"          value={totals?.gross ?? 0}        prefix="$" variant="orange" index={0} />
            <MetricCard label="Total Payouts"  value={totals?.totalPayouts ?? 0} prefix="$" variant="black"  index={1} />
            <MetricCard label="Evan Take Home" value={totals?.evanTakeHome ?? 0} prefix="$" variant="green"  index={2} />
            <MetricCard label="Deals"          value={data.deals.length}                    variant="default" index={3} />
          </div>

          {/* Status + Approve */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-semibold capitalize">{data.status}</p>
              {data.approvedAt && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Approved {new Date(data.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            {data.status === "pending" && (
              <button
                onClick={approveAll}
                disabled={approving}
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {approving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Approve All Payouts
              </button>
            )}
          </div>

          {/* Recipient breakdown */}
          <RecipientRows deals={data.deals} />

          {/* Deal-level table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["Date", "Client", "Gross", "Caelum", "Media Buyer", "Sales", "Evan", "Status"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.deals.map(d => (
                  <DealRow key={d.id} deal={d} onPaid={handlePaid} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
