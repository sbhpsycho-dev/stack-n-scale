"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { Rep } from "@/lib/sales-data";

const TT = { contentStyle: { background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#aaa" } };
const COLORS = ["#3b82f6", "#f97316", "#a855f7", "#22c55e"];
const fmtK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `${v}`;

export function CallsPerRepChart({ data }: { data: Rep[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#777", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...TT} formatter={(v) => [v, "Calls Made"]} />
        <Bar dataKey="callsMade" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={100}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CloseRatePerRepChart({ data }: { data: Rep[] }) {
  const enriched = data.map((r) => ({
    ...r,
    closeRate: r.demosShowed > 0 ? Math.round((r.dealsClosed / r.demosShowed) * 100) : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={enriched} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#777", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
        <Tooltip {...TT} formatter={(v) => [`${v}%`, "Close Rate"]} />
        <Bar dataKey="closeRate" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={150}>
          {enriched.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashPerRepChart({ data }: { data: Rep[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "#777", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmtK} tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...TT} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Cash Collected"]} />
        <Bar dataKey="cashCollected" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={200}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
