"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveDot } from "@/components/ui/live-dot";
import {
  type BizClient,
  type BizClientStatus,
  BIZ_STATUS_LABELS,
  BIZ_STATUS_ORDER,
  BIZ_STATUS_COLORS,
} from "@/lib/biz-client-types";
import { daysSince } from "@/lib/utils";
import { Loader2, Plus, X, Building2, Users, TrendingUp, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 30_000;

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function ManageClientsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [clients, setClients] = useState<BizClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filterStatus, setFilterStatus] = useState<BizClientStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Add client modal state
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", contactName: "", contactEmail: "", contactPhone: "",
    status: "lead" as BizClientStatus, monthlyValue: "", services: "",
  });

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "admin") router.replace("/login");
  }, [session, status, router]);

  const load = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch("/api/manage-clients");
      if (res.ok) {
        setClients(await res.json());
        setLastUpdated(new Date());
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const id = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function addClient() {
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/manage-clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        monthlyValue: form.monthlyValue ? parseFloat(form.monthlyValue) : undefined,
      }),
    });
    if (res.ok) {
      const { client } = await res.json();
      setClients((prev) => [...prev, client]);
      setAdding(false);
      setForm({ name: "", contactName: "", contactEmail: "", contactPhone: "", status: "lead", monthlyValue: "", services: "" });
    }
    setSaving(false);
  }

  const filtered = clients.filter((c) => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactEmail.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  // KPI summary counts
  const counts = BIZ_STATUS_ORDER.reduce<Record<string, number>>((acc, s) => ({
    ...acc, [s]: clients.filter((c) => c.status === s).length,
  }), {});
  const totalMRR = clients.filter(c => c.status === "active").reduce((s, c) => s + (c.monthlyValue ?? 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 text-orange-500" />
            Managed Clients
          </h1>
          <div className="mt-1">
            <LiveDot lastUpdated={lastUpdated} />
          </div>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="h-8 px-3 rounded-lg bg-orange-500 text-white text-xs font-medium flex items-center gap-1.5 hover:bg-orange-600 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Client
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total",   value: clients.length,        color: "text-foreground" },
          { label: "Active",  value: counts.active ?? 0,    color: "text-emerald-400" },
          { label: "Signed",  value: counts.signed ?? 0,    color: "text-purple-400" },
          { label: "Lead",    value: counts.lead ?? 0,      color: "text-blue-400" },
          { label: "Paused",  value: counts.paused ?? 0,    color: "text-yellow-400" },
          { label: "Churned", value: counts.churned ?? 0,   color: "text-zinc-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* MRR banner */}
      {totalMRR > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-400">{fmt$(totalMRR)} / mo</span>
          <span className="text-xs text-muted-foreground">active client revenue</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="pl-8 h-8 text-xs w-48 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50 px-3"
          />
        </div>
        {(["all", ...BIZ_STATUS_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s as BizClientStatus | "all")}
            className={cn(
              "h-8 px-3 rounded-lg text-xs font-medium border transition-colors",
              filterStatus === s
                ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                : "bg-muted border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "all" ? `All (${clients.length})` : `${BIZ_STATUS_LABELS[s]} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Client Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {clients.length === 0 ? "No managed clients yet. Add your first one above." : "No clients match your filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-muted/50">
              <tr>
                {["Business", "Contact", "Status", "MRR", "Team", "Day #", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-foreground">{c.name}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{c.contactName || "—"}</p>
                    <p className="text-muted-foreground text-[11px]">{c.contactEmail}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge className={cn("text-[10px]", BIZ_STATUS_COLORS[c.status])}>
                      {BIZ_STATUS_LABELS[c.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-emerald-400 font-semibold">
                    {c.monthlyValue ? fmt$(c.monthlyValue) : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{c.teamMembers?.length ?? 0}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">Day {daysSince(c.createdAt)}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/manage-clients/${c.id}`}
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors text-[11px]"
                    >
                      View <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Client Modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-background border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Add Managed Client</h2>
              <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {[
              { label: "Business Name *", key: "name", placeholder: "Acme Corp" },
              { label: "Contact Name", key: "contactName", placeholder: "Jane Smith" },
              { label: "Contact Email", key: "contactEmail", placeholder: "jane@acme.com" },
              { label: "Contact Phone", key: "contactPhone", placeholder: "+1 555-000-0000" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <input
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full h-8 bg-muted border border-border rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50"
                />
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BizClientStatus }))}
                  className="w-full h-8 bg-muted border border-border rounded-lg px-2.5 text-xs text-foreground outline-none"
                >
                  {BIZ_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{BIZ_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Monthly Value ($)</label>
                <input
                  type="number"
                  value={form.monthlyValue}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyValue: e.target.value }))}
                  placeholder="0"
                  className="w-full h-8 bg-muted border border-border rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Services</label>
              <textarea
                value={form.services}
                onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
                placeholder="e.g. Sales team management, setter training…"
                rows={2}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-orange-500/50"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAdding(false)}
                className="flex-1 h-9 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addClient}
                disabled={!form.name.trim() || saving}
                className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {saving ? "Saving…" : "Add Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
