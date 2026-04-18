"use client";

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import type { TimePoint, NameAmount } from "@/lib/sales-data";

const TT = { contentStyle: { background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#aaa" } };
const fmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;
const BLUE = "#3b82f6";
const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7"];

export function RevenueOverTimeChart({ data }: { data: TimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={BLUE} stopOpacity={0.35} />
            <stop offset="95%" stopColor={BLUE} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="date" tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...TT} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Net Amount"]} />
        <Area type="monotone" dataKey="amount" stroke={BLUE} strokeWidth={2.5}
          fill="url(#revGrad)" dot={{ fill: BLUE, r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
          animationDuration={1000} animationBegin={100} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function NetByProductChart({ data }: { data: NameAmount[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 48 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#777", fontSize: 10 }} tickLine={false} axisLine={false}
          angle={-20} textAnchor="end" interval={0} />
        <YAxis tickFormatter={fmt} tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...TT} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Net Amount"]} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]} animationDuration={900} animationBegin={150}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetByProcessorChart({ data }: { data: NameAmount[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis type="number" tickFormatter={fmt} tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "#ccc", fontSize: 12 }} tickLine={false} axisLine={false} width={68} />
        <Tooltip {...TT} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Net Amount"]} />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} animationDuration={900} animationBegin={200}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
