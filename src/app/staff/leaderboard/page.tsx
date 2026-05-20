"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, Trophy, Check, X } from "lucide-react";

interface SetterRow {
  name: string;
  cashCollected: number;
  demosSet: number;
  demosShowed: number;
  dealsClosed: number;
  showRate: number;
  closeRate: number;
}

interface SettersData {
  leaderboard: SetterRow[];
  totalCash: number;
  totalDeals: number;
  avgCloseRate: number;
}

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

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [data, setData] = useState<SettersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/setters");
      if (res.ok) setData(await res.json());
      else setError("Failed to load leaderboard. Ensure the Setter KPI sheet is shared with the service account.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncDone(false);
    setSyncFailed(false);
    try {
      const res = await fetch("/api/admin/sync-leaderboard", { method: "POST" });
      if (res.ok) {
        setSyncDone(true);
        await load();
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

  const ranked = data?.leaderboard.slice().sort((a, b) => b.cashCollected - a.cashCollected) ?? [];
  const top3   = ranked.slice(0, 3);
  const rest   = ranked.slice(3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-5 w-5 text-orange-500" />
            Rep Leaderboard
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Ranked by cash collected — all time</p>
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
          <button
            onClick={load}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
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
          <button onClick={load} className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors">
            Retry
          </button>
        </div>
      )}

      {data && ranked.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-xs text-muted-foreground">
            No rep data yet — ensure the Setter KPI Tracker sheet is shared with the service account, then click Sync Sheet.
          </CardContent>
        </Card>
      )}

      {data && ranked.length > 0 && (
        <>
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
                      <p className={`font-extrabold ${size} mt-1`}>{fmt$(rep.cashCollected)}</p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span><span className="text-foreground font-semibold">{rep.dealsClosed}</span> closed</span>
                        <span><CloseRateBadge rate={rep.closeRate} /> close rate</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Full rankings table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {["#", "Rep", "Cash Collected", "Closed", "Demos Set", "Showed", "Show Rate", "Close Rate"].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((rep, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5"><RankBadge rank={i + 1} /></td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{rep.name}</td>
                    <td className="px-3 py-2.5 text-green-400 font-semibold">{fmt$(rep.cashCollected)}</td>
                    <td className="px-3 py-2.5">{rep.dealsClosed}</td>
                    <td className="px-3 py-2.5">{rep.demosSet}</td>
                    <td className="px-3 py-2.5">{rep.demosShowed}</td>
                    <td className="px-3 py-2.5">{rep.showRate}%</td>
                    <td className="px-3 py-2.5"><CloseRateBadge rate={rep.closeRate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <div className="flex items-center gap-6 text-xs text-muted-foreground px-1">
            <span><span className="text-foreground font-semibold">{fmt$(data.totalCash)}</span> total collected</span>
            <span><span className="text-foreground font-semibold">{data.totalDeals}</span> total deals</span>
            <span><span className="text-foreground font-semibold">{data.avgCloseRate}%</span> avg close rate</span>
          </div>
        </>
      )}
    </div>
  );
}
