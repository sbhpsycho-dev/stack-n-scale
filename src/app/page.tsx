"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Edit3, RotateCcw, LogOut, TrendingUp, TrendingDown, Minus, UserPlus, Users, Settings, RefreshCw, CheckCircle2, Circle, Loader2, Pencil, Check, X, Sliders, BookOpen, FileText, Video, Wrench, Layout, Target, Trash2, Plus, ExternalLink, BarChart2, Phone, Calendar, Download, ChevronLeft, FolderOpen } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MetricCard } from "@/components/metric-card";
import { AdsTab } from "@/components/ads-tab";
import Image from "next/image";
import Link from "next/link";
import { EditDataSheet } from "@/components/edit-data-sheet";
import { useSalesData } from "@/hooks/use-sales-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RevenueOverTimeChart, NetByProductChart, NetByProcessorChart, CheckInTrendChart } from "@/components/charts/revenue-chart";
import { PipelineFunnelChart, StageBreakdownChart } from "@/components/charts/funnel-chart";
import { LeadsOverTimeChart, LeadsByCampaignChart, AdSpendSplitChart } from "@/components/charts/ads-charts";
import { CallsPerRepChart, CloseRatePerRepChart, CashPerRepChart } from "@/components/charts/rep-charts";
import { type ClientIntegrations } from "@/lib/integrations";
import { SEED, BLANK, type Rep } from "@/lib/sales-data";
import { SettingsSheet } from "@/components/settings-sheet";
import { type DashboardConfig, DEFAULT_CONFIG, BUSINESS_PRESETS, type BusinessType, type KpiCardKey, KPI_CARD_LABELS, DEFAULT_KPI_VISIBILITY } from "@/lib/dashboard-config";
import { type Resource, type ResourceType } from "@/lib/resources";
import { Switch } from "@/components/ui/switch";
import { type DailyEntry } from "@/app/api/replog/route";
import { type CoachingClient, type CoachingStatus, STATUS_LABELS } from "@/lib/coaching-types";

const tabAnim: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

const ONBOARDING_STAGES: CoachingStatus[] = [
  "payment_received", "id_pending", "id_pending_review",
  "id_verified", "onboarding_form_sent", "onboarding_complete",
  "coach_assigned", "kickoff_booked", "active", "alumni",
];

