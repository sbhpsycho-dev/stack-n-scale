"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  name: string;
  email: string;
  status: string;
  healthScore: number;
  createdAt: string;
  activeDate: string | null;
  coach: string | null;
  cashMTD: number;
  lastCheckIn: string | null;
  revShareOwed: number;
  revShareTotal: number;
  dealGross: number | null;
  reportedIncome: number | null;
  roiStat: number | null;
}

interface ClientsData {
  rows: ClientRow[];
  active: number;
  churned: number;
  pipeline: number;
  avgHealth: number;
  distribution: { status: string; count: number }[];
}

type SortKey = keyof ClientRow;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function checkInLabel(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function checkInColor(dateStr: string | null): string {
  if (!dateStr) return "text-red-400";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days <= 7)  return "text-green-400";
  if (days <= 14) return "text-orange-400";
  return "text-red-400";
}

function healthColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-orange-400";
  return "text-red-400";
}

function roiColor(roi: number | null): string {
  if (roi === null) return "text-muted-foreground";
  if (roi >= 2) return "text-green-400";
  if (roi >= 1) return "text-orange-400";
  return "text-red-400";
}

// ─── Sub-components (defined at module level to avoid re-creation on render) ──

type SortState = { col: SortKey; dir: "asc" | "desc" };

function SortIcon({ col, sort }: { col: SortKey; sort: SortState }) {
  if (sort.col !== col) return <span className="opacity-20 ml-0.5">↕</span>;
  return sort.dir === "asc"
    ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
    : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
}

function Th({ col, label, sort, onSort }: { col: SortKey; label: string; sort: SortState; onSort: (col: SortKey) => void }) {
  return (
    <th
      onClick={() => onSort(col)}
      className="text-left px-3 py-2 font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
    >
      {label}<SortIcon col={col} sort={sort} />
    </th>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientHealthHeatmap({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData]         = useState<ClientsData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [sort, setSort]         = useState<{ col: SortKey; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/staff/kpi/clients");
      if (res.ok) setData(await res.json());
      else setError("Failed to load client data.");
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshSignal]);

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus();
  }, [editingId]);

  const toggleSort = (col: SortKey) => {
    setSort(prev => prev.col === col
      ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { col, dir: "asc" }
    );
  };

  const startEdit = (row: ClientRow) => {
    setEditingId(row.id);
    setEditValue(row.reportedIncome !== null ? String(row.reportedIncome) : "");
  };

  const commitEdit = async (rowId: string) => {
    const income = parseFloat(editValue);
    setEditingId(null);
    if (isNaN(income) || income < 0) return;

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const rows = prev.rows.map(r => {
        if (r.id !== rowId) return r;
        const dealGross = r.dealGross;
        const roiStat   = dealGross && dealGross > 0
          ? Math.round((income / dealGross) * 10) / 10
          : null;
        return { ...r, reportedIncome: income, roiStat };
      });
      return { ...prev, rows };
    });

    await fetch(`/api/staff/students/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportedIncome: income }),
    });
  };

  if (loading && !data) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
        <button onClick={load} className="text-xs text-orange-400 hover:underline">Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const roiCount = data.rows.filter(r => r.roiStat !== null).length;
  const totalRevShareOwed = data.rows.reduce((s, r) => s + r.revShareOwed, 0);

  // Sort rows
  const sorted = [...data.rows].sort((a, b) => {
    const av = a[sort.col];
    const bv = b[sort.col];
    const cmp = av === null ? 1 : bv === null ? -1 : av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Active Clients"      value={data.active}          variant="green"   index={0} />
        <MetricCard label="Avg Health"          value={data.avgHealth}       suffix="%" variant="default" index={1} />
        <MetricCard label="Rev Share Owed"      value={totalRevShareOwed}    prefix="$" variant="orange" index={2} />
        <MetricCard label="ROI Data Collected"  value={roiCount}             variant="default" index={3} hint={`of ${data.rows.length} clients`} />
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead className="bg-muted/50">
            <tr>
              <Th col="name"          label="Client"         sort={sort} onSort={toggleSort} />
              <Th col="cashMTD"       label="Cash MTD"       sort={sort} onSort={toggleSort} />
              <Th col="lastCheckIn"   label="Check-In"       sort={sort} onSort={toggleSort} />
              <Th col="healthScore"   label="Health"         sort={sort} onSort={toggleSort} />
              <Th col="revShareOwed"  label="Rev Share Owed" sort={sort} onSort={toggleSort} />
              <Th col="revShareTotal" label="Rev Share"      sort={sort} onSort={toggleSort} />
              <Th col="roiStat"       label="ROI Stat"       sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">

                {/* Client */}
                <td className="px-3 py-2">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-[10px] text-muted-foreground">{r.status}</span>
                </td>

                {/* Cash MTD */}
                <td className={`px-3 py-2 font-semibold tabular-nums ${r.cashMTD > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                  {r.cashMTD > 0 ? fmt$(r.cashMTD) : "—"}
                </td>

                {/* Check-In */}
                <td className={`px-3 py-2 font-medium ${checkInColor(r.lastCheckIn)}`}>
                  {checkInLabel(r.lastCheckIn)}
                </td>

                {/* Health */}
                <td className={`px-3 py-2 font-semibold ${healthColor(r.healthScore)}`}>
                  {r.healthScore}%
                </td>

                {/* Rev Share Owed */}
                <td className={`px-3 py-2 tabular-nums ${r.revShareOwed > 0 ? "text-orange-400 font-semibold" : "text-muted-foreground"}`}>
                  {r.revShareOwed > 0 ? fmt$(r.revShareOwed) : "—"}
                </td>

                {/* Rev Share Total */}
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {r.revShareTotal > 0 ? fmt$(r.revShareTotal) : "—"}
                </td>

                {/* ROI Stat — click to edit */}
                <td className="px-3 py-2">
                  {editingId === r.id ? (
                    <input
                      ref={inputRef}
                      type="number"
                      min="0"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(r.id)}
                      onKeyDown={e => {
                        if (e.key === "Enter") commitEdit(r.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      placeholder="income earned"
                      className="w-28 bg-muted border border-border rounded px-2 py-0.5 text-xs outline-none focus:border-orange-500"
                    />
                  ) : (
                    <button
                      onClick={() => startEdit(r)}
                      title="Click to set reported income"
                      className={`font-semibold tabular-nums ${roiColor(r.roiStat)} hover:opacity-70 transition-opacity`}
                    >
                      {r.roiStat !== null ? `${r.roiStat}x` : <span className="text-muted-foreground font-normal">set</span>}
                    </button>
                  )}
                </td>

              </tr>
            ))}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Click the ROI cell to set a client&apos;s reported income. ROI = reported income ÷ coaching cost.
      </p>
    </div>
  );
}
