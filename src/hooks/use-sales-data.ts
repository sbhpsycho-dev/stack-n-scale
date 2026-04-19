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
          const local = loadLocal(clientId);
          const remoteIsBlank = remote.dashboard.cashCollectedMTD === SEED.dashboard.cashCollectedMTD
            && remote.dashboard.leadsThisMonth === SEED.dashboard.leadsThisMonth;
          const localHasData = local.dashboard.cashCollectedMTD !== SEED.dashboard.cashCollectedMTD
            || local.dashboard.leadsThisMonth !== SEED.dashboard.leadsThisMonth;

          if (remoteIsBlank && localHasData) {
            // KV has no real data but localStorage does — push local up to KV
            fetch("/api/data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(local),
            }).catch(() => {});
            setData(local);
          } else {
            setData(remote);
            try {
              localStorage.setItem(lsKey(clientId), JSON.stringify(remote));
            } catch { /* ignore */ }
          }
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
