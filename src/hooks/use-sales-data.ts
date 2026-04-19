"use client";

import { useState, useCallback, useEffect } from "react";
import { type SalesData, SEED } from "@/lib/sales-data";

function lsKey(clientId: string | null) {
  return `sns-dashboard-${clientId ?? "pending"}`;
}

function loadLocal(clientId: string | null): SalesData {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(lsKey(clientId));
    return raw ? (JSON.parse(raw) as SalesData) : SEED;
  } catch {
    return SEED;
  }
}

export function useSalesData(clientId: string | null) {
  const [data, setData] = useState<SalesData>(() => loadLocal(clientId));
  const [loading, setLoading] = useState(true);

  const fetchRemote = useCallback(
    (isInitial = false) => {
      // Don't fetch until we know who we're fetching for
      if (clientId === null) return;
      fetch("/api/data")
        .then((r) => r.json())
        .then((remote: SalesData) => {
          setData(remote);
          try {
            localStorage.setItem(lsKey(clientId), JSON.stringify(remote));
          } catch { /* ignore */ }
        })
        .catch(() => { /* stay on local cache */ })
        .finally(() => { if (isInitial) setLoading(false); });
    },
    [clientId],
  );

  // Re-hydrate whenever clientId becomes known, then poll every 30s
  useEffect(() => {
    if (clientId === null) {
      setLoading(false);
      return;
    }
    // Load from localStorage for this client immediately
    setData(loadLocal(clientId));
    fetchRemote(true);
    const id = setInterval(() => fetchRemote(false), 30_000);
    return () => clearInterval(id);
  }, [clientId, fetchRemote]);

  const update = useCallback(
    (next: SalesData) => {
      setData(next);
      try {
        localStorage.setItem(lsKey(clientId), JSON.stringify(next));
      } catch { /* ignore */ }
      fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      }).catch(() => { /* offline — local cache updated */ });
    },
    [clientId],
  );

  const reset = useCallback(() => update(SEED), [update]);

  return { data, update, reset, loading };
}
