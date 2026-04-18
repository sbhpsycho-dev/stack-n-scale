"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "green" | "orange" | "black" | "default";

const bg: Record<Variant, string> = {
  green:   "bg-emerald-600 border-emerald-700 text-white",
  orange:  "bg-orange-500 border-orange-600 text-white",
  black:   "bg-zinc-950 border-zinc-800 text-white",
  default: "bg-card border-border text-foreground",
};

const sub: Record<Variant, string> = {
  green:   "text-emerald-100/75",
  orange:  "text-orange-100/75",
  black:   "text-zinc-500",
  default: "text-muted-foreground",
};

interface MetricCardProps {
  label: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  variant?: Variant;
  index?: number;
  decimals?: number;
  wide?: boolean;
}

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const display = useTransform(mv, (v) =>
    `${prefix}${decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()}${suffix}`
  );

  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 1.2, ease: "easeOut" });
    return ctrl.stop;
  }, [value, mv]);

  return <motion.span>{display}</motion.span>;
}

export function MetricCard({ label, value, prefix = "", suffix = "", variant = "default", index = 0, decimals = 0, wide = false }: MetricCardProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
      className={cn("rounded-xl border p-4 flex flex-col gap-1.5", bg[variant], wide && "col-span-2")}
    >
      <span className={cn("text-[11px] font-semibold uppercase tracking-wider leading-none", sub[variant])}>
        {label}
      </span>
      <span className="text-2xl font-bold leading-tight tracking-tight">
        {typeof value === "number"
          ? <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
          : `${prefix}${value}${suffix}`}
      </span>
    </motion.div>
  );
}