const STATUS_COLOR: Record<CoachingStatus, string> = {
  payment_received:    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  id_pending:          "bg-orange-500/15 text-orange-400 border-orange-500/30",
  id_pending_review:   "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  id_verified:         "bg-blue-500/15 text-blue-400 border-blue-500/30",
  onboarding_form_sent:"bg-blue-500/15 text-blue-400 border-blue-500/30",
  onboarding_complete: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  coach_assigned:      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  kickoff_booked:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  active:              "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  alumni:              "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const SNS_STAFF = [
  { name: "Callum", role: "Closer" },
  { name: "Tahoe",  role: "Closer" },
  { name: "Naomi",  role: "Closer" },
  { name: "Elias",  role: "Setter" },
  { name: "Ken",    role: "Setter" },
];

function PodiumSlot({ rep, rank, heightClass }: { rep: Rep; rank: number; heightClass: string }) {
  const c = ({
    1: { badge: "bg-yellow-400/20 text-yellow-400", bar: "bg-yellow-400/10 border-yellow-400/30" },
    2: { badge: "bg-zinc-400/20 text-zinc-300",     bar: "bg-zinc-400/10  border-zinc-400/20"   },
    3: { badge: "bg-amber-700/20 text-amber-600",   bar: "bg-amber-700/10 border-amber-700/20"  },
  } as Record<number, { badge: string; bar: string }>)[rank] ?? { badge: "", bar: "" };
  const medal = (["🥇","🥈","🥉"] as const)[rank - 1] ?? "";
  return (
    <div className="flex flex-col items-center gap-1 min-w-[90px]">
      <p className="text-[11px] font-semibold truncate max-w-[90px] text-center">{rep.name.split(" ")[0]}</p>
      <p className="text-sm font-bold text-emerald-400">${rep.cashCollected.toLocaleString()}</p>
      <div className={`w-full ${heightClass} rounded-t-lg border ${c.bar} flex items-center justify-center`}>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>{medal} #{rank}</span>
      </div>
    </div>
  );
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-400">
          Tab error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

function OnboardingTab() {
  type OnboardingFormData = {
    motivation: string; whySNS: string;
    goal30Days: string; goal3Months: string; goal6Months: string; goal1Year: string;
    biggestChallenge: string; successIn90Days: string; additionalNotes?: string;
    submittedAt: string;
  };
  type IdSubmissionData = {
    submittedAt: string; consentGiven: boolean; hasSig: boolean;
    signature: string | null;
    fileIds: { frontId: string; selfieId: string; signatureId: string | null; idFrontUrl: string | null; selfieUrl: string | null; signatureUrl: string | null } | null;
  };
  type PaymentRecord    = { date: string; amount: number; processor: string; offer: string };

  const [students, setStudents] = useState<CoachingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [filterStatus, setFilterStatus] = useState<CoachingStatus | "all">("all");
  const [selected, setSelected] = useState<CoachingClient | null>(null);
  const [formData, setFormData]   = useState<OnboardingFormData | null>(null);
  const [idData, setIdData]       = useState<IdSubmissionData | null>(null);
  const [payments, setPayments]   = useState<PaymentRecord[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setFormData(null); setIdData(null); setPayments([]); setTotalPaid(0); setDetailLoading(true);
    Promise.all([
      fetch(`/api/onboarding/form-response?email=${encodeURIComponent(selected.email)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/onboarding/id-submission?email=${encodeURIComponent(selected.email)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/staff/client-payments?email=${encodeURIComponent(selected.email)}&name=${encodeURIComponent(selected.name ?? "")}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([f, id, pay]: [unknown, unknown, unknown]) => {
      setFormData((f && typeof f === "object") ? f as OnboardingFormData : null);
      setIdData((id && typeof id === "object") ? id as IdSubmissionData : null);
      if (pay && typeof pay === "object" && "totalPaid" in pay) {
        const p = pay as unknown as { totalPaid: number; payments: PaymentRecord[] };
        setTotalPaid(p.totalPaid);
        setPayments(Array.isArray(p.payments) ? p.payments : []);
      }
    }).finally(() => setDetailLoading(false));
  }, [selected]);

  useEffect(() => {
    fetch("/api/staff/students")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data: unknown) => {
        setStudents(Array.isArray(data) ? (data as CoachingClient[]) : []);
      })
      .catch((e: unknown) => setFetchErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const JUNK_NAMES = /^(unknown|test|testing|test client|test user)$/i;
  const realStudents = students.filter(c => c.name && c.name.trim() !== "" && !JUNK_NAMES.test(c.name.trim()));

  const counts = ONBOARDING_STAGES.reduce<Record<string, number>>((acc, s) => ({
    ...acc,
    [s]: realStudents.filter(c => c.status === s).length,
  }), {});

  const filtered = filterStatus === "all"
    ? realStudents
    : realStudents.filter(c => c.status === filterStatus);

  // ── Client profile view ──────────────────────────────────────────────────────
  if (selected) {
    const idBadge: Record<string, string> = {
      pending:   "bg-orange-500/15 text-orange-400 border-orange-500/30",
      submitted: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
      approved:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      rejected:  "bg-red-500/15 text-red-400 border-red-500/30",
    };
    return (
      <motion.div key="profile" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />Back to Client Info
        </button>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-orange-400">{(selected.name ?? "?").charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold">{selected.name ?? "Unknown"}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={`text-[10px] ${STATUS_COLOR[selected.status] ?? "bg-muted text-muted-foreground border-border"}`}>{STATUS_LABELS[selected.status] ?? selected.status}</Badge>
              <p className="text-xs text-muted-foreground">Day {daysSince(selected.createdAt)} enrolled</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-card border-border">
            <CardContent className="px-4 py-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Contact</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-12">Email</span>
                  <span className="font-medium break-all">{selected.email}</span>
                </div>
                {selected.phone && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-12">Phone</span>
                    <span className="font-medium">{selected.phone}</span>
                  </div>
                )}
                {selected.reportedIncome && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-12">Income</span>
                    <span className="font-medium text-emerald-400">${selected.reportedIncome.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="px-4 py-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Onboarding</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">ID Verification</span>
                  <Badge className={`text-[10px] ${idBadge[selected.idVerification] ?? "bg-muted text-muted-foreground border-border"}`}>
                    {selected.idVerification}
                  </Badge>
                </div>
                {selected.coachAssigned && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Coach</span>
                    <span className="font-medium">{selected.coachAssigned}</span>
                  </div>
                )}
                {selected.activeDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Active Since</span>
                    <span className="font-medium">{selected.activeDate.slice(0, 10)}</span>
                  </div>
                )}
                {selected.discordId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Discord</span>
                    <span className="font-medium font-mono text-xs">{selected.discordId}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Payments ── */}
        <Card className="bg-card border-border">
          <CardContent className="px-4 py-4 space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Payments</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Paid</span>
              <span className="text-sm font-bold text-emerald-400">
                {totalPaid > 0 ? `$${totalPaid.toLocaleString()}` : "—"}
              </span>
            </div>
            {payments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-foreground">{p.offer} · {p.processor}</p>
                      <p className="text-[10px] text-muted-foreground">{p.date}</p>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">${p.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {payments.length === 0 && totalPaid === 0 && !detailLoading && (
              <p className="text-xs text-muted-foreground">No payments on record</p>
            )}
          </CardContent>
        </Card>

        {selected.driveFolder && (
          <Card className="bg-card border-border">
            <CardContent className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <FolderOpen className="h-3.5 w-3.5 text-orange-400" />
                <span className="font-medium">Drive Folder</span>
              </div>
              <a href={selected.driveFolder.url} target="_blank" rel="noreferrer"
                className="text-xs text-orange-400 hover:underline flex items-center gap-1">
                Open <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        )}
        {selected.rejectionReason && (
          <Card className="bg-red-500/5 border-red-500/20">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-red-400 font-semibold mb-1">Rejection Reason</p>
              <p className="text-xs text-muted-foreground">{selected.rejectionReason}</p>
            </CardContent>
          </Card>
        )}

        {/* ── ID Verification Details ── */}
        <Card className="bg-card border-border">
          <CardContent className="px-4 py-4 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">ID Verification</p>
            {idData ? (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Submitted</span>
                  <span className="font-medium">{new Date(idData.submittedAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Consent</span>
                  <Badge className={`text-[10px] ${idData.consentGiven ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                    {idData.consentGiven ? "Given" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Signature</span>
                  <span className="font-medium">{idData.hasSig ? "Included" : "Not provided"}</span>
                </div>
                {idData.fileIds && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">ID Photos</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a href={`https://drive.google.com/file/d/${idData.fileIds.frontId}/view`}
                         target="_blank" rel="noreferrer" className="block">
                        {idData.fileIds.idFrontUrl
                          ? <img src={idData.fileIds.idFrontUrl} alt="ID Front" className="w-full rounded-md border border-border object-cover max-h-32" />
                          : <div className="w-full rounded-md border border-border bg-muted/30 flex items-center justify-center h-20 text-xs text-orange-400 gap-1"><ExternalLink className="h-3 w-3"/>ID Front</div>
                        }
                      </a>
                      <a href={`https://drive.google.com/file/d/${idData.fileIds.selfieId}/view`}
                         target="_blank" rel="noreferrer" className="block">
                        {idData.fileIds.selfieUrl
                          ? <img src={idData.fileIds.selfieUrl} alt="Selfie" className="w-full rounded-md border border-border object-cover max-h-32" />
                          : <div className="w-full rounded-md border border-border bg-muted/30 flex items-center justify-center h-20 text-xs text-orange-400 gap-1"><ExternalLink className="h-3 w-3"/>Selfie</div>
                        }
                      </a>
                    </div>
                    {idData.fileIds.signatureId && (
                      <a href={`https://drive.google.com/file/d/${idData.fileIds.signatureId}/view`}
                         target="_blank" rel="noreferrer"
                         className="flex items-center gap-1 text-xs text-orange-400 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Signature File
                      </a>
                    )}
                  </div>
                )}
                {idData.signature && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Signature</p>
                    <div className="bg-white rounded-md p-2 inline-block">
                      <img src={idData.signature} alt="Client signature" className="max-h-16 max-w-full" />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <Badge className={`text-[10px] ${idBadge[selected.idVerification] ?? "bg-muted text-muted-foreground border-border"}`}>
                  {selected.idVerification}
                </Badge>
              </div>
            )}
            {selected.driveFolder?.idVerificationFolderId && (
              <a href={`https://drive.google.com/drive/folders/${selected.driveFolder.idVerificationFolderId}`}
                 target="_blank" rel="noreferrer"
                 className="flex items-center gap-1 text-xs text-orange-400 hover:underline pt-1">
                View ID Documents <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </CardContent>
        </Card>

        {/* ── Onboarding Form Answers ── */}
        {detailLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-orange-500" /></div>
        ) : formData ? (
          <Card className="bg-card border-border">
            <CardContent className="px-4 py-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Onboarding Form · {new Date(formData.submittedAt).toLocaleDateString()}
              </p>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">Goals</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { label: "30 Days",   value: formData.goal30Days   },
                    { label: "3 Months",  value: formData.goal3Months  },
                    { label: "6 Months",  value: formData.goal6Months  },
                    { label: "1 Year",    value: formData.goal1Year    },
                  ] as { label: string; value: string }[]).map(({ label, value }) => (
                    <div key={label} className="bg-background rounded-md p-2.5 border border-border">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-xs text-foreground leading-relaxed">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
              {([
                { label: "Motivation",         value: formData.motivation      },
                { label: "Why Stack N Scale",  value: formData.whySNS          },
                { label: "Biggest Challenge",  value: formData.biggestChallenge },
                { label: "Success in 90 Days", value: formData.successIn90Days  },
                ...(formData.additionalNotes ? [{ label: "Additional Notes", value: formData.additionalNotes }] : []),
              ] as { label: string; value: string }[]).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">{label}</p>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Onboarding Form</p>
              <p className="text-xs text-muted-foreground">No form submitted yet</p>
            </CardContent>
          </Card>
        )}

      </motion.div>
    );
  }

  return (
    <motion.div key="onboarding" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Students & Clients</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {realStudents.length} student{realStudents.length !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      {fetchErr && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-xs text-red-400">
          Failed to load clients: {fetchErr}
        </div>
      )}

      {/* Stage filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterStatus === "all"
              ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
              : "bg-muted border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({students.length})
        </button>
        {ONBOARDING_STAGES.filter(s => (counts[s] ?? 0) > 0 || filterStatus === s).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(prev => prev === s ? "all" : s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterStatus === s
                ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                : "bg-muted border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {STATUS_LABELS[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {/* Client list */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {filterStatus === "all"
                ? "No clients yet."
                : `No clients at ${STATUS_LABELS[filterStatus as CoachingStatus]} stage.`}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...filtered]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map(client => (
                  <button
                    key={client.email}
                    onClick={() => setSelected(client)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-orange-400">
                          {(client.name ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{client.name ?? "Unknown"}</p>
                    </div>
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors rotate-180" />
                  </button>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";
  const isSalesExec = session?.user?.role === "sales_exec";
  const isExecutive = session?.user?.role === "executive";
  const isAdminView = isAdmin || isSalesExec || isExecutive;
  const clientId = isAdminView ? "admin" : (session?.user?.clientId ?? null);

  const { data, update, reset, loading, refresh } = useSalesData(clientId);
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [masterSubTab, setMasterSubTab] = useState<"overview" | "client-info" | "client-managed" | "staff">("overview");
  const [leadwellExpanded, setLeadwellExpanded] = useState(false);
  type LeadwellStats = { cashMTD: number; cashYTD: number; dealsClosed: number; callsMade: number; demosSet: number; demosShowed: number; reps: { name: string; collections: number; sales: number; calls_made: number; sets: number; shows: number }[]; fetchedAt: string };
  const [leadwellData, setLeadwellData] = useState<LeadwellStats | null>(null);
  const [leadwellLoading, setLeadwellLoading] = useState(false);
  const [leadwellError, setLeadwellError] = useState("");
  const [drillStaff, setDrillStaff] = useState<{ name: string; role: string } | null>(null);
  const [drillEntries, setDrillEntries] = useState<DailyEntry[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [kpiSyncing, setKpiSyncing] = useState(false);
  const [kpiSyncMsg, setKpiSyncMsg] = useState("");
  const [lastKpiSynced, setLastKpiSynced] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") { router.replace("/login"); return; }
    if (authStatus === "authenticated" && session?.user?.role === "biz_client") router.replace("/client-portal");
  }, [authStatus, session, router]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setTab(t);
  }, []);

  // Integrations state
  const [integrations, setIntegrations] = useState<ClientIntegrations>({});
  const [syncingSource, setSyncingSource] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [lastSyncedBySource, setLastSyncedBySource] = useState<Record<string, string>>({});

  // Dashboard config (business type + widget visibility)
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then((c) => { if (c && c.businessType) setConfig(c); }).catch(() => {});
  }, []);
  const saveConfig = (next: DashboardConfig) => {
    setConfig(next);
    fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
  };
  const kpiVisible = (key: KpiCardKey) => config.kpiCardVisibility?.[key] ?? DEFAULT_KPI_VISIBILITY[key];
  const [expandedCard, setExpandedCard] = useState<KpiCardKey | null>(null);
  const toggleCard = (key: KpiCardKey) => setExpandedCard(prev => prev === key ? null : key);

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceFilter, setResourceFilter] = useState<ResourceType | "all">("all");
  const [addingResource, setAddingResource] = useState(false);
  const [newResource, setNewResource] = useState({ title: "", description: "", url: "", category: "", type: "sop" as ResourceType });
  useEffect(() => {
    fetch("/api/resources").then(r => r.json()).then((rs) => { if (Array.isArray(rs)) setResources(rs); }).catch(() => {});
  }, []);
  const addResource = async () => {
    if (!newResource.title || !newResource.url) return;
    const res = await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newResource, businessTypes: [] }) });
    const json = await res.json();
    if (json.ok) { setResources(prev => [...prev, json.resource]); setNewResource({ title: "", description: "", url: "", category: "", type: "sop" }); setAddingResource(false); }
  };
  const deleteResource = async (id: string) => {
    await fetch("/api/resources", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setResources(prev => prev.filter(r => r.id !== id));
  };

  // Rep log (My Performance tab)
  const todayStr = new Date().toISOString().slice(0, 10);
  const [replog, setReplog] = useState<DailyEntry[]>([]);
  const [replogEntry, setReplogEntry] = useState<DailyEntry>({ date: todayStr, callsMade: 0, callsAnswered: 0, demosSet: 0, demosShowed: 0, pitched: 0, closed: 0, cashCollected: 0 });
  const [replogSaving, setReplogSaving] = useState(false);
  const [replogSyncError, setReplogSyncError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/replog").then(r => r.json()).then((entries) => {
      if (Array.isArray(entries)) {
        setReplog(entries);
        const todayEntry = entries.find((e: DailyEntry) => e.date === todayStr);
        if (todayEntry) setReplogEntry(todayEntry);
      }
    }).catch(() => {});
  }, [todayStr]);
  const saveReplogEntry = async () => {
    setReplogSaving(true);
    setReplogSyncError(null);
    try {
      const res = await fetch("/api/replog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(replogEntry) });
      const data = await res.json() as { ok: boolean; sheetsSync?: "ok" | "error"; syncError?: string };
      if (data.sheetsSync === "error") {
        setReplogSyncError(`Saved locally — Sheets sync failed: ${data.syncError ?? "unknown error"}`);
      }
    } catch {
      setReplogSyncError("Save failed. Try again.");
    }
    setReplog(prev => prev.some(e => e.date === replogEntry.date) ? prev.map(e => e.date === replogEntry.date ? replogEntry : e) : [replogEntry, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    setReplogSaving(false);
  };
  const deleteReplogEntry = async (date: string) => {
    await fetch("/api/replog", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) }).catch(() => {});
    setReplog(prev => prev.filter(e => e.date !== date));
  };

  // Auto-redirect new clients to setup wizard (only if they haven't completed it)
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (redirectedRef.current || loading || isAdminView || !clientId) return;
    if (data.dashboard.cashCollectedMTD !== SEED.dashboard.cashCollectedMTD ||
        data.dashboard.leadsThisMonth !== SEED.dashboard.leadsThisMonth) return;
    // Check setup completion server-side (not localStorage, which can be spoofed)
    fetch("/api/setup-complete")
      .then((r) => r.json())
      .then((d) => {
        if (!d.done && !redirectedRef.current) {
          redirectedRef.current = true;
          router.push("/setup");
        }
      })
      .catch(() => {});
  }, [loading, data, isAdmin, clientId, router]);

  // Load integrations for client
  useEffect(() => {
    if (isAdminView || !clientId) return;
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d === "object") {
          setIntegrations(d);
          if (d.lastSyncedAt) setLastSynced(d.lastSyncedAt);
        }
      })
      .catch(() => {});
  }, [isAdmin, clientId]);

  async function syncSource(source: string) {
    setSyncingSource(source);
    try {
      await fetch(`/api/sync/${source}`, { method: "POST" });
      const now = new Date().toISOString();
      setLastSynced(now);
      setLastSyncedBySource(prev => ({ ...prev, [source]: now }));
    } finally {
      setSyncingSource(null);
    }
  }

  useEffect(() => {
    if (!leadwellExpanded || !isAdminView) return;
    const fetchLeadwell = () => {
      setLeadwellLoading(prev => leadwellData === null ? true : prev);
      setLeadwellError("");
      fetch("/api/admin/leadwell-stats")
        .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e?.error ?? "Failed")))
        .then((d: LeadwellStats) => { setLeadwellData(d); setLeadwellLoading(false); })
        .catch((e: unknown) => { setLeadwellError(String(e)); setLeadwellLoading(false); });
    };
    fetchLeadwell();
    const id = setInterval(fetchLeadwell, 30_000);
    return () => clearInterval(id);
  }, [leadwellExpanded, isAdminView]);

  async function syncKpiData() {
    setKpiSyncing(true);
    setKpiSyncMsg("");
    try {
      const res  = await fetch("/api/admin/sync-leaderboard", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setKpiSyncMsg("Synced!");
        setLastKpiSynced(new Date().toLocaleString());
        refresh(false);
      } else {
        setKpiSyncMsg("Sync failed");
      }
    } catch {
      setKpiSyncMsg("Sync error");
    } finally {
      setKpiSyncing(false);
      setTimeout(() => setKpiSyncMsg(""), 4000);
    }
  }
  async function backfillDeals() {
    setKpiSyncing(true);
    setKpiSyncMsg("");
    try {
      const res  = await fetch("/api/admin/backfill-deals", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setKpiSyncMsg(`${json.created} deals loaded`);
        refresh(false);
      } else {
        setKpiSyncMsg("Backfill failed");
      }
    } catch {
      setKpiSyncMsg("Backfill error");
    } finally {
      setKpiSyncing(false);
      setTimeout(() => setKpiSyncMsg(""), 6000);
    }
  }

  const { dashboard: d, pipeline: p, ads: a, reps: r, clients = [] } = data;
  // Manage Clients state (admin only)
  const [newClientName, setNewClientName] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [clientSaving, setClientSaving] = useState(false);
  const [clientMsg, setClientMsg] = useState("");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientName, setEditingClientName] = useState("");

  // Manage Staff state (admin only)
  const [staffList, setStaffList] = useState<{ id: string; name: string; createdAt: string; sheetId?: string; role?: string }[]>([]);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<string>("setter");
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffMsg, setStaffMsg] = useState("");
  useEffect(() => {
    if (isAdminView) {
      fetch("/api/admin/staff").then((r) => r.json()).then(setStaffList).catch(() => {});
    }
  }, [isAdminView]);
  const addStaff = useCallback(async () => {
    if (!newStaffName.trim() || !newStaffPassword.trim()) return;
    setStaffSaving(true);
    setStaffMsg("");
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newStaffName.trim(), password: newStaffPassword.trim(), role: newStaffRole }),
    });
    const json = await res.json();
    if (json.ok) {
      setStaffList((prev) => [...prev, json.staff]);
      setStaffMsg(`✓ "${newStaffName.trim()}" added. Password: ${newStaffPassword.trim()}`);
      setNewStaffName("");
      setNewStaffPassword("");
      setNewStaffRole("setter");
    } else {
      setStaffMsg(`✗ ${json.error ?? "Failed to add staff"}`);
    }
    setStaffSaving(false);
  }, [newStaffName, newStaffPassword, newStaffRole]);
  const removeStaff = useCallback(async (id: string) => {
    await fetch("/api/admin/staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setStaffList((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const [seedingSheets, setSeedingSheets] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const seedSheets = useCallback(async () => {
    setSeedingSheets(true); setSeedMsg("");
    try {
      const res  = await fetch("/api/admin/staff/seed-sheets", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setSeedMsg(`✓ ${json.updated.length} sheet${json.updated.length !== 1 ? "s" : ""} linked`);
        // Refresh so sheetId badges update immediately
        fetch("/api/admin/staff").then(r => r.json()).then(setStaffList).catch(() => {});
      } else {
        setSeedMsg("✗ Failed");
      }
    } catch {
      setSeedMsg("✗ Network error");
    } finally {
      setSeedingSheets(false);
      setTimeout(() => setSeedMsg(""), 6000);
    }
  }, []);
  const [editingRepIdx, setEditingRepIdx] = useState<number | null>(null);
  const [editingRepName, setEditingRepName] = useState("");

  // Discord notification test
  type DiscordTestResult = { label: string; envKey: string; hasUrl: boolean; sent: boolean; error?: string };
  const [discordTesting, setDiscordTesting] = useState(false);
  const [discordTestResults, setDiscordTestResults] = useState<{
    channels: DiscordTestResult[];
    boilerRoom: { sent: boolean; error?: string };
    summary: { sent: number; noUrl: number; failed: number; total: number };
  } | null>(null);
  const runDiscordTest = useCallback(async () => {
    setDiscordTesting(true);
    setDiscordTestResults(null);
    try {
      const res  = await fetch("/api/admin/test-discord", { method: "POST" });
      const json = await res.json();
      setDiscordTestResults(json);
    } catch {
      setDiscordTestResults(null);
    }
    setDiscordTesting(false);
  }, []);

  const addClient = useCallback(async () => {
    if (!newClientName.trim() || !newClientPassword.trim()) return;
    setClientSaving(true);
    setClientMsg("");
    const id = newClientName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const newEntry = { id, name: newClientName.trim(), password: newClientPassword.trim() };
    const existing = data.clientRegistry ?? [];
    const updated = existing.some((c) => c.id === id)
      ? existing.map((c) => (c.id === id ? newEntry : c))
      : [...existing, newEntry];
    const newData = { ...data, clientRegistry: updated };
    try {
      // Save full SalesData (includes clientRegistry for backwards compat)
      const dataRes = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newData),
      });
      const dataJson = await dataRes.json();

      // Also write to dedicated sns-registry key so auth can always find clients
      const regRes = await fetch("/api/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const regJson = await regRes.json();

      if (dataJson.persisted && regJson.ok) {
        // Zero-initialize the new client's dashboard so they never see seed/demo data
        await fetch(`/api/data?target=${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(BLANK),
        }).catch(() => {});
        update(newData);
        setClientMsg(`✓ "${newClientName.trim()}" added. Login password: ${newClientPassword.trim()}`);
        setNewClientName("");
        setNewClientPassword("");
      } else {
        setClientMsg("Saved locally only — KV may not be configured. Client login may not work.");
      }
    } catch {
      setClientMsg("Network error — could not save.");
    }
    setClientSaving(false);
  }, [newClientName, newClientPassword, data]);

  const saveRepName = useCallback((idx: number) => {
    const name = editingRepName.trim();
    if (!name) return;
    setEditingRepIdx(null);
    const updated = r.leaderboard.map((rep, j) => j === idx ? { ...rep, name } : rep);
    update({ ...data, reps: { ...r, leaderboard: updated } });
  }, [editingRepName, data, r, update]);

  const saveClientName = useCallback(async (id: string) => {
    const name = editingClientName.trim();
    if (!name) return;
    setEditingClientId(null);
    await fetch("/api/registry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    }).catch(() => {});
    update({ ...data, clientRegistry: (data.clientRegistry ?? []).map((c) => c.id === id ? { ...c, name } : c) });
  }, [editingClientName, data, update]);

  // Revenue trend vs last month
  const trendPct = d.cashCollectedLastMonth > 0
    ? ((d.cashCollectedMTD - d.cashCollectedLastMonth) / d.cashCollectedLastMonth * 100)
    : 0;
  const trendUp = trendPct > 0;
  const trendFlat = trendPct === 0;

  // Goal progress
  const goalPct = Math.min((d.cashCollectedMTD / d.monthlyGoal) * 100, 100);

  // Pace to Goal
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const dailyPace = dayOfMonth > 0 ? d.cashCollectedMTD / dayOfMonth : 0;
  const projected = Math.round(dailyPace * daysInMonth);
  const remaining = Math.max(0, d.monthlyGoal - d.cashCollectedMTD);
  const daysLeft = daysInMonth - dayOfMonth;
  const neededPerDay = daysLeft > 0 ? remaining / daysLeft : 0;

  // Lead response time color
  const leadRespVariant = d.avgLeadResponseTimeMin < 5 ? "green" : d.avgLeadResponseTimeMin <= 60 ? "orange" : "default";

  // Master tab computed values
  const totalCumulativeRevenue = clients.reduce((s, c) => s + c.cumulativeRevenue, 0);
  const totalRevShareOwed = clients.reduce((s, c) => s + c.cashCollectedMTD * (c.revSharePct / 100), 0);
  const paidCount = clients.filter(c => c.revSharePaid).length;
  const pendingCount = clients.length - paidCount;

  if (authStatus === "loading") return null;

  return (
    <div className="min-h-screen bg-background">
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
      )}
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Stack N Scale" width={32} height={32} className="object-contain" />
            <span className="font-bold text-sm tracking-wide">
              {isAdminView ? "Stack N Scale" : (session?.user?.name ?? "Dashboard")}
            </span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
              {isAdmin ? "Admin" : isSalesExec ? "Manager" : "Sales Pipeline"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5">
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => signOut({ callbackUrl: "/login" })}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5">
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted border border-border h-9 mb-6 flex-wrap">
            {config.tabs.dashboard  && <TabsTrigger value="dashboard"    className="text-xs px-4">Dashboard</TabsTrigger>}
            {(isAdminView || session?.user?.role === "staff") && (
              <TabsTrigger value="my-performance" className="text-xs px-4 relative">
                <BarChart2 className="h-3 w-3 mr-1" />My Performance
                {!replog.some(e => e.date === todayStr) && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-orange-500" />
                )}
              </TabsTrigger>
            )}
            {config.tabs.pipeline   && <TabsTrigger value="pipeline"     className="text-xs px-4">Pipeline</TabsTrigger>}
            {config.tabs.ads        && <TabsTrigger value="ads"          className="text-xs px-4">Ads</TabsTrigger>}
            {config.tabs.reps       && <TabsTrigger value="reps"         className="text-xs px-4">Rep Leaderboard</TabsTrigger>}
            {isAdminView && <TabsTrigger value="master"   className="text-xs px-4">Master</TabsTrigger>}
            {isAdmin     && <TabsTrigger value="settings" className="text-xs px-4">Settings</TabsTrigger>}
          </TabsList>

          <AnimatePresence mode="wait">

            {/* ══════════════ DASHBOARD ══════════════ */}
            {tab === "dashboard" && (
              <TabsContent value="dashboard">
                <motion.div key="dashboard" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">

                  {/* Last synced */}
                  {(lastSynced || lastKpiSynced) && (
                    <p className="text-[10px] text-muted-foreground -mt-3">
                      Last synced {lastSynced ? new Date(lastSynced).toLocaleString() : lastKpiSynced}
                    </p>
                  )}

                  {/* Empty state */}
                  {d.cashCollectedMTD === 0 && d.leadsThisMonth === 0 && d.mrr === 0 && !loading && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-orange-400">No data yet</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Connect integrations in Settings to pull live data automatically.</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}
                        className="text-xs h-7 shrink-0 text-orange-400 hover:text-orange-300 border border-orange-500/30">
                        Open Settings
                      </Button>
                    </div>
                  )}

                  {/* Top KPI row — individually togglable + clickable for detail */}
                  {config.widgets.kpiCards && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {kpiVisible("cashCollectedMTD") && (
                          <MetricCard label="Cash Collected MTD" value={d.cashCollectedMTD} prefix="$" variant="green" index={0}
                            hint={trendFlat ? "vs last month" : `${trendUp ? "+" : ""}${trendPct.toFixed(1)}% vs last month`}
                            onClick={() => toggleCard("cashCollectedMTD")} selected={expandedCard === "cashCollectedMTD"} />
                        )}
                        {kpiVisible("netRevenueMTD") && (
                          <MetricCard label="Net Revenue MTD" value={d.netRevenueMTD} prefix="$" variant="orange" index={1}
                            onClick={() => toggleCard("netRevenueMTD")} selected={expandedCard === "netRevenueMTD"} />
                        )}
                        {kpiVisible("leadsThisMonth") && (
                          <MetricCard label="Leads This Month" value={d.leadsThisMonth} variant="default" index={2}
                            onClick={() => toggleCard("leadsThisMonth")} selected={expandedCard === "leadsThisMonth"} />
                        )}
                        {kpiVisible("totalDealsClosedMTD") && (
                          <MetricCard label="Total Deals Closed" value={d.totalDealsClosedMTD} variant="orange" index={3}
                            onClick={() => toggleCard("totalDealsClosedMTD")} selected={expandedCard === "totalDealsClosedMTD"} />
                        )}
                        {kpiVisible("costPerClose") && (
                          <MetricCard label="Cost Per Close" value={d.costPerClose} prefix="$" variant="default" index={4}
                            onClick={() => toggleCard("costPerClose")} selected={expandedCard === "costPerClose"} />
                        )}
                        {kpiVisible("mrr") && (
                          <MetricCard label="MRR" value={d.mrr} prefix="$" variant="black" index={5}
                            onClick={() => toggleCard("mrr")} selected={expandedCard === "mrr"} />
                        )}
                        {isAdmin && (
                          <MetricCard label="Cash Collected YTD" value={d.cashCollectedYTD ?? 0} prefix="$" variant="green" index={6} />
                        )}
                      </div>

                      {/* Expandable detail panels for top row */}
                      <AnimatePresence>
                        {expandedCard && ["cashCollectedMTD","netRevenueMTD","leadsThisMonth","totalDealsClosedMTD","costPerClose","mrr"].includes(expandedCard) && (
                          <motion.div key={`detail-${expandedCard}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                            <Card className="bg-muted/40 border-orange-500/20">
                              <CardContent className="px-4 py-4">
                                {expandedCard === "cashCollectedMTD" && (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-orange-400">Cash Collected MTD — Revenue Trend</p>
                                    <div className="grid grid-cols-3 gap-3 text-center text-xs mb-3">
                                      <div><p className="text-muted-foreground">This Month</p><p className="font-bold text-foreground">${d.cashCollectedMTD.toLocaleString()}</p></div>
                                      <div><p className="text-muted-foreground">Last Month</p><p className="font-bold text-foreground">${d.cashCollectedLastMonth.toLocaleString()}</p></div>
                                      <div><p className="text-muted-foreground">Change</p><p className={`font-bold ${trendUp ? "text-emerald-400" : trendFlat ? "text-muted-foreground" : "text-red-400"}`}>{trendUp ? "+" : ""}{trendPct.toFixed(1)}%</p></div>
                                    </div>
                                    <RevenueOverTimeChart data={d.revenueOverTime} />
                                  </div>
                                )}
                                {expandedCard === "netRevenueMTD" && (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-orange-400">Net Revenue — By Product & Processor</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">By Product</p><NetByProductChart data={d.netByProduct} /></div>
                                      <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">By Processor</p><NetByProcessorChart data={d.netByProcessor} /></div>
                                    </div>
                                  </div>
                                )}
                                {expandedCard === "leadsThisMonth" && (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-orange-400">Leads — Campaign Breakdown</p>
                                    <LeadsByCampaignChart data={a.leadsByCampaign} />
                                  </div>
                                )}
                                {expandedCard === "totalDealsClosedMTD" && (
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-orange-400">Deals Closed — Pipeline Stage Breakdown</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-center text-xs">
                                      <div><p className="text-muted-foreground">Close Rate</p><p className="font-bold text-emerald-400">{p.closeRate.toFixed(1)}%</p></div>
                                      <div><p className="text-muted-foreground">Demo→Close</p><p className="font-bold text-foreground">{p.demoToClose.toFixed(1)}%</p></div>
                                      <div><p className="text-muted-foreground">Pitched</p><p className="font-bold text-foreground">{p.pitched}</p></div>
                                      <div><p className="text-muted-foreground">Closed</p><p className="font-bold text-orange-400">{p.closed}</p></div>
                                    </div>
                                    <StageBreakdownChart data={p.stageBreakdown} />
                                  </div>
                                )}
                                {expandedCard === "costPerClose" && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold text-orange-400">Cost Per Close — Calculation</p>
                                    <div className="grid grid-cols-3 gap-3 text-center text-xs">
                                      <div><p className="text-muted-foreground">Ad Spend</p><p className="font-bold text-foreground">${a.totalAdSpend.toLocaleString()}</p></div>
                                      <div><p className="text-muted-foreground text-lg">÷</p></div>
                                      <div><p className="text-muted-foreground">Deals Closed</p><p className="font-bold text-foreground">{d.totalDealsClosedMTD}</p></div>
                                    </div>
                                    <div className="text-center pt-2">
                                      <p className="text-[10px] text-muted-foreground">= Cost Per Close</p>
                                      <p className="text-2xl font-bold text-orange-400">${d.costPerClose.toLocaleString()}</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">Lower is better. Industry benchmark: $50–$150 for coaching.</p>
                                    </div>
                                  </div>
                                )}
                                {expandedCard === "mrr" && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-semibold text-orange-400">Monthly Recurring Revenue</p>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                      <div><p className="text-muted-foreground">MRR</p><p className="font-bold text-foreground text-xl">${d.mrr.toLocaleString()}</p></div>
                                      <div><p className="text-muted-foreground">ARR (projected)</p><p className="font-bold text-foreground text-xl">${(d.mrr * 12).toLocaleString()}</p></div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Pulled from active Stripe subscriptions. Syncs when you hit Sync → Stripe.</p>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {kpiVisible("totalRefund") && (
                          <MetricCard label="Total Refund MTD" value={d.totalRefund} prefix="$" variant="orange" index={6}
                            onClick={() => toggleCard("totalRefund")} selected={expandedCard === "totalRefund"} />
                        )}
                        {kpiVisible("totalRefundPct") && (
                          <MetricCard label="Total Refund %" value={d.totalRefundPct} suffix="%" variant="green" index={7} decimals={2}
                            onClick={() => toggleCard("totalRefundPct")} selected={expandedCard === "totalRefundPct"} />
                        )}
                        {kpiVisible("avgLeadResponse") && (
                          <MetricCard label="Avg Lead Response" value={d.avgLeadResponseTimeMin} suffix=" min" variant={leadRespVariant} index={8} decimals={1}
                            hint={d.avgLeadResponseTimeMin < 5 ? "Excellent" : d.avgLeadResponseTimeMin <= 60 ? "Acceptable" : "Needs improvement"}
                            onClick={() => toggleCard("avgLeadResponse")} selected={expandedCard === "avgLeadResponse"} />
                        )}
                      </div>

                      {/* Expandable detail for bottom row */}
                      <AnimatePresence>
                        {expandedCard && ["totalRefund","totalRefundPct","avgLeadResponse"].includes(expandedCard) && (
                          <motion.div key={`detail-bottom-${expandedCard}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                            <Card className="bg-muted/40 border-orange-500/20">
                              <CardContent className="px-4 py-4 text-xs space-y-2">
                                {expandedCard === "totalRefund" && (
                                  <>
                                    <p className="font-semibold text-orange-400">Total Refunds MTD</p>
                                    <div className="grid grid-cols-3 gap-3 text-center">
                                      <div><p className="text-muted-foreground">Refunded</p><p className="font-bold text-foreground">${d.totalRefund.toLocaleString()}</p></div>
                                      <div><p className="text-muted-foreground">Refund Rate</p><p className="font-bold text-foreground">{(d.totalRefundPct * 100).toFixed(2)}%</p></div>
                                      <div><p className="text-muted-foreground">Net Revenue</p><p className="font-bold text-foreground">${d.netRevenueMTD.toLocaleString()}</p></div>
                                    </div>
                                    <p className="text-muted-foreground">Healthy refund rate: below 5%. Above 10% indicates fulfillment or expectation issues.</p>
                                  </>
                                )}
                                {expandedCard === "totalRefundPct" && (
                                  <>
                                    <p className="font-semibold text-orange-400">Refund % Breakdown</p>
                                    <p className="text-muted-foreground">Refund % = Total Refunded ÷ Cash Collected MTD. Currently: ${d.totalRefund.toLocaleString()} ÷ ${d.cashCollectedMTD.toLocaleString()} = {(d.totalRefundPct * 100).toFixed(2)}%</p>
                                    <p className="text-muted-foreground">Target: keep below 5%.</p>
                                  </>
                                )}
                                {expandedCard === "avgLeadResponse" && (
                                  <>
                                    <p className="font-semibold text-orange-400">Lead Response Time</p>
                                    <p className="text-muted-foreground">Current: {d.avgLeadResponseTimeMin.toFixed(1)} minutes avg response time.</p>
                                    <div className="grid grid-cols-3 gap-2 text-center mt-1">
                                      <div className={`rounded-lg p-2 ${d.avgLeadResponseTimeMin < 5 ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}><p className="font-bold">&lt;5 min</p><p>Excellent</p></div>
                                      <div className={`rounded-lg p-2 ${d.avgLeadResponseTimeMin >= 5 && d.avgLeadResponseTimeMin <= 60 ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground"}`}><p className="font-bold">5–60 min</p><p>Acceptable</p></div>
                                      <div className={`rounded-lg p-2 ${d.avgLeadResponseTimeMin > 60 ? "bg-red-500/20 text-red-400" : "bg-muted text-muted-foreground"}`}><p className="font-bold">&gt;60 min</p><p>Too slow</p></div>
                                    </div>
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {/* Monthly Goal Progress */}
                  {config.widgets.monthlyGoal && (
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold">Monthly Goal Progress</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        <div className="flex items-end justify-between">
                          <span className="text-2xl font-bold text-foreground">
                            ${d.cashCollectedMTD.toLocaleString()}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            of ${d.monthlyGoal.toLocaleString()} goal
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                          <div
                            className="h-full bg-orange-500 rounded-full transition-all duration-700"
                            style={{ width: `${goalPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{goalPct.toFixed(1)}% complete</span>
                          <span>${(d.monthlyGoal - d.cashCollectedMTD).toLocaleString()} remaining</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pace to Goal */}
                  {config.widgets.paceToGoal && d.monthlyGoal > 0 && (
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Target className="h-4 w-4 text-orange-400" />
                          Pace to Goal
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily Pace</p>
                            <p className="text-xl font-bold text-foreground">${Math.round(dailyPace).toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">avg/day so far</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Projected</p>
                            <p className={`text-xl font-bold ${projected >= d.monthlyGoal ? "text-emerald-400" : "text-orange-400"}`}>${projected.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">month-end est.</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Remaining</p>
                            <p className="text-xl font-bold text-foreground">${remaining.toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">to hit goal</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Need / Day</p>
                            <p className={`text-xl font-bold ${neededPerDay <= dailyPace ? "text-emerald-400" : "text-red-400"}`}>${Math.round(neededPerDay).toLocaleString()}</p>
                            <p className="text-[10px] text-muted-foreground">{daysLeft}d left</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Sales Team Snapshot */}
                  {isAdminView && r.leaderboard.length > 0 && (
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Users className="h-4 w-4 text-orange-400" />
                          Sales Team
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Cash</p>
                            <p className="text-xl font-bold text-emerald-400">
                              ${r.leaderboard.reduce((s, rep) => s + rep.cashCollected, 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Calls</p>
                            <p className="text-xl font-bold text-foreground">
                              {r.leaderboard.reduce((s, rep) => s + rep.callsMade, 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Closed</p>
                            <p className="text-xl font-bold text-orange-400">
                              {r.leaderboard.reduce((s, rep) => s + rep.dealsClosed, 0)}
                            </p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Avg Close Rate</p>
                            <p className="text-xl font-bold text-foreground">
                              {r.leaderboard.length > 0
                                ? (() => {
                                    const totalShowed  = r.leaderboard.reduce((s, rep) => s + rep.demosShowed, 0);
                                    const totalClosed  = r.leaderboard.reduce((s, rep) => s + rep.dealsClosed, 0);
                                    return totalShowed > 0 ? `${((totalClosed / totalShowed) * 100).toFixed(1)}%` : "—";
                                  })()
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-1.5">
                          {r.leaderboard.map((rep, i) => (
                            <div key={i} className="flex items-center gap-3 text-xs">
                              <span className="text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>
                              <span className="font-medium text-foreground flex-1 truncate">{rep.name}</span>
                              <span className="text-muted-foreground">{rep.callsMade} calls</span>
                              <span className="text-muted-foreground">{rep.dealsClosed} closed</span>
                              <span className="text-emerald-400 font-semibold w-20 text-right">${rep.cashCollected.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Reactivation Campaign */}
                  {config.widgets.reactivation && (
                    <ChartCard title="Reactivation Campaign">
                      <div className="grid grid-cols-4 gap-4 py-2">
                        {[
                          { label: "Contacted", value: d.reactivation.contacted, color: "text-muted-foreground" },
                          { label: "Replied",   value: d.reactivation.replied,   color: "text-blue-400" },
                          { label: "Booked",    value: d.reactivation.booked,    color: "text-orange-400" },
                          { label: "Closed",    value: d.reactivation.closed,    color: "text-emerald-400" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="text-center space-y-1">
                            <div className={`text-2xl font-bold ${color}`}>{value}</div>
                            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
                          </div>
                        ))}
                      </div>
                    </ChartCard>
                  )}

                  {config.widgets.revenueChart && (
                    <ChartCard title="Revenue Over Time">
                      <RevenueOverTimeChart data={d.revenueOverTime} />
                    </ChartCard>
                  )}

                  {(config.widgets.netByProduct || config.widgets.netByProcessor) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {config.widgets.netByProduct && (
                        <ChartCard title="Net Amount by Product / Offer">
                          <NetByProductChart data={d.netByProduct} />
                        </ChartCard>
                      )}
                      {config.widgets.netByProcessor && (
                        <ChartCard title="Net Amount by Processor">
                          <NetByProcessorChart data={d.netByProcessor} />
                        </ChartCard>
                      )}
                    </div>
                  )}

                  {config.widgets.checkInScores && (
                    <ChartCard title="Client Pulse (Check-In Scores)">
                      <CheckInTrendChart data={d.checkInScores} />
                    </ChartCard>
                  )}

                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ PIPELINE ══════════════ */}
            {tab === "pipeline" && config.tabs.pipeline && (
              <TabsContent value="pipeline">
                <motion.div key="pipeline" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
                  {config.widgets.callMetrics && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MetricCard label="Calls Made"     value={p.callsMade}     variant="default" index={0} />
                        <MetricCard label="Calls Answered" value={p.callsAnswered} variant="default" index={1} />
                        <MetricCard label="Demos Set"      value={p.demosSet}      variant="default" index={2} />
                        <MetricCard label="Demos Showed"   value={p.demosShowed}   variant="default" index={3} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MetricCard label="Answer Rate %"  value={p.answerRate}  suffix="%" variant="green"   index={4} decimals={2} />
                        <MetricCard label="Show Rate %"    value={p.showRate}    suffix="%" variant="orange"  index={5} decimals={2} />
                        <MetricCard label="Pitched"        value={p.pitched}                variant="default" index={6} />
                        <MetricCard label="Closed"         value={p.closed}                 variant="orange"  index={7} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <MetricCard label="Close Rate %"    value={p.closeRate}   suffix="%" variant="green" index={8} decimals={2} />
                        <MetricCard label="Demo to Close %" value={p.demoToClose} suffix="%" variant="green" index={9} decimals={2} />
                      </div>
                    </>
                  )}
                  {config.widgets.funnelChart && (
                    <ChartCard title="Full Pipeline Funnel">
                      <PipelineFunnelChart data={p.funnelByWeek} />
                    </ChartCard>
                  )}
                  {config.widgets.stageBreakdown && (
                    <ChartCard title="Record Count by Pipeline Stage">
                      <StageBreakdownChart data={p.stageBreakdown} />
                    </ChartCard>
                  )}
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ ADS ══════════════ */}
            {tab === "ads" && config.tabs.ads && (
              <TabsContent value="ads">
                <AdsTab />
              </TabsContent>
            )}

            {/* ══════════════ REP LEADERBOARD ══════════════ */}
            {tab === "reps" && config.tabs.reps && (
              <TabsContent value="reps">
                <motion.div key="reps" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
                  {config.widgets.leaderboard && (
                    <>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">Weekly Snapshot</p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <MetricCard label="Cash Collected" value={r.cashCollectedWeek}              variant="orange"  index={0} />
                          <MetricCard label="Deal Close"     value={r.dealClose}          decimals={1} variant="default" index={1} />
                          <MetricCard label="Calls Made"     value={r.callsMadeWeek}                  variant="orange"  index={2} />
                          <MetricCard label="Rate Of"        value={r.rateOf}             decimals={1} variant="default" index={3} />
                          <MetricCard label="Close Rate %"   value={r.closeRateWeek}      suffix="%"   variant="orange"  index={4} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MetricCard label="Top Rep (Cash)" value={r.topRepCash}   prefix="$" variant="default" index={5} />
                        <MetricCard label="Show Rate %"    value={r.showRatePct}  suffix="%"  variant="orange"  index={6} />
                        <MetricCard label="Close Rate %"   value={r.closeRatePct} suffix="%"  variant="green"   index={7} />
                      </div>
                      {r.leaderboard.length >= 1 && (
                        <div className="flex items-end justify-center gap-4 pt-2 pb-1">
                          {r.leaderboard[1] && <PodiumSlot rep={r.leaderboard[1]} rank={2} heightClass="h-20" />}
                          <PodiumSlot rep={r.leaderboard[0]} rank={1} heightClass="h-28" />
                          {r.leaderboard[2] && <PodiumSlot rep={r.leaderboard[2]} rank={3} heightClass="h-16" />}
                        </div>
                      )}
                      <ChartCard title="Rep Leaderboard">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[560px]">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                                {["#", "Rep", "Calls", "Answered", "Demos Set", "Showed", "Pitched", "Closed", "Cash"].map((h) => (
                                  <th key={h} className="pb-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {r.leaderboard.map((rep, i) => (
                                <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors">
                                  <td className="py-2.5 pr-3 text-muted-foreground">{i + 1}</td>
                                  <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">
                                    {editingRepIdx === i ? (
                                      <div className="flex items-center gap-1">
                                        <Input autoFocus value={editingRepName}
                                          onChange={e => setEditingRepName(e.target.value)}
                                          className="h-6 text-xs w-28 bg-muted border-orange-500/40"
                                          onKeyDown={e => { if (e.key === "Enter") saveRepName(i); if (e.key === "Escape") setEditingRepIdx(null); }} />
                                        <Button size="icon" variant="ghost" className="h-5 w-5 text-emerald-400" onClick={() => saveRepName(i)}><Check className="h-3 w-3" /></Button>
                                        <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground" onClick={() => setEditingRepIdx(null)}><X className="h-3 w-3" /></Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span>{rep.name}</span>
                                        <Button size="icon" variant="ghost"
                                          className="h-5 w-5 opacity-60 hover:opacity-100 transition-opacity text-muted-foreground hover:text-orange-400"
                                          onClick={() => { setEditingRepIdx(i); setEditingRepName(rep.name); }}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{rep.callsMade}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{rep.callsAnswered}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{rep.demosSet}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{rep.demosShowed}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{rep.pitched}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{rep.dealsClosed}</td>
                                  <td className="py-2.5">
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                      ${rep.cashCollected.toLocaleString()}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </ChartCard>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <MetricCard label="Total Cash Collected"
                          value={r.leaderboard.reduce((s, rep) => s + rep.cashCollected, 0)}
                          prefix="$" variant="green" index={8} />
                        <MetricCard label="Avg Deal Size" value={r.avgDealSize} prefix="$" variant="default" index={9} />
                      </div>
                    </>
                  )}

                  {config.widgets.repCharts && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <ChartCard title="Calls Per Rep">
                        <CallsPerRepChart data={r.leaderboard} />
                      </ChartCard>
                      <ChartCard title="Close Rate % Per Rep">
                        <CloseRatePerRepChart data={r.leaderboard} />
                      </ChartCard>
                      <ChartCard title="Cash Collected Per Rep">
                        <CashPerRepChart data={r.leaderboard} />
                      </ChartCard>
                    </div>
                  )}
                </motion.div>
              </TabsContent>
            )}



            {/* ══════════════ MY PERFORMANCE ══════════════ */}
            {tab === "my-performance" && (isAdmin || session?.user?.role === "staff") && (
              <TabsContent value="my-performance">
                <motion.div key="my-performance" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5 max-w-3xl">
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2"><BarChart2 className="h-4 w-4 text-orange-400" />My Performance</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Log your daily numbers and track your personal stats over time.</p>
                  </div>

                  {/* Weekly check-in CTA */}
                  <Card className="bg-card border-orange-500/20">
                    <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Weekly Check-In</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Takes 3–5 min. Reflect on your week and share it with your coach.</p>
                      </div>
                      <Link href="/checkin">
                        <Button size="sm" className="h-8 text-xs shrink-0 bg-orange-500 hover:bg-orange-600 text-white">
                          Submit Check-In →
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>

                  {/* Daily entry form */}
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-orange-400" />
                        Log Today&apos;s Numbers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider shrink-0">Date</Label>
                        <Input type="date" value={replogEntry.date}
                          onChange={e => setReplogEntry(p => ({ ...p, date: e.target.value }))}
                          className="h-7 text-xs bg-muted border-border w-36" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                          ["callsMade",     "Calls Made"],
                          ["callsAnswered", "Calls Answered"],
                          ["demosSet",      "Demos Set"],
                          ["demosShowed",   "Demos Showed"],
                          ["pitched",       "Pitched"],
                          ["closed",        "Closed"],
                          ["cashCollected", "Cash Collected ($)"],
                        ] as [keyof DailyEntry, string][]).filter(([k]) => k !== "date").map(([key, label]) => (
                          <div key={key} className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</Label>
                            <Input type="number" min={0} value={replogEntry[key] as number}
                              onChange={e => setReplogEntry(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                              className="h-8 text-sm bg-muted border-border" />
                          </div>
                        ))}
                      </div>
                      <Button size="sm" onClick={saveReplogEntry} disabled={replogSaving}
                        className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1.5">
                        {replogSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {replogSaving ? "Saving…" : "Save Entry"}
                      </Button>
                      {replogSyncError && (
                        <p className="text-xs text-amber-400 mt-2">{replogSyncError}</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Running totals */}
                  {replog.length > 0 && (() => {
                    const totals = replog.reduce((acc, e) => ({
                      callsMade:     acc.callsMade     + e.callsMade,
                      callsAnswered: acc.callsAnswered + e.callsAnswered,
                      demosSet:      acc.demosSet      + e.demosSet,
                      demosShowed:   acc.demosShowed   + e.demosShowed,
                      pitched:       acc.pitched       + e.pitched,
                      closed:        acc.closed        + e.closed,
                      cashCollected: acc.cashCollected + e.cashCollected,
                    }), { callsMade: 0, callsAnswered: 0, demosSet: 0, demosShowed: 0, pitched: 0, closed: 0, cashCollected: 0 });
                    const answerRate = totals.callsMade > 0 ? ((totals.callsAnswered / totals.callsMade) * 100).toFixed(1) : "0";
                    const closeRate  = totals.demosShowed > 0 ? ((totals.closed / totals.demosShowed) * 100).toFixed(1) : "0";
                    return (
                      <Card className="bg-orange-500/5 border-orange-500/20">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Phone className="h-4 w-4 text-orange-400" />
                            All-Time Totals ({replog.length} {replog.length === 1 ? "day" : "days"} logged)
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <MetricCard label="Calls Made"     value={totals.callsMade}     variant="default" index={0} />
                            <MetricCard label="Calls Answered" value={totals.callsAnswered} variant="default" index={1} />
                            <MetricCard label="Answer Rate"    value={parseFloat(answerRate)} suffix="%" variant="orange" index={2} decimals={1} />
                            <MetricCard label="Demos Set"      value={totals.demosSet}      variant="default" index={3} />
                            <MetricCard label="Demos Showed"   value={totals.demosShowed}   variant="default" index={4} />
                            <MetricCard label="Pitched"        value={totals.pitched}       variant="default" index={5} />
                            <MetricCard label="Closed"         value={totals.closed}        variant="orange"  index={6} />
                            <MetricCard label="Close Rate"     value={parseFloat(closeRate)} suffix="%" variant="green" index={7} decimals={1} />
                          </div>
                          <div className="mt-3">
                            <MetricCard label="Total Cash Collected" value={totals.cashCollected} prefix="$" variant="green" index={8} />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* History log */}
                  {replog.length > 0 && (
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold">Entry History</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[600px]">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                                {["Date", "Calls", "Answered", "Set", "Showed", "Pitched", "Closed", "Cash", ""].map(h => (
                                  <th key={h} className="pb-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {replog.map((entry) => (
                                <tr key={entry.date} className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors group">
                                  <td className="py-2.5 pr-3 font-medium whitespace-nowrap text-orange-400">
                                    {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{entry.callsMade}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{entry.callsAnswered}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{entry.demosSet}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{entry.demosShowed}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{entry.pitched}</td>
                                  <td className="py-2.5 pr-3 text-muted-foreground">{entry.closed}</td>
                                  <td className="py-2.5 pr-3">
                                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                      ${entry.cashCollected.toLocaleString()}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5">
                                    <Button size="icon" variant="ghost"
                                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                                      onClick={() => deleteReplogEntry(entry.date)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {replog.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      No entries yet. Log your first day above to start tracking.
                    </div>
                  )}
                </motion.div>
              </TabsContent>
            )}


            {/* ══════════════ MASTER OVERVIEW ══════════════ */}
            {tab === "master" && (
              <TabsContent value="master">
                <motion.div key="master" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">

                  {/* Sub-navigation */}
                  <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit border border-border">
                    {(["overview", "client-info", ...(isAdmin || isSalesExec ? (["client-managed"] as const) : []), "staff"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setMasterSubTab(v)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          masterSubTab === v
                            ? "bg-background text-foreground shadow-sm border border-border"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {v === "overview" ? "Overview" : v === "client-info" ? "Client Info" : v === "client-managed" ? "Client Managed" : "Staff Views"}
                      </button>
                    ))}
                  </div>

                  {/* ── Overview ── */}
                  {masterSubTab === "overview" && (
                    <div className="space-y-5">
                      {/* Cumulative Revenue Banner */}
                      <Card className="bg-orange-500/5 border-orange-500/20">
                        <CardContent className="px-6 py-5 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold mb-1">
                              Total Revenue Generated Across All Clients
                            </p>
                            <p className="text-3xl font-bold text-foreground">
                              ${totalCumulativeRevenue.toLocaleString()}
                            </p>
                          </div>
                          <TrendingUp className="h-10 w-10 text-orange-500/40" />
                        </CardContent>
                      </Card>

                      {/* Rev Share Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MetricCard label="Rev Share Owed (MTD)" value={totalRevShareOwed} prefix="$" variant="orange" index={0} />
                        <MetricCard label="Clients Paid"         value={paidCount}                     variant="green"  index={1} />
                        <MetricCard label="Clients Pending"      value={pendingCount}                   variant="default" index={2} />
                      </div>

                      {/* Client Dashboards */}
                      <Card className="bg-card border-border">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4 text-orange-400" />
                            Client Dashboards
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          {(data.clientRegistry ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No clients added yet.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {(data.clientRegistry ?? []).map((c) => (
                                editingClientId === c.id ? (
                                  <div key={c.id} className="flex items-center gap-1">
                                    <Input
                                      autoFocus
                                      value={editingClientName}
                                      onChange={(e) => setEditingClientName(e.target.value)}
                                      className="h-7 text-xs w-36 bg-muted border-orange-500/40"
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveClientName(c.id);
                                        if (e.key === "Escape") setEditingClientId(null);
                                      }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-400" onClick={() => saveClientName(c.id)}><Check className="h-3 w-3" /></Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setEditingClientId(null)}><X className="h-3 w-3" /></Button>
                                  </div>
                                ) : (
                                  <div key={c.id} className="flex items-center gap-1">
                                    <Link href={`/admin/client/${c.id}`}>
                                      <Badge className="cursor-pointer px-3 py-1.5 text-xs bg-muted hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/30 border border-border transition-colors">
                                        {c.name}
                                      </Badge>
                                    </Link>
                                    {isAdmin && (
                                      <Button
                                        size="icon" variant="ghost"
                                        className="h-5 w-5 opacity-60 hover:opacity-100 transition-opacity text-muted-foreground hover:text-orange-400"
                                        onClick={() => { setEditingClientId(c.id); setEditingClientName(c.name); }}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Add Client — admin only */}
                      {isAdmin && <Card className="bg-card border-border">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-orange-400" />
                            Manage Client Access
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Client Name</Label>
                              <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="e.g. Alpha Coaching" className="h-8 text-sm bg-muted border-border" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Login Password</Label>
                              <Input value={newClientPassword} onChange={(e) => setNewClientPassword(e.target.value)} placeholder="e.g. alpha2026" className="h-8 text-sm bg-muted border-border" />
                            </div>
                            <Button size="sm" disabled={clientSaving || !newClientName.trim() || !newClientPassword.trim()} onClick={addClient} className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs">
                              {clientSaving ? "Saving…" : "Add Client"}
                            </Button>
                          </div>
                          {clientMsg && <p className="text-xs text-emerald-400 mt-3">{clientMsg}</p>}
                        </CardContent>
                      </Card>}

                      {/* Manage Staff */}
                      <Card className="bg-card border-border">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <Users className="h-4 w-4 text-orange-400" />
                              Staff Access
                            </CardTitle>
                            {isAdmin && staffList.length > 0 && (
                              <div className="flex items-center gap-2">
                                {seedMsg && <span className={`text-xs ${seedMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{seedMsg}</span>}
                                <Button size="sm" variant="outline" disabled={seedingSheets} onClick={seedSheets} className="h-7 text-xs gap-1.5 border-border">
                                  {seedingSheets ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                  Link Sheets
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-4">
                          {staffList.length > 0 && (
                            <div className="space-y-1.5">
                              {staffList.map((s) => (
                                <div key={s.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-medium truncate">{s.name}</span>
                                    {s.role === "sales_exec" && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium shrink-0">Manager</span>
                                    )}
                                    {s.sheetId
                                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium shrink-0">Sheet ✓</span>
                                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-500/15 text-zinc-400 font-medium shrink-0">No sheet</span>
                                    }
                                  </div>
                                  {isAdmin && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-400 transition-colors" onClick={() => removeStaff(s.id)}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {isAdmin && (
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                              <div className="flex flex-col gap-1.5">
                                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Staff Name</Label>
                                <Input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="e.g. Kian Williams" className="h-8 text-sm bg-muted border-border" />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Initial Password</Label>
                                <Input value={newStaffPassword} onChange={(e) => setNewStaffPassword(e.target.value)} placeholder="e.g. staff2026" className="h-8 text-sm bg-muted border-border" />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Role</Label>
                                <select
                                  value={newStaffRole}
                                  onChange={(e) => setNewStaffRole(e.target.value)}
                                  className="h-8 text-sm bg-muted border border-border rounded-md px-2 text-foreground"
                                >
                                  <option value="setter">Setter</option>
                                  <option value="closer">Closer</option>
                                  <option value="dm_setter">DM Setter</option>
                                  <option value="coach">Coach</option>
                                  <option value="sales_exec">Sales Manager</option>
                                  <option value="executive">Executive</option>
                                </select>
                              </div>
                              <Button size="sm" disabled={staffSaving || !newStaffName.trim() || !newStaffPassword.trim()} onClick={addStaff} className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs">
                                {staffSaving ? "Saving…" : "Add Staff"}
                              </Button>
                            </div>
                          )}
                          {staffMsg && <p className={`text-xs mt-1 ${staffMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{staffMsg}</p>}
                        </CardContent>
                      </Card>

                      {/* Client Health Heatmap */}
                      <ChartCard title="Client Health Heatmap">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[640px]">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                                {["Client", "Cash MTD", "Check-In", "Health", "Rev Share Owed", "Rev Share", "ROI Status"].map(h => (
                                  <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {clients.map((client, i) => {
                                const score = client.checkInScore;
                                const healthLabel = score >= 7 ? "On Track" : score >= 4 ? "Needs Attention" : "At Risk";
                                const healthClass = score >= 7
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : score >= 4
                                  ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                                  : "bg-red-500/10 text-red-400 border-red-500/20";
                                const revOwed = client.cashCollectedMTD * (client.revSharePct / 100);
                                const roiRecovered = client.cumulativeRevenue >= client.setupFee;
                                const roiGap = client.setupFee - client.cumulativeRevenue;
                                return (
                                  <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/40 transition-colors">
                                    <td className="py-3 pr-4 font-semibold whitespace-nowrap">{client.name}</td>
                                    <td className="py-3 pr-4 text-foreground">${client.cashCollectedMTD.toLocaleString()}</td>
                                    <td className="py-3 pr-4 text-muted-foreground">{score}/10</td>
                                    <td className="py-3 pr-4"><Badge className={`text-[10px] ${healthClass}`}>{healthLabel}</Badge></td>
                                    <td className="py-3 pr-4 text-foreground">${revOwed.toLocaleString()}</td>
                                    <td className="py-3 pr-4">
                                      <Badge className={client.revSharePaid ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]" : "bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]"}>
                                        {client.revSharePaid ? "Paid" : "Pending"}
                                      </Badge>
                                    </td>
                                    <td className="py-3 pr-4">
                                      {roiRecovered
                                        ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Recovered</Badge>
                                        : <span className="text-xs text-muted-foreground">${roiGap.toLocaleString()} to go</span>
                                      }
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </ChartCard>
                    </div>
                  )}

                  {/* ── Client Info ── */}
                  {masterSubTab === "client-info" && (
                    <TabErrorBoundary>
                      <OnboardingTab />
                    </TabErrorBoundary>
                  )}

                  {/* ── Client Managed (admin + sales_exec only) ── */}
                  {masterSubTab === "client-managed" && (isAdmin || isSalesExec) && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                          <Users className="h-4 w-4 text-orange-400" />
                          Client Managed
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Live read-only view of Leadwell client metrics. Refreshes every 30 s.</p>
                      </div>

                      {!leadwellExpanded ? (
                        <Card
                          className="bg-card border-border hover:border-orange-500/30 hover:-translate-y-0.5 transition-all cursor-pointer"
                          onClick={() => setLeadwellExpanded(true)}
                        >
                          <CardContent className="px-4 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                                <span className="text-base font-bold text-orange-400">L</span>
                              </div>
                              <div>
                                <p className="text-sm font-semibold">Leadwell</p>
                                <p className="text-xs text-muted-foreground">Sales operations dashboard</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Live</Badge>
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">Leadwell</span>
                              <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">Read Only</Badge>
                              {leadwellData && (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                                  Live · {Math.round((Date.now() - new Date(leadwellData.fetchedAt).getTime()) / 60000)}m ago
                                </Badge>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setLeadwellExpanded(false)}
                              className="h-7 text-xs text-muted-foreground gap-1">
                              <X className="h-3.5 w-3.5" />Close
                            </Button>
                          </div>

                          {leadwellLoading && !leadwellData && (
                            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
                          )}

                          {leadwellError && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-xs text-red-400">
                              {leadwellError.includes("not configured")
                                ? "LEADWELL_SUPABASE_URL and LEADWELL_SUPABASE_SERVICE_KEY env vars not set."
                                : `Failed to load: ${leadwellError}`}
                            </div>
                          )}

                          {leadwellData && (
                            <>
                              {/* KPI row */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                {[
                                  { label: "Cash MTD",    value: `$${leadwellData.cashMTD.toLocaleString()}`,   cls: "text-emerald-400" },
                                  { label: "Cash YTD",    value: `$${leadwellData.cashYTD.toLocaleString()}`,   cls: "text-emerald-400" },
                                  { label: "Deals Closed",value: String(leadwellData.dealsClosed),               cls: "text-orange-400"  },
                                  { label: "Calls Made",  value: String(leadwellData.callsMade),                 cls: "text-foreground"  },
                                  { label: "Demos Set",   value: String(leadwellData.demosSet),                  cls: "text-foreground"  },
                                  { label: "Showed",      value: String(leadwellData.demosShowed),               cls: "text-foreground"  },
                                ].map(({ label, value, cls }) => (
                                  <Card key={label} className="bg-card border-border">
                                    <CardContent className="px-3 py-3 text-center">
                                      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                                      <p className={`text-base font-bold ${cls}`}>{value}</p>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>

                              {/* Rep breakdown */}
                              {leadwellData.reps.length > 0 && (
                                <Card className="bg-card border-border">
                                  <CardHeader className="pb-2 pt-4 px-4">
                                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Rep Breakdown — MTD</CardTitle>
                                  </CardHeader>
                                  <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs min-w-[560px]">
                                        <thead>
                                          <tr className="text-left text-[10px] text-muted-foreground border-b border-border">
                                            {["Rep","Calls","Sets","Shows","Show%","Deals","Cash"].map(h => (
                                              <th key={h} className="pb-2 px-3 font-medium">{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {leadwellData.reps.map((rep) => (
                                            <tr key={rep.name} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                                              <td className="py-2 px-3 font-medium">{rep.name}</td>
                                              <td className="py-2 px-3">{rep.calls_made}</td>
                                              <td className="py-2 px-3">{rep.sets}</td>
                                              <td className="py-2 px-3">{rep.shows}</td>
                                              <td className="py-2 px-3 text-muted-foreground">
                                                {rep.sets > 0 ? `${Math.round((rep.shows / rep.sets) * 100)}%` : "—"}
                                              </td>
                                              <td className="py-2 px-3 text-orange-400">{rep.sales}</td>
                                              <td className="py-2 px-3 text-emerald-400">${rep.collections.toLocaleString()}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Staff Views ── */}
                  {masterSubTab === "staff" && (
                    <div className="space-y-6">
                      <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                          <Users className="h-4 w-4 text-orange-400" />
                          Staff Views
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">Live read-only stats for each team member, pulled from GHL on every KPI sync.</p>
                      </div>

                      {/* Sales Execs tier */}
                      {staffList.filter(s => s.role === "sales_exec" || s.role === "admin" || s.role === "owner").length > 0 && (
                        <div className="space-y-3">
                          <p className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold">Sales Execs</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {staffList
                              .filter(s => s.role === "sales_exec" || s.role === "admin" || s.role === "owner")
                              .map((s) => {
                                const repData = r.leaderboard.find(rep =>
                                  rep.name.toLowerCase().includes(s.name.toLowerCase())
                                );
                                const roleLabel = s.role === "sales_exec" ? "Sales Exec" : s.role === "owner" ? "Owner" : "Admin";
                                return (
                                  <Card key={s.id} className="bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40 hover:-translate-y-0.5 transition-all">
                                    <CardContent className="px-4 py-4 space-y-3">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                                          <span className="text-sm font-bold text-orange-400">{s.name.charAt(0)}</span>
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold">{s.name}</p>
                                          <p className="text-xs text-orange-400/80">{roleLabel}</p>
                                        </div>
                                      </div>
                                      {repData ? (
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                          <div><p className="text-muted-foreground">Calls</p><p className="font-bold text-foreground">{repData.callsMade}</p></div>
                                          <div><p className="text-muted-foreground">Closed</p><p className="font-bold text-orange-400">{repData.dealsClosed}</p></div>
                                          <div><p className="text-muted-foreground">Cash</p><p className="font-bold text-emerald-400">${repData.cashCollected.toLocaleString()}</p></div>
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground">No leaderboard data — run Sync KPI.</p>
                                      )}
                                      <Link href="/?tab=reps">
                                        <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5 border-orange-500/30 hover:text-orange-400">
                                          <ExternalLink className="h-3 w-3" />View Leaderboard
                                        </Button>
                                      </Link>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Sales Reps tier — with drill-in */}
                      {drillStaff ? (
                        <div className="space-y-4">
                          <button onClick={() => { setDrillStaff(null); setDrillEntries([]); }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <ChevronLeft className="h-3.5 w-3.5" />Back to Staff
                          </button>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-base font-bold text-orange-400">{drillStaff.name.charAt(0)}</span>
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold">{drillStaff.name}</h3>
                              <p className="text-xs text-muted-foreground">{drillStaff.role}</p>
                            </div>
                            <Badge className="ml-auto bg-muted text-muted-foreground border-border text-[10px]">Read-only</Badge>
                          </div>
                          {drillLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
                          ) : (() => {
                            const currentMonth = new Date().toISOString().slice(0, 7);
                            const mtd = drillEntries.filter(e => e.date.startsWith(currentMonth));
                            const cash    = mtd.reduce((s, e) => s + (e.cashCollected ?? 0), 0);
                            const closed  = mtd.reduce((s, e) => s + (e.closed        ?? 0), 0);
                            const calls   = mtd.reduce((s, e) => s + (e.callsMade     ?? 0), 0);
                            const answered= mtd.reduce((s, e) => s + (e.callsAnswered ?? 0), 0);
                            const ansRate = calls > 0 ? Math.round(answered / calls * 100) : 0;
                            const recent  = [...drillEntries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
                            return (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {[
                                    { label: "Cash MTD",    value: `$${cash.toLocaleString()}`,     cls: "text-emerald-400" },
                                    { label: "Deals Closed",value: String(closed),                  cls: "text-orange-400"  },
                                    { label: "Calls Made",  value: String(calls),                   cls: "text-foreground"  },
                                    { label: "Answer Rate", value: `${ansRate}%`,                   cls: "text-foreground"  },
                                  ].map(({ label, value, cls }) => (
                                    <Card key={label} className="bg-card border-border">
                                      <CardContent className="px-3 py-3 text-center">
                                        <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                                        <p className={`text-base font-bold ${cls}`}>{value}</p>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                                {recent.length > 0 ? (
                                  <Card className="bg-card border-border">
                                    <CardHeader className="pb-2 pt-4 px-4">
                                      <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recent Activity</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-xs min-w-[500px]">
                                          <thead>
                                            <tr className="text-left text-[10px] text-muted-foreground border-b border-border">
                                              {["Date","Calls","Answered","Demos Set","Showed","Closed","Cash"].map(h => (
                                                <th key={h} className="pb-2 px-4 font-medium">{h}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {recent.map(e => (
                                              <tr key={e.date} className="border-b border-border/30 last:border-0 hover:bg-muted/30">
                                                <td className="py-2 px-4 text-muted-foreground">{e.date}</td>
                                                <td className="py-2 px-4">{e.callsMade ?? 0}</td>
                                                <td className="py-2 px-4">{e.callsAnswered ?? 0}</td>
                                                <td className="py-2 px-4">{e.demosSet ?? 0}</td>
                                                <td className="py-2 px-4">{e.demosShowed ?? 0}</td>
                                                <td className="py-2 px-4 text-orange-400">{e.closed ?? 0}</td>
                                                <td className="py-2 px-4 text-emerald-400">${(e.cashCollected ?? 0).toLocaleString()}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ) : (
                                  <p className="text-xs text-muted-foreground text-center py-6">No entries logged yet.</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Sales Reps</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {staffList
                              .filter(s => !["sales_exec", "admin", "owner", "executive"].includes(s.role ?? ""))
                              .map((s) => {
                                const repData = r.leaderboard.find(rep =>
                                  rep.name.toLowerCase().includes(s.name.toLowerCase())
                                );
                                const roleLabel = s.role === "closer" ? "Closer" : s.role === "setter" ? "Setter" : s.role === "dm_setter" ? "DM Setter" : s.role === "coach" ? "Coach" : (s.role ?? "Staff");
                                return (
                                  <Card key={s.id}
                                    className="bg-card border-border hover:border-orange-500/30 hover:-translate-y-0.5 transition-all cursor-pointer"
                                    onClick={() => {
                                      setDrillStaff({ name: s.name, role: roleLabel });
                                      setDrillLoading(true);
                                      fetch(`/api/replog?target=${s.id}`)
                                        .then(r => r.ok ? r.json() : [])
                                        .then((entries: DailyEntry[]) => setDrillEntries(entries))
                                        .catch(() => setDrillEntries([]))
                                        .finally(() => setDrillLoading(false));
                                    }}
                                  >
                                    <CardContent className="px-4 py-4 space-y-3">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                          <span className="text-sm font-bold text-orange-400">{s.name.charAt(0)}</span>
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold">{s.name}</p>
                                          <p className="text-xs text-muted-foreground">{roleLabel}</p>
                                        </div>
                                      </div>
                                      {repData ? (
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                          <div><p className="text-muted-foreground">Calls</p><p className="font-bold text-foreground">{repData.callsMade}</p></div>
                                          <div><p className="text-muted-foreground">Closed</p><p className="font-bold text-orange-400">{repData.dealsClosed}</p></div>
                                          <div><p className="text-muted-foreground">Cash</p><p className="font-bold text-emerald-400">${repData.cashCollected.toLocaleString()}</p></div>
                                        </div>
                                      ) : (
                                        <p className="text-[10px] text-muted-foreground">No data yet — log numbers in My Numbers.</p>
                                      )}
                                      <p className="text-[10px] text-muted-foreground/50 text-center">Click to view detail →</p>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                          </div>
                          <p className="text-[10px] text-muted-foreground">Data updates live as reps log their daily numbers.</p>
                        </div>
                      )}
                    </div>
                  )}

                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ SETTINGS ══════════════ */}
            {tab === "settings" && isAdmin && (
              <TabsContent value="settings">
                <motion.div key="settings" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-6 max-w-2xl">
                  <div>
                    <h2 className="text-base font-bold">Admin Settings</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">System utilities and data controls.</p>
                  </div>

                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">Data Utilities</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 divide-y divide-border">

                      {/* Sync KPI */}
                      <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">Sync KPI</p>
                          <p className="text-xs text-muted-foreground">Pull latest pipeline data from GHL into the leaderboard.</p>
                          {lastKpiSynced && <p className="text-[10px] text-muted-foreground">Last synced: {lastKpiSynced}</p>}
                        </div>
                        <Button size="sm" variant="outline" onClick={syncKpiData} disabled={kpiSyncing}
                          className="gap-1.5 text-xs h-8 border-border shrink-0 ml-4">
                          <RefreshCw className={`h-3.5 w-3.5 ${kpiSyncing ? "animate-spin" : ""}`} />
                          {kpiSyncMsg || "Sync KPI"}
                        </Button>
                      </div>

                      {/* Backfill Deals */}
                      <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">Backfill Deals</p>
                          <p className="text-xs text-muted-foreground">Import historical GHL deals into the dashboard.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={backfillDeals} disabled={kpiSyncing}
                          className="gap-1.5 text-xs h-8 border-border shrink-0 ml-4">
                          <Download className="h-3.5 w-3.5" />
                          Backfill
                        </Button>
                      </div>

                      {/* Expenses */}
                      <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">Expenses</p>
                          <p className="text-xs text-muted-foreground">View and manage staff expense submissions.</p>
                        </div>
                        <Link href="/staff/expenses">
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 border-border shrink-0 ml-4">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Button>
                        </Link>
                      </div>

                      {/* Reset */}
                      <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-red-400">Reset Dashboard</p>
                          <p className="text-xs text-muted-foreground">Clear all manually entered data and reset to blank state. This cannot be undone.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={reset}
                          className="gap-1.5 text-xs h-8 border-red-500/30 text-red-400 hover:bg-red-500/10 shrink-0 ml-4">
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reset
                        </Button>
                      </div>

                    </CardContent>
                  </Card>

                  {/* Discord Notifications */}
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Discord Notifications</CardTitle>
                        <Button size="sm" variant="outline" onClick={runDiscordTest} disabled={discordTesting}
                          className="gap-1.5 text-xs h-8 border-border shrink-0">
                          {discordTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          {discordTesting ? "Testing…" : "Test All"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      {!discordTestResults && !discordTesting && (
                        <p className="text-xs text-muted-foreground">Fire a test notification to every Discord channel to confirm wiring. Results appear here.</p>
                      )}

                      {discordTestResults && (
                        <>
                          {/* Summary banner */}
                          <div className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                            discordTestResults.summary.noUrl > 0 || discordTestResults.summary.failed > 0
                              ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}>
                            {discordTestResults.summary.noUrl > 0 || discordTestResults.summary.failed > 0
                              ? `⚠️ ${discordTestResults.summary.sent}/${discordTestResults.summary.total} channels active — ${discordTestResults.summary.noUrl} not configured, ${discordTestResults.summary.failed} failed`
                              : `✅ All ${discordTestResults.summary.total} channels firing`}
                          </div>

                          {/* Per-channel rows */}
                          <div className="space-y-1">
                            {discordTestResults.channels.map((ch) => (
                              <div key={ch.envKey} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40 text-xs">
                                <span className="font-medium">{ch.label}</span>
                                {ch.sent ? (
                                  <span className="text-emerald-400 font-semibold">✓ Sent</span>
                                ) : !ch.hasUrl ? (
                                  <span className="text-orange-400">No URL — run discord-setup</span>
                                ) : (
                                  <span className="text-red-400" title={ch.error}>✗ Failed</span>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40 text-xs">
                              <span className="font-medium">Boiler Room (bot)</span>
                              {discordTestResults.boilerRoom.sent ? (
                                <span className="text-emerald-400 font-semibold">✓ Sent</span>
                              ) : (
                                <span className="text-red-400" title={discordTestResults.boilerRoom.error}>✗ Failed</span>
                              )}
                            </div>
                          </div>

                          {/* Setup link if any URLs missing */}
                          {discordTestResults.summary.noUrl > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              Missing channels need one-time setup. Hit{" "}
                              <code className="bg-muted px-1 py-0.5 rounded text-orange-400">/api/cron/discord-setup?secret=YOUR_CRON_SECRET</code>{" "}
                              after setting <code className="bg-muted px-1 py-0.5 rounded text-orange-400">DISCORD_GUILD_ID</code> in Vercel.
                            </p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>
            )}

          </AnimatePresence>
        </Tabs>
      </main>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
