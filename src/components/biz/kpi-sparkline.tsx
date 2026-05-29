"use client";

import { LineChart, Line, Tooltip, ResponsiveContainer, XAxis } from "recharts";
import { type KpiDef, type KpiEntry } from "@/lib/biz-client-types";

function fmtVal(val: number, unit: KpiDef["unit"]) {
  if (unit === "$") return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (unit === "%") return `${val}%`;
  return String(val);
}

interface Props {
  label: string;
  unit: KpiDef["unit"];
  kpiKey: string;
  entries: KpiEntry[];
}

export function KpiSparkline({ label, unit, kpiKey, entries }: Props) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const latestVal = latest?.values[kpiKey];

  const chartData = sorted
    .filter((e) => kpiKey in e.values)
    .map((e) => ({ date: e.date.slice(5), value: e.values[kpiKey] }));

  return (
    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-bold">
        {latestVal !== undefined ? fmtVal(latestVal, unit) : "—"}
      </p>
      {chartData.length > 1 && (
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={chartData}>
            <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={1.5} dot={false} />
            <XAxis dataKey="date" hide />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                fontSize: 10,
                borderRadius: 6,
              }}
              formatter={(v) => [fmtVal(Number(v), unit), label]}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
