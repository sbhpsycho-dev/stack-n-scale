"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  RefreshCw, Pause, Play, ArrowLeft, Plus, Search,
  Loader2, AlertTriangle, X, Users, DollarSign, Phone,
  BarChart2, TrendingUp, Target, ChevronDown, ChevronUp,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { RevenueOverTimeChart } from "@/components/charts/revenue-chart";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  name: string;
  role: string;
  calls: number;
  demos: number;
  showed: number;
  closed: number;
  cash: number;
  showRate: number;
  closeRate: number;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  status: "active" | "away";
}

interface OpsData {
  updatedAt: string;
  kpis: {
    revenue: number;
    cashCollected: number;
    totalCalls: number;
    totalDemos: number;
    totalClosed: number;
    showRate: number;
    closeRate: number;
    activeSetters: number;
  };
  trend: { label: string; revenue: number }[];
  leaderboard: LeaderboardEntry[];
  staff: StaffMember[];
}

interface LogEntry {
  ts: string;
  msg: string;
  type: "info" | "error" | "success";
}

type SortKey = keyof Pick<LeaderboardEntry, "calls" | "demos" | "showed" | "closed" | "cash" | "showRate" | "closeRate">;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function nowISO() {
  return new Date().toISOString();
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{label}</span>
          <div className={`p-1.5 rounded-md ${color}`}>
            <Icon className="h-3 w-3" />
          </div>
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "active" | "away" }) {
  return status === "active" ? (
    <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
  ) : (
    <span className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Away</span>
  );
}

function LogBadge({ type }: { type: LogEntry["type"] }) {
  if (type === "error")   return <span className="text-[10px] font-bold text-red-400 uppercase shrink-0">ERR</span>;
  if (type === "success") return <span className="text-[10px] font-bold text-emerald-400 uppercase shrink-0">OK</span>;
  return <span className="text-[10px] font-bold text-zinc-500 uppercase shrink-0">INFO</span>;
}

// ─── Leaderboard Table ────────────────────────────────────────────────────────

