"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import type { LeadPoint, CampaignLead, SpendSplit } from "@/lib/sales-data";

const TT = { contentStyle: { background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#aaa" } };

export function LeadsOverTimeChart({ data }: { data: LeadPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...TT} formatter={(v) => [v, "Leads"]} />
        <Bar dataKey="leads" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={100} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadsByCampaignChart({ data }: { data: CampaignLead[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="campaign" tick={{ fill: "#777", fontSize: 10 }}
          tickLine={false} axisLine={false} angle={-15} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: "#777", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...TT} formatter={(v) => [v, "Leads"]} />
        <Bar dataKey="leads" fill="#f97316" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={150} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AdSpendSplitChart({ data }: { data: SpendSplit[] }) {
  const COLORS = ["#3b82f6", "#f97316"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="48%" outerRadius={80} dataKey="pct" nameKey="platform"
          animationBegin={0} animationDuration={900}
          label={({ name, value }) => `${name} ${value}%`}
          labelLine={{ stroke: "#555" }}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 12, color: "#777" }} />
        <Tooltip {...TT} formatter={(v) => [`${v}%`, "Share"]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
