"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface SetterRow {
  name: string;
  cashCollected: number;
  callsMade: number;
  demosSet: number;
  demosShowed: number;
  dealsClosed: number;
  showRate: number;
  closeRate: number;
}

export interface LeaderboardData {
  leaderboard: SetterRow[];
  totalCash: number;
  totalDeals: number;
  totalCalls: number;
  avgCloseRate: number;
  source: "sheet" | "cache" | "kv" | "empty";
}

export type SortMetric = "cashCollected" | "dealsClosed" | "callsMade" | "closeRate";
export type SortDir = "desc" | "asc";
// positive = climbed in rank, negative = dropped
export type RankDeltas = Record<string, number>;

const POLL_INTERVAL_MS = 30_000;
const FLASH_DURATION_MS = 1200;

export function useLeaderboard() {
  const [data, setData]               = useState<LeaderboardData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortMetric, setSortMetric]   = useState<SortMetric>("cashCollected");
  const [sortDir, setSortDir]         = useState<SortDir>("desc");
  const [rankDeltas, setRankDeltas]   = useState<RankDeltas>({});
  const [flashedReps, setFlashedReps] = useState<Set<string>>(new Set());

  const prevRanksRef    = useRef<Record<string, number>>({});
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Track the raw leaderboard array for the delta effect dependency
  const dataRef = useRef<LeaderboardData | null>(null);
  dataRef.current = data;

  const sortedRows: SetterRow[] = !data ? [] : [...data.leaderboard].sort((a, b) => {
    const diff = a[sortMetric] - b[sortMetric];
    return sortDir === "desc" ? -diff : diff;
  });

  const setSort = (metric: SortMetric) => {
    if (metric === sortMetric) {
      setSortDir(d => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortMetric(metric);
      setSortDir("desc");
    }
  };

  const fetchOnce = useCallback(async (isInitial: boolean) => {
    try {
      const res = await fetch("/api/staff/kpi/setters");
      if (!res.ok) {
        setError("Failed to load leaderboard.");
        if (isInitial) setLoading(false);
        return;
      }
      const json: LeaderboardData = await res.json();
      setData(json);
      setError("");
      setLastUpdated(new Date());
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Compute rank deltas whenever sorted order changes (new data or sort change)
  const sortKey = sortedRows.map(r => `${r.name}:${r[sortMetric]}`).join(",");
  useEffect(() => {
    if (!sortedRows.length) return;

    const currentRanks: Record<string, number> = {};
    sortedRows.forEach((r, i) => { currentRanks[r.name] = i + 1; });

    const deltas: RankDeltas = {};
    const flashed = new Set<string>();
    for (const name of Object.keys(currentRanks)) {
      const prev = prevRanksRef.current[name];
      if (prev !== undefined) {
        deltas[name] = prev - currentRanks[name]; // positive = moved up
        if (deltas[name] !== 0) flashed.add(name);
      }
    }
    prevRanksRef.current = currentRanks;
    setRankDeltas(deltas);
    setFlashedReps(flashed);

    if (flashed.size > 0) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setFlashedReps(new Set()), FLASH_DURATION_MS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortMetric, sortDir]);

  useEffect(() => {
    fetchOnce(true);
    const id = setInterval(() => fetchOnce(false), POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [fetchOnce]);

  return {
    data,
    sortedRows,
    rankDeltas,
    flashedReps,
    loading,
    error,
    lastUpdated,
    sortMetric,
    sortDir,
    setSort,
    refresh: () => fetchOnce(false),
  };
}
