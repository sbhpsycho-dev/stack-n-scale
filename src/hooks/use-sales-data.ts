"use client";

import { useState, useCallback } from "react";
import { type SalesData, SEED } from "@/lib/sales-data";

const KEY = "sns-dashboard-v1";

function load(): SalesData {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SalesData) : SEED;
  } catch {
    return SEED;
  }
}

export function useSalesData() {
  const [data, setData] = useState<SalesData>(load);

  const update = useCallback((next: SalesData) => {
    setData(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full */ }
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setData(SEED);
  }, []);

  return { data, update, reset };
}
