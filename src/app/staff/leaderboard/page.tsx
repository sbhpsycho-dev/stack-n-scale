"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Trophy, Check, X, RefreshCw, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeaderboard, type SortMetric } from "@/hooks/use-leaderboard";

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const PODIUM_CONFIG = [
  { rank: 1, label: "1st", color: "text-yellow-400", border: "border-yellow-400/40", bg: "bg-yellow-400/10", size: "text-3xl" },
  { rank: 2, label: "2nd", color: "text-zinc-300",   border: "border-zinc-400/30",   bg: "bg-zinc-400/10",   size: "text-2xl" },
  { rank: 3, label: "3rd", color: "text-amber-600",  border: "border-amber-700/30",  bg: "bg-amber-700/10",  size: "text-2xl" },
];

function CloseRateBadge({ rate }: { rate: number }) {
  const cls = rate >= 30 ? "text-green-400" : rate >= 15 ? "text-orange-400" : "text-red-400";
  return <span className={cls}>{rate}%</span>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-bold">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-400/20 text-zinc-300 text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-600 text-xs font-bold">3</span>;
  return <span className="inline-flex items-center justify-center w-6 h-6 text-muted-foreground text-xs font-medium">{rank}</span>;
}

function RankDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded animate-delta-badge-in",
        up ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"
      )}
    >
      {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {Math.abs(delta)}
    </span>
  );
}

function LiveDot({ lastUpdated }: { lastUpdated: Date | null }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      Live
      {lastUpdated && (
        <span className="text-muted-foreground/60">
          · {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      )}
    </div>
  );
}