function LeaderboardTable({ entries, loading }: { entries: LeaderboardEntry[]; loading: boolean }) {
  const [sortKey, setSortKey]     = useState<SortKey>("cash");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded]   = useState<string | null>(null);

  const sorted = [...entries].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -diff : diff;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ChevronDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === "desc"
      ? <ChevronDown className="h-3 w-3 text-foreground" />
      : <ChevronUp className="h-3 w-3 text-foreground" />;
  }

  const th = (label: string, col: SortKey) => (
    <th
      className="px-3 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">{label}<SortIcon col={col} /></span>
    </th>
  );

  if (loading && !entries.length) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!entries.length) {
    return <div className="text-center py-16 text-sm text-muted-foreground">No data yet — add rows to the Leadwell KPI Tracker</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-10">#</th>
            <th className="px-3 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</th>
            {th("Calls", "calls")}
            {th("Demos", "demos")}
            {th("Showed", "showed")}
            {th("Show %", "showRate")}
            {th("Closed", "closed")}
            {th("Close %", "closeRate")}
            {th("Cash", "cash")}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((entry, i) => {
            const isTop      = i === 0;
            const isExpanded = expanded === entry.name;
            return (
              <>
                <tr
                  key={entry.name}
                  className={`cursor-pointer transition-colors ${isTop ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30"}`}
                  onClick={() => setExpanded(isExpanded ? null : entry.name)}
                >
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {isTop ? <span className="text-amber-400 font-bold">1</span> : i + 1}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`font-semibold ${isTop ? "text-amber-300" : ""}`}>{entry.name}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground capitalize">{entry.role}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{entry.calls.toLocaleString()}</td>
                  <td className="px-3 py-3 tabular-nums">{entry.demos}</td>
                  <td className="px-3 py-3 tabular-nums">{entry.showed}</td>
                  <td className="px-3 py-3 tabular-nums">{fmtPct(entry.showRate)}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{entry.closed}</td>
                  <td className="px-3 py-3 tabular-nums">{fmtPct(entry.closeRate)}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-emerald-400">{fmt$(entry.cash)}</td>
                </tr>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.tr
                      key={`${entry.name}-expand`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <td colSpan={9} className="px-4 py-3 bg-muted/20">
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
                          {[
                            ["Calls", entry.calls.toLocaleString()],
                            ["Demos Set", String(entry.demos)],
                            ["Showed Up", String(entry.showed)],
                            ["Show Rate", fmtPct(entry.showRate)],
                            ["Deals Closed", String(entry.closed)],
                            ["Cash", fmt$(entry.cash)],
                          ].map(([label, val]) => (
                            <div key={label} className="rounded-lg bg-card border border-border px-3 py-2">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                              <p className="font-semibold text-sm mt-0.5">{val}</p>
                            </div>
                          ))}
                        </div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpsDashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [data, setData]               = useState<OpsData | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [liveStatus, setLiveStatus]   = useState<"live" | "error" | "paused">("live");
  const [refreshing, setRefreshing]   = useState(false);
  const [paused, setPaused]           = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<LogEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Staff UI
  const [staffSearch, setStaffSearch] = useState("");
  const [adding, setAdding]           = useState(false);
  const [addForm, setAddForm]         = useState({ name: "", role: "" });
  const [saving, setSaving]           = useState(false);

  // Auth guard
  useEffect(() => {
    if (authStatus === "unauthenticated") { router.replace("/login"); return; }
    if (authStatus === "authenticated" && session?.user?.role !== "admin") router.replace("/");
  }, [authStatus, session, router]);

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const pushLog = useCallback((msg: string, type: LogEntry["type"] = "info") => {
    setActivityLog(prev => [{ ts: nowISO(), msg, type }, ...prev].slice(0, 50));
  }, []);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const res = await fetch("/api/ops");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = (j as { error?: string }).error ?? `Server error ${res.status}`;
        setError(msg);
        setLiveStatus("error");
        pushLog(msg, "error");
        return;
      }
      const d: OpsData = await res.json();
      setData(d);
      setLastUpdated(nowISO());
      setError(null);
      setLiveStatus(paused ? "paused" : "live");
      pushLog(
        `Refreshed — ${d.leaderboard.length} reps · ${fmt$(d.kpis.revenue)} revenue`,
        "success",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setError(msg);
      setLiveStatus("error");
      pushLog(msg, "error");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, [paused, pushLog]);

  // Initial load
  useEffect(() => {
    if (authStatus !== "authenticated" || session?.user?.role !== "admin") return;
    fetchData();
  }, [authStatus, session, fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (paused) {
      setLiveStatus("paused");
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    setLiveStatus(error ? "error" : "live");
    intervalRef.current = setInterval(() => fetchData(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, error, fetchData]);

  // ── Staff actions ──────────────────────────────────────────────────────────

  const toggleStatus = async (member: StaffMember) => {
    const next = member.status === "active" ? "away" : "active";
    setData(prev => prev ? { ...prev, staff: prev.staff.map(s => s.id === member.id ? { ...s, status: next } : s) } : prev);
    try {
      await fetch("/api/ops", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: member.id, status: next }) });
      pushLog(`${member.name} marked ${next}`, "info");
    } catch {
      setData(prev => prev ? { ...prev, staff: prev.staff.map(s => s.id === member.id ? { ...s, status: member.status } : s) } : prev);
      pushLog(`Failed to update ${member.name}`, "error");
    }
  };

  const addStaff = async () => {
    if (!addForm.name.trim() || !addForm.role.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: addForm.name.trim(), role: addForm.role.trim() }) });
      const j = await res.json();
      if (j.ok && j.id) {
        setData(prev => prev ? { ...prev, staff: [...prev.staff, { id: j.id, name: addForm.name.trim(), role: addForm.role.trim(), status: "active" }] } : prev);
        pushLog(`Added ${addForm.name.trim()} (${j.id})`, "success");
        setAdding(false);
        setAddForm({ name: "", role: "" });
      }
    } catch { pushLog("Network error — could not add staff", "error"); }
    finally { setSaving(false); }
  };

  // ── Loading gate ───────────────────────────────────────────────────────────

  if (authStatus === "loading") {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (authStatus !== "authenticated" || session?.user?.role !== "admin") return null;

  const filteredStaff = (data?.staff ?? []).filter(s =>
    s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
    s.id.toLowerCase().includes(staffSearch.toLowerCase()),
  );
  const trendData = (data?.trend ?? []).map(({ label, revenue }) => ({ date: label, amount: revenue }));

  const dotColor = liveStatus === "live" ? "bg-emerald-500 animate-pulse"
    : liveStatus === "error" ? "bg-red-500 animate-pulse"
    : "bg-zinc-500";

  const kpis = data?.kpis;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="font-semibold text-sm">Leadwell Dashboard</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              {liveStatus === "live" ? "Live" : liveStatus === "paused" ? "Paused" : "Error"}
            </span>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground hidden sm:inline">Updated {fmtTime(lastUpdated)}</span>
            )}
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setPaused(p => !p)} title={paused ? "Resume" : "Pause"}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => fetchData()} disabled={refreshing} title="Refresh now">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error} — showing last known values</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/60 border border-border">
            <TabsTrigger value="overview"    className="text-xs sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="leaderboard" className="text-xs sm:text-sm">
              Leaderboard
              {data && <Badge className="ml-1.5 h-4 px-1.5 text-[10px] bg-muted text-muted-foreground border-0">{data.leaderboard.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="staff"       className="text-xs sm:text-sm">Staff</TabsTrigger>
            <TabsTrigger value="activity"    className="text-xs sm:text-sm">Activity</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-6 mt-0">
            {/* 8 KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Revenue"       value={kpis ? fmt$(kpis.revenue)       : "—"} icon={DollarSign} color="bg-blue-500/10 text-blue-400" />
              <KpiCard label="Cash Collected" value={kpis ? fmt$(kpis.cashCollected) : "—"} icon={DollarSign} color="bg-emerald-500/10 text-emerald-400" />
              <KpiCard label="Total Calls"   value={kpis ? kpis.totalCalls.toLocaleString() : "—"} icon={Phone}       color="bg-purple-500/10 text-purple-400" />
              <KpiCard label="Demos Set"     value={kpis ? String(kpis.totalDemos)  : "—"} icon={BarChart2}   color="bg-orange-500/10 text-orange-400" />
              <KpiCard label="Show Rate"     value={kpis ? fmtPct(kpis.showRate)    : "—"} icon={TrendingUp}  color="bg-sky-500/10 text-sky-400" sub="demos showed / set" />
              <KpiCard label="Close Rate"    value={kpis ? fmtPct(kpis.closeRate)   : "—"} icon={Target}      color="bg-pink-500/10 text-pink-400" sub="deals closed / demos" />
              <KpiCard label="Deals Closed"  value={kpis ? String(kpis.totalClosed) : "—"} icon={TrendingUp}  color="bg-amber-500/10 text-amber-400" />
              <KpiCard label="Active Setters" value={kpis ? String(kpis.activeSetters) : "—"} icon={Users}    color="bg-violet-500/10 text-violet-400" />
            </div>

            {/* Revenue trend chart */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Revenue Over Time</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                {trendData.length > 0 ? (
                  <RevenueOverTimeChart data={trendData} />
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                    {data ? "No deal data yet — add rows to the Leadwell Deal Log" : <Loader2 className="h-5 w-5 animate-spin" />}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Leaderboard ── */}
          <TabsContent value="leaderboard" className="mt-0">
            <Card className="bg-card border-border overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Rep Leaderboard</CardTitle>
                <p className="text-[11px] text-muted-foreground">Click a row to expand stats · Click column header to sort</p>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <LeaderboardTable entries={data?.leaderboard ?? []} loading={refreshing && !data} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Staff ── */}
          <TabsContent value="staff" className="space-y-4 mt-0">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search by name or ID…" value={staffSearch} onChange={e => setStaffSearch(e.target.value)} className="pl-9 h-9 text-sm" />
              </div>
              <Button size="sm" className="h-9 gap-1.5" onClick={() => setAdding(a => !a)}>
                <Plus className="h-3.5 w-3.5" />Add Staff
              </Button>
            </div>

            {adding && (
              <Card className="bg-muted/40 border-border">
                <CardContent className="pt-4 pb-4 px-5">
                  <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input placeholder="Maya Iredale" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-sm" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Role</Label>
                      <Input placeholder="Setter" value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} className="h-9 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-9" onClick={addStaff} disabled={saving || !addForm.name || !addForm.role}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9" onClick={() => { setAdding(false); setAddForm({ name: "", role: "" }); }}>Cancel</Button>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">ID auto-assigned (STF-XXXX)</p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Role</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredStaff.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">{data ? "No staff found" : <Loader2 className="h-4 w-4 animate-spin mx-auto" />}</td></tr>
                    ) : filteredStaff.map(m => (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{m.id}</td>
                        <td className="px-5 py-3 font-medium">{m.name}</td>
                        <td className="px-5 py-3 text-muted-foreground hidden sm:table-cell">{m.role}</td>
                        <td className="px-5 py-3"><StatusBadge status={m.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => toggleStatus(m)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                            Mark {m.status === "active" ? "away" : "active"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* ── Activity ── */}
          <TabsContent value="activity" className="mt-0">
            <Card className="bg-card border-border overflow-hidden">
              <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Activity Log</CardTitle>
                {activityLog.length > 0 && (
                  <button onClick={() => setActivityLog([])} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Clear</button>
                )}
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {activityLog.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet</p>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
                    {activityLog.map((entry, i) => (
                      <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                        <LogBadge type={entry.type} />
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{fmtTime(entry.ts)}</span>
                        <span className="text-sm">{entry.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
