"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import type { ScoredAd } from "@/lib/ads-scorecard";

const TT = {
  contentStyle: { background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "#e4e4e7" },
};

const TIER_COLOR: Record<string, string> = {
  green:  "#10b981", // emerald-500
  yellow: "#f59e0b", // amber-500
  red:    "#f43f5e", // rose-500
};

function shortName(name: string, max = 18): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ── Grouped bar: total leads vs qualified leads per ad ────────────────────────

export function AdLeadsBarChart({ ads }: { ads: ScoredAd[] }) {
  const sorted = [...ads].sort((a, b) => b.score - a.score);
  const data = sorted.map(ad => ({
    name:   shortName(ad.name),
    total:  ad.ghlLeads,
    qual:   ad.qualifiedLeads,
    tier:   ad.tier,
    fill:   TIER_COLOR[ad.tier],
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 36 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: "#71717a", fontSize: 10 }}
          tickLine={false} axisLine={false}
          angle={-20} textAnchor="end" interval={0}
        />
        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          {...TT}
          formatter={(val, key) => [val, key === "qual" ? "Qualified" : "Total Leads"]}
        />
        <Bar dataKey="total" name="Total Leads" fill="#3f3f46" radius={[2, 2, 0, 0]} />
        <Bar dataKey="qual" name="Qualified" radius={[4, 4, 0, 0]} animationDuration={800}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Stacked area: qualified-lead trend over 14 days split by tier ─────────────

export function QualLeadTrendAreaChart({ ads }: { ads: ScoredAd[] }) {
  // Build a map of date → { green, yellow, red }
  const dateMap: Record<string, { green: number; yellow: number; red: number }> = {};

  for (const ad of ads) {
    for (const pt of ad.trendDays) {
      if (!dateMap[pt.date]) dateMap[pt.date] = { green: 0, yellow: 0, red: 0 };
      const tier = ad.tier as "green" | "yellow" | "red";
      dateMap[pt.date][tier] += pt.qualLeads;
    }
  }

  const data = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({
      date: date.slice(5), // MM-DD
      ...counts,
    }));

  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        No trend data yet — run Make.com scenario to populate.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gradGreen"  x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradYellow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradRed"    x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#71717a", paddingTop: 8 }} />
        <Area
          type="monotone" dataKey="green" name="Scale (Green)"
          stackId="tier" stroke="#10b981" fill="url(#gradGreen)"
          strokeWidth={1.5} animationDuration={900}
        />
        <Area
          type="monotone" dataKey="yellow" name="Watch (Yellow)"
          stackId="tier" stroke="#f59e0b" fill="url(#gradYellow)"
          strokeWidth={1.5} animationDuration={900}
        />
        <Area
          type="monotone" dataKey="red" name="Cut (Red)"
          stackId="tier" stroke="#f43f5e" fill="url(#gradRed)"
          strokeWidth={1.5} animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Inline score mini-bar (no Recharts) ───────────────────────────────────────

export function AdScoreMiniBar({ score, tier }: { score: number; tier: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(2, score)}%`,
            background: TIER_COLOR[tier] ?? "#71717a",
          }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">{score}</span>
    </div>
  );
}
