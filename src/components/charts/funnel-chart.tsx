"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { FunnelWeek, StageCount } from "@/lib/sales-data";

const TT = { contentStyle: { background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#aaa" } };

const STAGE_COLORS = {
  callsMade:     "#3b82f6",
  callsAnswered: "#f97316",
  demosSet:      "#a855f7",
  demosShowed:   "#84cc16",
  pitched:       "#06b6d4",
  closed:        "#eab308",
} as const;

export function PipelineFunnelChart({ data }: { data: FunnelWeek[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="week" tick={{ fill: "#ccc", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#777" }} />
        {(Object.keys(STAGE_COLORS) as (keyof typeof STAGE_COLORS)[]).map((key) => (
          <Bar key={key} dataKey={key} fill={STAGE_COLORS[key]}
            radius={[0, 3, 3, 0]} animationDuration={700} animationBegin={100}
            name={key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StageBreakdownChart({ data }: { data: StageCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="stage" tick={{ fill: "#777", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...TT} formatter={(v) => [v, "Records"]} />
        <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={150} />
      </BarChart>
    </ResponsiveContainer>
  );
}
