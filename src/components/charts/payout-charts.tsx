"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#71717a"];

interface SliceData {
  name: string;
  value: number;
}

export function PayoutSplitChart({ data }: { data: SliceData[] }) {
  if (!data.length) return (
    <p className="text-xs text-muted-foreground text-center py-8">No deals logged yet</p>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
          formatter={(v) => [`${v}%`, ""]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          formatter={(value, entry) => `${value} — ${(entry.payload as SliceData).value}%`}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
