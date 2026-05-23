"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Loader2, RefreshCw, TrendingUp, ClipboardList, CheckCircle2, Pencil } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyEntry } from "@/app/api/replog/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonalKPI {
  totalDeals: number; totalGross: number; totalCommission: number;
  mtdDeals: number; mtdGross: number; mtdCommission: number;
  weekDeals: number; weekCommission: number;
  recentDeals: { date: string; clientName: string; gross: number; commission: number; role: string }[];
  growthByWeek: { week: string; commission: number; deals: number }[];
  growthByMonth: { month: string; commission: number; deals: number }[];
}

interface MyPipelineData {
  callsMade: number; callsAnswered: number; demosSet: number;
  demosShowed: number; pitched: number; closed: number; cashCollected: number;
  answerRate: number; showRate: number; closeRate: number; demoToClose: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  } catch { return dateStr; }
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const BLANK_ENTRY: Omit<DailyEntry, "date"> = {
  callsMade: 0, callsAnswered: 0, demosSet: 0,
  demosShowed: 0, pitched: 0, closed: 0, cashCollected: 0,
};

// ─── Daily Input Form ─────────────────────────────────────────────────────────

function DailyInputForm({
  onSaved,
}: {
  onSaved: () => void;
}) {
  const [date, setDate]       = useState(todayISO());
  const [form, setForm]       = useState<Omit<DailyEntry, "date">>(BLANK_ENTRY);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");
  const [existing, setExisting] = useState<DailyEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(true);

  // Load existing entry for this date
  const loadEntry = useCallback(async (d: string) => {
    setLoadingEntry(true);
    try {
      const res = await fetch("/api/replog");
      if (!res.ok) return;
      const entries: DailyEntry[] = await res.json();
      const found = entries.find(e => e.date === d) ?? null;
      setExisting(found);
      if (found) {
        setForm({
          callsMade:     found.callsMade,
          callsAnswered: found.callsAnswered,
          demosSet:      found.demosSet,
          demosShowed:   found.demosShowed,
          pitched:       found.pitched,
          closed:        found.closed,
          cashCollected: found.cashCollected,
        });
      } else {
        setForm(BLANK_ENTRY);
      }
    } finally {
      setLoadingEntry(false);
    }
  }, []);

  useEffect(() => {
    setEditing(false);
    setSaved(false);
    loadEntry(date);
  }, [date, loadEntry]);

  const set = (k: keyof typeof form, v: string) =>
    setForm(prev => ({ ...prev, [k]: Math.max(0, parseInt(v) || 0) }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/replog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...form }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json() as { ok: boolean; sheetsSync?: "ok" | "error"; syncError?: string };
      if (data.sheetsSync === "error") {
        // Saved to local cache — let user know Sheets had an issue
        setError(`Saved locally — Google Sheets sync failed: ${data.syncError ?? "unknown error"}`);
      } else {
        setSaved(true);
      }
      setEditing(false);
      setExisting({ date, ...form });
      onSaved();
    } catch {
      setError("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const inp = "w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-center font-semibold focus:outline-none focus:border-orange-500/60 placeholder:text-muted-foreground";

  const isToday = date === todayISO();

  // If existing entry and not editing — show summary card with edit button
  const showReadOnly = existing && !editing;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-orange-500" />
          <CardTitle className="text-sm font-semibold">
            Log Daily Numbers
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {/* Date picker */}
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => setDate(e.target.value)}
            className="bg-muted border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-orange-500/60 text-muted-foreground"
          />
          {isToday && <span className="text-[10px] font-semibold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">Today</span>}
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        {loadingEntry ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          </div>
        ) : showReadOnly ? (
          /* ── Read-only summary ── */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-green-400 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Numbers logged for {fmtDate(date)}
              {saved && <span className="text-muted-foreground font-normal">(just updated)</span>}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
              {[
                { label: "Calls Made",     v: existing.callsMade },
                { label: "Answered",       v: existing.callsAnswered },
                { label: "Demos Set",      v: existing.demosSet },
                { label: "Showed",         v: existing.demosShowed },
                { label: "Pitched",        v: existing.pitched },
                { label: "Closed",         v: existing.closed },
                { label: "Cash",           v: fmt$(existing.cashCollected) },
              ].map(({ label, v }) => (
                <div key={label} className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                  <p className="text-sm font-bold">{v}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit numbers
            </button>
          </div>
        ) : (
          /* ── Input form ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {editing && (
              <p className="text-xs text-orange-400">Editing {fmtDate(date)} — submit to update</p>
            )}

            {/* Row 1: Calls */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Calls</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Calls Made</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.callsMade || ""}
                    placeholder="0"
                    onChange={e => set("callsMade", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Calls Answered</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.callsAnswered || ""}
                    placeholder="0"
                    onChange={e => set("callsAnswered", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Demos */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Demos</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Demos Set</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.demosSet || ""}
                    placeholder="0"
                    onChange={e => set("demosSet", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Demos Showed</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.demosShowed || ""}
                    placeholder="0"
                    onChange={e => set("demosShowed", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Closed + Cash */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Results</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Pitched</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.pitched || ""}
                    placeholder="0"
                    onChange={e => set("pitched", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Closed</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.closed || ""}
                    placeholder="0"
                    onChange={e => set("closed", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Cash Collected ($)</label>
                  <input
                    type="number" min="0" className={inp}
                    value={form.cashCollected || ""}
                    placeholder="0"
                    onChange={e => set("cashCollected", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => { setEditing(false); loadEntry(date); }}
                  className="flex-1 py-2 rounded-xl border border-border text-xs hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                ) : (
                  `${editing ? "Update" : "Log"} Numbers${isToday ? " for Today" : ` for ${fmtDate(date)}`}`
                )}
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent Replog History ────────────────────────────────────────────────────

function ReplogHistory() {
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/replog")
      .then(r => r.ok ? r.json() : [])
      .then((data: DailyEntry[]) => setEntries(data.slice(0, 10)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (entries.length === 0) return null;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">Recent Activity Log</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead className="bg-muted/50">
              <tr>
                {["Date", "Calls Made", "Answered", "Demos Set", "Showed", "Pitched", "Closed", "Cash"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.date} className={`border-t border-border ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2">{e.callsMade}</td>
                  <td className="px-3 py-2">{e.callsAnswered}</td>
                  <td className="px-3 py-2 text-orange-400">{e.demosSet}</td>
                  <td className="px-3 py-2">{e.demosShowed}</td>
                  <td className="px-3 py-2">{e.pitched}</td>
                  <td className="px-3 py-2 text-green-400 font-semibold">{e.closed}</td>
                  <td className="px-3 py-2 text-green-400 font-semibold">{fmt$(e.cashCollected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyNumbersPage() {
  const { data: session } = useSession();
  const [data, setData]               = useState<PersonalKPI | null>(null);
  const [pipelineData, setPipelineData] = useState<MyPipelineData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [logVersion, setLogVersion]   = useState(0); // bump to re-fetch history

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

  const name     = session?.user?.name ?? "Rep";
  const hasData  = data && data.totalDeals > 0;
  const isMonthly = Boolean(data && data.growthByMonth.length > 0);
  const chartData = data
    ? (isMonthly
        ? data.growthByMonth.map(d => ({ label: d.month, commission: d.commission, deals: d.deals }))
        : data.growthByWeek.map(d => ({ label: d.week, commission: d.commission, deals: d.deals })))
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
          <p className="text-xs text-muted-foreground mt-0.5">{name} — log daily activity &amp; track your stats</p>
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

      {/* ── DAILY INPUT FORM ── */}
      <DailyInputForm
        onSaved={() => {
          setLogVersion(v => v + 1);
          // Refresh pipeline stats after submitting numbers
          fetch("/api/staff/kpi/my-pipeline")
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setPipelineData(d); })
            .catch(() => {});
        }}
      />

      {/* ── PIPELINE METRICS (MTD from replog) ── */}
      {pipelineData && (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline — MTD</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Calls Made"     value={pipelineData.callsMade}     variant="default" index={0} />
            <MetricCard label="Calls Answered" value={pipelineData.callsAnswered}  variant="default" index={1} />
            <MetricCard label="Demos Set"      value={pipelineData.demosSet}       variant="orange"  index={2} />
            <MetricCard label="Demos Showed"   value={pipelineData.demosShowed}    variant="orange"  index={3} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Deals Closed"   value={pipelineData.closed}         variant="green"   index={4} />
            <MetricCard label="Cash Collected"  value={pipelineData.cashCollected}  prefix="$" variant="green" index={5} />
            <MetricCard label="Answer Rate"     value={pipelineData.answerRate}     suffix="%" decimals={1} variant="default" index={6} />
            <MetricCard label="Close Rate"      value={pipelineData.closeRate}      suffix="%" decimals={1} variant="default" index={7} />
          </div>
        </div>
      )}

      {/* ── RECENT REPLOG HISTORY ── */}
      <ReplogHistory key={logVersion} />

      {/* ── DEAL STATS (from personal sheet) ── */}
      {loading && !data && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      )}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
          <button onClick={load} className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors">Retry</button>
        </div>
      )}

      {!loading && !error && data && !hasData && (
        <Card className="bg-card border-border">
          <CardContent className="py-10 text-center text-xs text-muted-foreground">
            {session?.user?.sheetId
              ? "No deals found on your sheet yet. Deals will appear here after the next sync."
              : "Your personal Google Sheet isn't linked yet. Ask Evan to connect your sheet ID in Staff Settings."}
          </CardContent>
        </Card>
      )}

      {data && hasData && (
        <>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Deal Commission Stats</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard label="All-Time Deals"      value={data.totalDeals}      variant="default" index={8} />
              <MetricCard label="All-Time Commission" value={data.totalCommission}  prefix="$" variant="green"  index={9} />
              <MetricCard label="MTD Deals"           value={data.mtdDeals}         variant="orange"  index={10} />
              <MetricCard label="MTD Commission"      value={data.mtdCommission}    prefix="$" variant="orange" index={11} />
            </div>
          </div>

          {(data.weekDeals > 0 || data.mtdDeals > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="This Week — Deals"      value={data.weekDeals}      variant="black"   index={12} />
              <MetricCard label="This Week — Commission" value={data.weekCommission}  prefix="$" variant="black" index={13} />
            </div>
          )}

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
                    <XAxis dataKey="label" tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
                      tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false}
                    />
                    <Tooltip {...TT} formatter={v => [fmt$(Number(v)), "Commission"]} />
                    <Bar dataKey="commission" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={700} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

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
                        {["Date", "Client", "Deal Size", "My Cut", "Role"].map(h => (
                          <th key={h} className="text-left px-4 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
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
