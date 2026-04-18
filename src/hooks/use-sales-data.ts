"use client";

import { useState, useCallback, useEffect } from "react";
import { type SalesData, SEED } from "@/lib/sales-data";

const LS_KEY = "sns-dashboard-v1";

function loadLocal(): SalesData {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SalesData) : SEED;
  } catch {
    return SEED;
  }
}

export function useSalesData() {
  const [data, setData] = useState<SalesData>(loadLocal);
  const [loading, setLoading] = useState(true);

  // Hydrate from KV on mount
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((remote: SalesData) => {
        setData(remote);
        try { localStorage.setItem(LS_KEY, JSON.stringify(remote)); } catch { /* ignore */ }
      })
      .catch(() => { /* stay on local cache */ })
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback((next: SalesData) => {
    setData(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    // Sync to KV in the background
    fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => { /* offline — local cache updated, will sync on next save */ });
  }, []);

  const reset = useCallback(() => {
    update(SEED);
  }, [update]);

  return { data, update, reset, loading };
}
