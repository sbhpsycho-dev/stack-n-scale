"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LiveDot } from "@/components/ui/live-dot";
import {
  type BizClient,
  type BizClientStatus,
  type TeamMember,
  type KpiDef,
  type KpiEntry,
  BIZ_STATUS_LABELS,
  BIZ_STATUS_ORDER,
  BIZ_STATUS_COLORS,
  ROLE_KPI_PRESETS,
} from "@/lib/biz-client-types";
import { cn } from "@/lib/utils";
import {
  Loader2, ArrowLeft, Plus, X, Trash2, ChevronDown, ChevronUp,
  Save, Edit3, Users, TrendingUp,
} from "lucide-react";
import {
  LineChart, Line, Tooltip, ResponsiveContainer, XAxis,
} from "recharts";

const POLL_INTERVAL_MS = 30_000;
const TODAY = new Date().toISOString().slice(0, 10);

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtVal(val: number, unit: KpiDef["unit"]) {
  if (unit === "$") return fmt$(val);
  if (unit === "%") return `${val}%`;
  return String(val);
}

// Sparkline card for a single KPI
function KpiSparkline({ label, unit, entries }: { label: string; unit: KpiDef["unit"]; entries: KpiEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const key = label; // we look up by label — caller passes a single-KPI entry array
  // Build chartData using whichever value key exists
  const chartData = sorted.map((e) => ({
    date: e.date.slice(5), // MM-DD
    value: Object.values(e.values)[0] ?? 0,
  }));

  return (
    <div className="bg-muted/40 rounded-lg p-3 space-y-1">
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-bold">
        {latest ? fmtVal(Object.values(latest.values)[0] ?? 0, unit) : "—"}
      </p>
      {chartData.length > 1 && (
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={chartData}>
            <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={1.5} dot={false} />
            <XAxis dataKey="date" hide />
            <Tooltip
              contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 10, borderRadius: 6 }}
              formatter={(v) => [fmtVal(Number(v), unit), label]}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Member card with KPI logging + sparklines
function MemberCard({
  member,
  clientId,
  onDelete,
  onUpdate,
}: {
  member: TeamMember;
  clientId: string;
  onDelete: (id: string) => void;
  onUpdate: (m: TeamMember) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [kpiEntries, setKpiEntries] = useState<Record<string, KpiEntry[]>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [logValues, setLogValues] = useState<Record<string, string>>({});
  const [logSaving, setLogSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadKpis = useCallback(async () => {
    const memberIds = member.id;
    const res = await fetch(
      `/api/manage-clients/${clientId}/kpi?memberId=${memberIds}&days=7`
    );
    if (res.ok) {
      const entries: KpiEntry[] = await res.json();
      // Group by kpi key — each entry has all kpi values for that date
      setKpiEntries({ [member.id]: entries });
      setLastUpdated(new Date());
    }
  }, [clientId, member.id]);

  useEffect(() => {
    if (member.kpis.length > 0) loadKpis();
    const id = setInterval(() => { if (member.kpis.length > 0) loadKpis(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadKpis, member.kpis.length]);

  async function saveLog() {
    if (Object.keys(logValues).length === 0) return;
    setLogSaving(true);
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(logValues)) {
      if (v !== "") values[k] = parseFloat(v);
    }
    await fetch(`/api/manage-clients/${clientId}/kpi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: member.id, date: TODAY, values }),
    });
    await loadKpis();
    setLogOpen(false);
    setLogValues({});
    setLogSaving(false);
  }

  const memberEntries = kpiEntries[member.id] ?? [];

  // Build per-kpi sparkline data: filter entries to just that kpi's value
  function entriesForKpi(kpi: KpiDef): KpiEntry[] {
    return memberEntries
      .filter((e) => kpi.key in e.values)
      .map((e) => ({ date: e.date, values: { [kpi.key]: e.values[kpi.key] }, updatedAt: e.updatedAt }));
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold">{member.name}</p>
              <Badge className="text-[9px] mt-0.5 bg-muted text-muted-foreground border-border">{member.role}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {lastUpdated && <LiveDot lastUpdated={lastUpdated} />}
            {member.kpis.length > 0 && (
              <button
                onClick={() => { setLogOpen((o) => !o); setLogValues({}); }}
                className="h-7 px-2.5 rounded-lg bg-orange-500/10 text-orange-400 text-[11px] font-medium hover:bg-orange-500/20 transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Log KPIs
              </button>
            )}
            <button
              onClick={() => setExpanded((e) => !e)}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => onDelete(member.id)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* KPI log form */}
        {logOpen && (
          <div className="mb-4 bg-muted/40 rounded-xl p-4 space-y-3 border border-border">
            <p className="text-xs font-semibold text-muted-foreground">Log KPIs for {TODAY}</p>
            <div className="grid grid-cols-2 gap-2">
              {member.kpis.map((kpi) => (
                <div key={kpi.key}>
                  <label className="text-[10px] text-muted-foreground mb-1 block truncate">{kpi.label}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={logValues[kpi.key] ?? ""}
                      onChange={(e) => setLogValues((v) => ({ ...v, [kpi.key]: e.target.value }))}
                      placeholder="0"
                      className="w-full h-7 bg-background border border-border rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      {kpi.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setLogOpen(false)} className="flex-1 h-7 rounded-lg bg-muted text-[11px] hover:bg-muted/80 transition-colors">
                Cancel
              </button>
              <button
                onClick={saveLog}
                disabled={logSaving}
                className="flex-1 h-7 rounded-lg bg-orange-500 text-white text-[11px] font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
              >
                {logSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
          </div>
        )}

        {/* KPI sparklines grid */}
        {expanded && member.kpis.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {member.kpis.map((kpi) => (
              <KpiSparkline
                key={kpi.key}
                label={kpi.label}
                unit={kpi.unit}
                entries={entriesForKpi(kpi)}
              />
            ))}
          </div>
        )}

        {expanded && member.kpis.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No KPIs defined for this member yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManageClientDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [client, setClient] = useState<BizClient | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit client info state
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState<Partial<BizClient>>({});

  // Add member state
  const [addingMember, setAddingMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", role: "" });
  const [memberKpis, setMemberKpis] = useState<KpiDef[]>([]);
  const [savingMember, setSavingMember] = useState(false);

  // Note state
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Portal credentials state
  const [generatingCreds, setGeneratingCreds] = useState(false);
  const [newCreds, setNewCreds] = useState<{ portalUsername: string; plainPassword: string } | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.role !== "admin") router.replace("/login");
  }, [session, status, router]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/manage-clients/${id}`);
    if (res.ok) setClient(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function updateStatus(s: BizClientStatus) {
    await fetch(`/api/manage-clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s }),
    });
    await load();
  }

  async function saveInfo() {
    await fetch(`/api/manage-clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(infoForm),
    });
    setEditingInfo(false);
    await load();
  }

  async function deleteMember(memberId: string) {
    await fetch(`/api/manage-clients/${id}/members/${memberId}`, { method: "DELETE" });
    await load();
  }

  async function addMember() {
    if (!memberForm.name.trim() || !memberForm.role.trim()) return;
    setSavingMember(true);
    await fetch(`/api/manage-clients/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...memberForm, kpis: memberKpis }),
    });
    setAddingMember(false);
    setMemberForm({ name: "", role: "" });
    setMemberKpis([]);
    setSavingMember(false);
    await load();
  }

  async function generateCreds() {
    setGeneratingCreds(true);
    const res = await fetch(`/api/manage-clients/${id}/generate-credentials`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setNewCreds({ portalUsername: data.portalUsername, plainPassword: data.plainPassword });
      await load();
    }
    setGeneratingCreds(false);
  }

  async function saveNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    const existing = client?.notes ?? "";
    const updated = existing
      ? `${existing}\n\n[${new Date().toLocaleString()}]\n${note.trim()}`
      : `[${new Date().toLocaleString()}]\n${note.trim()}`;
    await fetch(`/api/manage-clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: updated }),
    });
    setNote("");
    setSavingNote(false);
    await load();
  }

  function applyRolePreset(role: string) {
    const preset = ROLE_KPI_PRESETS[role] ?? [];
    setMemberKpis(preset);
  }

  function addKpiRow() {
    setMemberKpis((k) => [...k, { key: `kpi_${Date.now()}`, label: "", unit: "%" }]);
  }

  function updateKpiRow(idx: number, patch: Partial<KpiDef>) {
    setMemberKpis((k) => k.map((kpi, i) => i === idx ? { ...kpi, ...patch } : kpi));
  }

  function removeKpiRow(idx: number) {
    setMemberKpis((k) => k.filter((_, i) => i !== idx));
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  if (!client) {
    return <p className="text-sm text-muted-foreground text-center py-16">Client not found.</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link href="/manage-clients" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {client.contactName && `${client.contactName} · `}{client.contactEmail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("text-[10px]", BIZ_STATUS_COLORS[client.status])}>
            {BIZ_STATUS_LABELS[client.status]}
          </Badge>
          <button
            onClick={() => { setInfoForm(client); setEditingInfo(true); }}
            className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Status advancement */}
      <div className="flex flex-wrap gap-2">
        {BIZ_STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => updateStatus(s)}
            className={cn(
              "h-7 px-3 rounded-lg text-xs font-medium border transition-colors",
              client.status === s
                ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                : "bg-muted border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {BIZ_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info card */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2.5">
          <h2 className="text-sm font-semibold">Details</h2>
          {[
            { label: "Contact", value: client.contactName || "—" },
            { label: "Email", value: client.contactEmail || "—" },
            { label: "Phone", value: client.contactPhone || "—" },
            { label: "Monthly Value", value: client.monthlyValue ? fmt$(client.monthlyValue) : "—" },
            { label: "Start Date", value: client.startDate ?? "—" },
            { label: "Services", value: client.services || "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-xs gap-2">
              <span className="text-muted-foreground shrink-0">{label}</span>
              <span className="font-medium text-right break-all">{value}</span>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold">Notes</h2>
          {client.notes ? (
            <pre className="text-xs text-foreground whitespace-pre-wrap font-sans max-h-40 overflow-y-auto leading-relaxed">
              {client.notes}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          )}
          <Separator />
          <div className="flex gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
              rows={2}
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-orange-500/50"
            />
            <button
              onClick={saveNote}
              disabled={!note.trim() || savingNote}
              className="h-8 px-3 self-end rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-1"
            >
              {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Portal Access */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Client Portal Access</h2>
        {client.portalUsername ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Login URL</span>
              <a href="/client-portal/login" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline">
                /client-portal/login
              </a>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Username</span>
              <code className="font-mono bg-muted px-2 py-0.5 rounded text-foreground">{client.portalUsername}</code>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Password</span>
              <span className="text-muted-foreground italic">set (regenerate to get a new one)</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No portal credentials yet. Generate them below to give this client access.</p>
        )}
        <button
          onClick={generateCreds}
          disabled={generatingCreds}
          className="h-8 px-3 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-medium hover:bg-orange-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {generatingCreds ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {client.portalUsername ? "Regenerate Credentials" : "Generate Credentials"}
        </button>
      </div>

      {/* New credentials reveal */}
      {newCreds && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-400">New credentials generated — copy now, password won&apos;t be shown again</p>
            <button onClick={() => setNewCreds(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-1">Username</p>
              <code className="block font-mono bg-background border border-border px-3 py-2 rounded-lg text-foreground">{newCreds.portalUsername}</code>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Password</p>
              <code className="block font-mono bg-background border border-border px-3 py-2 rounded-lg text-foreground">{newCreds.plainPassword}</code>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Share these with the client. They log in at <strong>/client-portal/login</strong>.</p>
        </div>
      )}

      {/* Team Members */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-orange-500" />
            Team Members
            <span className="text-xs font-normal text-muted-foreground">({client.teamMembers?.length ?? 0})</span>
          </h2>
          <button
            onClick={() => setAddingMember(true)}
            className="h-8 px-3 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-medium flex items-center gap-1.5 hover:bg-orange-500/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Member
          </button>
        </div>

        {(client.teamMembers ?? []).length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-xl">
            <Users className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No team members yet. Add one to start tracking KPIs.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {client.teamMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                clientId={id}
                onDelete={deleteMember}
                onUpdate={() => load()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {addingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-background border border-border rounded-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Add Team Member</h2>
              <button onClick={() => setAddingMember(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                <input
                  value={memberForm.name}
                  onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Chona"
                  className="w-full h-8 bg-muted border border-border rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role *</label>
                <input
                  value={memberForm.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    setMemberForm((f) => ({ ...f, role }));
                    if (ROLE_KPI_PRESETS[role]) applyRolePreset(role);
                  }}
                  placeholder="VA, Setter, Sales Director…"
                  list="role-presets"
                  className="w-full h-8 bg-muted border border-border rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50"
                />
                <datalist id="role-presets">
                  {Object.keys(ROLE_KPI_PRESETS).map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>
            </div>

            {/* Role preset buttons */}
            {Object.keys(ROLE_KPI_PRESETS).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(ROLE_KPI_PRESETS).map((role) => (
                  <button
                    key={role}
                    onClick={() => { setMemberForm((f) => ({ ...f, role })); applyRolePreset(role); }}
                    className="h-6 px-2.5 rounded-full text-[10px] font-medium bg-muted border border-border text-muted-foreground hover:text-orange-400 hover:border-orange-500/40 transition-colors"
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}

            {/* KPI rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">KPIs to Track</p>
                <button onClick={addKpiRow} className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-0.5 transition-colors">
                  <Plus className="h-3 w-3" /> Add KPI
                </button>
              </div>
              {memberKpis.map((kpi, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={kpi.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      const key = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                      updateKpiRow(i, { label, key });
                    }}
                    placeholder="KPI label"
                    className="flex-1 h-7 bg-muted border border-border rounded-lg px-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/50"
                  />
                  <select
                    value={kpi.unit}
                    onChange={(e) => updateKpiRow(i, { unit: e.target.value as KpiDef["unit"] })}
                    className="h-7 w-16 bg-muted border border-border rounded-lg px-1.5 text-xs text-foreground outline-none"
                  >
                    <option value="%">%</option>
                    <option value="$">$</option>
                    <option value="number">#</option>
                  </select>
                  <button onClick={() => removeKpiRow(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAddingMember(false)}
                className="flex-1 h-9 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addMember}
                disabled={!memberForm.name.trim() || !memberForm.role.trim() || savingMember}
                className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              >
                {savingMember ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Info Modal */}
      {editingInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-background border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Edit Client Info</h2>
              <button onClick={() => setEditingInfo(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            {[
              { label: "Business Name", key: "name" },
              { label: "Contact Name", key: "contactName" },
              { label: "Contact Email", key: "contactEmail" },
              { label: "Contact Phone", key: "contactPhone" },
              { label: "Start Date", key: "startDate", type: "date" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <input
                  type={type ?? "text"}
                  value={(infoForm[key as keyof BizClient] as string) ?? ""}
                  onChange={(e) => setInfoForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full h-8 bg-muted border border-border rounded-lg px-3 text-xs text-foreground outline-none focus:border-orange-500/50"
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  value={infoForm.status ?? client.status}
                  onChange={(e) => setInfoForm((f) => ({ ...f, status: e.target.value as BizClientStatus }))}
                  className="w-full h-8 bg-muted border border-border rounded-lg px-2.5 text-xs text-foreground outline-none"
                >
                  {BIZ_STATUS_ORDER.map((s) => <option key={s} value={s}>{BIZ_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Monthly Value ($)</label>
                <input
                  type="number"
                  value={infoForm.monthlyValue ?? ""}
                  onChange={(e) => setInfoForm((f) => ({ ...f, monthlyValue: parseFloat(e.target.value) || undefined }))}
                  className="w-full h-8 bg-muted border border-border rounded-lg px-3 text-xs text-foreground outline-none focus:border-orange-500/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Services</label>
              <textarea
                value={infoForm.services ?? ""}
                onChange={(e) => setInfoForm((f) => ({ ...f, services: e.target.value }))}
                rows={2}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-orange-500/50"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingInfo(false)} className="flex-1 h-9 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80 transition-colors">
                Cancel
              </button>
              <button onClick={saveInfo} className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-xs font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