function SortableHeader({
  label, metric, currentMetric, dir, onSort,
}: {
  label: string;
  metric: SortMetric;
  currentMetric: SortMetric;
  dir: "asc" | "desc";
  onSort: (m: SortMetric) => void;
}) {
  const active = metric === currentMetric;
  return (
    <th
      onClick={() => onSort(metric)}
      className={cn(
        "text-left px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === "desc"
            ? <ArrowDown className="h-3 w-3 opacity-70" />
            : <ArrowUp className="h-3 w-3 opacity-70" />
          : <Minus className="h-3 w-3 opacity-20" />}
      </span>
    </th>
  );
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const { data, sortedRows, rankDeltas, flashedReps, loading, error, lastUpdated, sortMetric, sortDir, setSort, refresh } = useLeaderboard();

  const [syncing, setSyncing]       = useState(false);
  const [syncDone, setSyncDone]     = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  async function handleSync() {
    setSyncing(true);
    setSyncDone(false);
    setSyncFailed(false);
    try {
      const res = await fetch("/api/admin/sync-leaderboard", { method: "POST" });
      if (res.ok) {
        setSyncDone(true);
        refresh();
        setTimeout(() => setSyncDone(false), 3000);
      } else {
        setSyncFailed(true);
        setTimeout(() => setSyncFailed(false), 4000);
      }
    } catch {
      setSyncFailed(true);
      setTimeout(() => setSyncFailed(false), 4000);
    } finally {
      setSyncing(false);
    }
  }

  const top3 = sortedRows.slice(0, 3);
  const rest  = sortedRows.slice(3);

  const sortLabel: Record<SortMetric, string> = {
    cashCollected: "cash collected",
    dealsClosed:   "deals closed",
    callsMade:     "calls made",
    closeRate:     "close rate",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-5 w-5 text-orange-500" />
            Rep Leaderboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ranked by {sortLabel[sortMetric]} — click any column header to change
          </p>
          {data && (
            <div className="mt-1">
              {data.source === "sheet" && <LiveDot lastUpdated={lastUpdated} />}
              {data.source === "cache" && (
                <span className="text-[11px] text-orange-400">Cached from last sync — click Sync Sheet to refresh</span>
              )}
              {data.source === "kv" && (
                <span className="text-[11px] text-blue-400">Built from logged deals</span>
              )}
              {data.source === "empty" && (
                <span className="text-[11px] text-muted-foreground">No data yet — click Sync Sheet</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="h-8 px-3 rounded-lg bg-muted text-xs font-medium flex items-center gap-1.5 hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : syncDone ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : syncFailed ? (
                <X className="h-3 w-3 text-red-400" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {syncDone ? "Synced" : syncFailed ? "Failed" : "Sync Sheet"}
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
          <button onClick={refresh} className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors">
            Retry
          </button>
        </div>
      )}

      {data && sortedRows.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-xs text-muted-foreground">
            No rep data yet — ensure the Setter KPI Tracker sheet is shared with the service account, then click Sync Sheet.
          </CardContent>
        </Card>
      )}

      {data && sortedRows.length > 0 && (
        <>
          {/* Company-wide aggregate */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Cash",     value: fmt$(data.totalCash) },
              { label: "Total Deals",    value: String(data.totalDeals) },
              { label: "Total Calls",    value: String(data.totalCalls) },
              { label: "Avg Close Rate", value: `${data.avgCloseRate}%` },
            ].map(({ label, value }) => (
              <Card key={label} className="bg-card border-border">
                <CardContent className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold mt-0.5">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Top-3 podium */}
          {top3.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PODIUM_CONFIG.filter(p => top3[p.rank - 1]).map(({ rank, label, color, border, bg, size }) => {
                const rep = top3[rank - 1];
                return (
                  <Card key={rank} className={`bg-card border ${border} relative overflow-hidden`}>
                    <div className={`absolute inset-0 ${bg} pointer-events-none`} />
                    <CardContent className="px-5 py-5 relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
                        <Trophy className={`h-4 w-4 ${color}`} />
                      </div>
                      <p className="font-bold text-base truncate">{rep.name}</p>
                      <p className={`font-extrabold ${size} mt-1`}>
                        {sortMetric === "cashCollected" ? fmt$(rep.cashCollected)
                          : sortMetric === "dealsClosed" ? `${rep.dealsClosed} deals`
                          : sortMetric === "callsMade"   ? `${rep.callsMade} calls`
                          : `${rep.closeRate}%`}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                        <span><span className="text-foreground font-semibold">{fmt$(rep.cashCollected)}</span> collected</span>
                        <span><span className="text-foreground font-semibold">{rep.dealsClosed}</span> closed</span>
                        {rep.callsMade > 0 && (
                          <span><span className="text-foreground font-semibold">{rep.callsMade}</span> calls</span>
                        )}
                        <span><CloseRateBadge rate={rep.closeRate} /> close rate</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Full rankings table */}
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Rep</th>
                  <SortableHeader label="Cash Collected" metric="cashCollected" currentMetric={sortMetric} dir={sortDir} onSort={setSort} />
                  <SortableHeader label="Closed"         metric="dealsClosed"   currentMetric={sortMetric} dir={sortDir} onSort={setSort} />
                  <SortableHeader label="Calls Made"     metric="callsMade"     currentMetric={sortMetric} dir={sortDir} onSort={setSort} />
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Demos Set</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Showed</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Show Rate</th>
                  <SortableHeader label="Close Rate"     metric="closeRate"     currentMetric={sortMetric} dir={sortDir} onSort={setSort} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((rep, i) => {
                  const delta = rankDeltas[rep.name] ?? 0;
                  const flashing = flashedReps.has(rep.name);
                  const isMe = !!session?.user?.name && session.user.name.toLowerCase() === rep.name.toLowerCase();
                  return (
                    <tr
                      key={rep.name}
                      className={cn(
                        "border-t border-border hover:bg-muted/30 transition-colors",
                        flashing && delta > 0 && "animate-rank-flash-up",
                        flashing && delta < 0 && "animate-rank-flash-down",
                        isMe && "ring-1 ring-inset ring-orange-500/50 bg-orange-500/5",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <RankBadge rank={i + 1} />
                          {delta !== 0 && <RankDeltaBadge delta={delta} />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                        {rep.name}
                        {isMe && (
                          <span className="ml-1.5 text-[10px] font-semibold text-orange-400 bg-orange-400/10 px-1 py-0.5 rounded">You</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-green-400 font-semibold">{fmt$(rep.cashCollected)}</td>
                      <td className="px-3 py-2.5">{rep.dealsClosed}</td>
                      <td className="px-3 py-2.5">{rep.callsMade}</td>
                      <td className="px-3 py-2.5">{rep.demosSet}</td>
                      <td className="px-3 py-2.5">{rep.demosShowed}</td>
                      <td className="px-3 py-2.5">{rep.showRate}%</td>
                      <td className="px-3 py-2.5"><CloseRateBadge rate={rep.closeRate} /></td>
                    </tr>
                  );
                })}
                {rest.length === 0 && top3.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No reps found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
