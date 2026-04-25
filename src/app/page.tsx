"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Edit3, RotateCcw, LogOut, TrendingUp, TrendingDown, Minus, UserPlus, Users, Settings, RefreshCw, CheckCircle2, Circle, Loader2, Pencil, Check, X, Sliders, BookOpen, FileText, Video, Wrench, Layout, Target, Trash2, Plus, ExternalLink } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MetricCard } from "@/components/metric-card";
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
import { SEED, BLANK } from "@/lib/sales-data";
import { SettingsSheet } from "@/components/settings-sheet";
import { type DashboardConfig, DEFAULT_CONFIG, BUSINESS_PRESETS, type BusinessType } from "@/lib/dashboard-config";
import { type Resource, type ResourceType } from "@/lib/resources";
import { Switch } from "@/components/ui/switch";

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

export default function Dashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";
  const clientId = isAdmin ? "admin" : (session?.user?.clientId ?? null);

  const { data, update, reset, loading } = useSalesData(clientId);
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setTab(t);
  }, []);

  // Integrations state
  const [integrations, setIntegrations] = useState<ClientIntegrations>({});
  const [syncingSource, setSyncingSource] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Dashboard config (business type + widget visibility)
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then((c) => { if (c && c.businessType) setConfig(c); }).catch(() => {});
  }, []);
  const saveConfig = (next: DashboardConfig) => {
    setConfig(next);
    fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
  };

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

  // Auto-redirect new clients to setup wizard (only if they haven't completed it)
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (redirectedRef.current || loading || isAdmin || !clientId) return;
    const setupDone = localStorage.getItem(`sns-setup-done-${clientId}`) === "1";
    if (!setupDone &&
        data.dashboard.cashCollectedMTD === SEED.dashboard.cashCollectedMTD &&
        data.dashboard.leadsThisMonth === SEED.dashboard.leadsThisMonth) {
      redirectedRef.current = true;
      router.push("/setup");
    }
  }, [loading, data, isAdmin, clientId, router]);

  // Load integrations for client
  useEffect(() => {
    if (isAdmin || !clientId) return;
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
      setLastSynced(new Date().toISOString());
    } finally {
      setSyncingSource(null);
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
              {isAdmin ? "Stack N Scale" : (session?.user?.name ?? "Dashboard")}
            </span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
              {isAdmin ? "Admin" : "Sales Pipeline"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link href="/onboarding"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 rounded-lg hover:bg-muted transition-colors">
                Onboarding
              </Link>
            )}
            <Button size="sm" variant="ghost" onClick={reset}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5">
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}
              className="gap-1.5 text-xs h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white">
              <Edit3 className="h-3.5 w-3.5" />
              Edit Data
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
            {config.tabs.pipeline   && <TabsTrigger value="pipeline"     className="text-xs px-4">Pipeline</TabsTrigger>}
            {config.tabs.ads        && <TabsTrigger value="ads"          className="text-xs px-4">Ads</TabsTrigger>}
            {config.tabs.reps       && <TabsTrigger value="reps"         className="text-xs px-4">Rep Leaderboard</TabsTrigger>}
            {config.tabs.resources  && <TabsTrigger value="resources"    className="text-xs px-4">Resources</TabsTrigger>}
            {!isAdmin && <TabsTrigger value="integrations" className="text-xs px-4">Integrations</TabsTrigger>}
            {!isAdmin && <TabsTrigger value="customize"    className="text-xs px-4"><Sliders className="h-3 w-3 mr-1" />Customize</TabsTrigger>}
            {isAdmin  && <TabsTrigger value="master"       className="text-xs px-4">Master</TabsTrigger>}
          </TabsList>

          <AnimatePresence mode="wait">

            {/* ══════════════ DASHBOARD ══════════════ */}
            {tab === "dashboard" && (
              <TabsContent value="dashboard">
                <motion.div key="dashboard" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">

                  {/* Top KPI row */}
                  {config.widgets.kpiCards && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="relative">
                          <MetricCard label="Cash Collected MTD" value={d.cashCollectedMTD} prefix="$" variant="green" index={0} />
                          {!trendFlat && (
                            <div className={`absolute bottom-2 right-2 flex items-center gap-0.5 text-[10px] font-semibold ${trendUp ? "text-emerald-400" : "text-red-400"}`}>
                              {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {trendUp ? "+" : ""}{trendPct.toFixed(1)}%
                            </div>
                          )}
                          {trendFlat && (
                            <div className="absolute bottom-2 right-2 flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                              <Minus className="h-3 w-3" /> 0%
                            </div>
                          )}
                        </div>
                        <MetricCard label="Net Revenue MTD"    value={d.netRevenueMTD}    prefix="$" variant="orange"  index={1} />
                        <MetricCard label="Leads This Month"   value={d.leadsThisMonth}              variant="default" index={2} />
                        <MetricCard label="Total Deals Closed" value={d.totalDealsClosedMTD}         variant="orange"  index={3} />
                        <MetricCard label="Cost Per Close"     value={d.costPerClose}     prefix="$" variant="default" index={4} />
                        <MetricCard label="MRR"                value={d.mrr}              prefix="$" variant="black"   index={5} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MetricCard label="Total Refund MTD"    value={d.totalRefund}             prefix="$" variant="orange" index={6} />
                        <MetricCard label="Total Refund %"      value={d.totalRefundPct}          suffix="%" variant="green"  index={7} decimals={2} />
                        <MetricCard label="Avg Lead Response"   value={d.avgLeadResponseTimeMin}  suffix=" min" variant={leadRespVariant} index={8} decimals={1} />
                        <MetricCard label="Cost Per Close"      value={d.costPerClose}            prefix="$" variant="default" index={9} />
                      </div>
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
                <motion.div key="ads" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
                  {config.widgets.adMetrics && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">Facebook Ads</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MetricCard label="Ad Spend"      value={a.totalAdSpend} prefix="$" variant="orange" index={0} />
                        <MetricCard label="Total Leads"   value={a.totalLeads}              variant="orange" index={1} />
                        <MetricCard label="Cost Per Lead" value={a.cpl}          prefix="$" variant="orange" index={2} />
                        <MetricCard label="ROAS"          value={a.roas}                    variant="orange" index={3} decimals={1} />
                        <MetricCard label="CTR %"         value={a.ctr}          suffix="%" variant="orange" index={4} />
                        <MetricCard label="CPC"           value={a.cpc}          prefix="$" variant="orange" index={5} decimals={2} />
                      </div>
                    </div>
                  )}
                  {config.widgets.adMetrics && <Separator className="bg-border/50" />}

                  {config.widgets.adMetrics && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">Instagram Ads</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <MetricCard label="Impressions" value={a.impressions} variant="default" index={0} />
                        <MetricCard label="Reach"       value={a.reach}       variant="default" index={1} />
                        <MetricCard label="Total Leads" value={a.totalLeads}  variant="default" index={2} />
                        <MetricCard label="CPL"         value={a.instaCPL}    prefix="$" variant="default" index={3} />
                      </div>
                    </div>
                  )}

                  {config.widgets.leadsOverTime && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ChartCard title="Leads Over Time">
                        <LeadsOverTimeChart data={a.leadsOverTime} />
                      </ChartCard>
                      <ChartCard title="Leads by Campaign">
                        <LeadsByCampaignChart data={a.leadsByCampaign} />
                      </ChartCard>
                    </div>
                  )}

                  {config.widgets.topAds && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ChartCard title="Ad Spend Split">
                      <AdSpendSplitChart data={a.spendSplit} />
                    </ChartCard>
                    <ChartCard title="Top Performing Ads">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-xs text-muted-foreground">
                              <th className="pb-2 font-medium">Ad</th>
                              <th className="pb-2 font-medium text-right">Leads</th>
                              <th className="pb-2 font-medium text-right">CPL</th>
                              <th className="pb-2 font-medium text-right">ROAS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.topAds.map((ad, i) => (
                              <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors">
                                <td className="py-2">{ad.name}</td>
                                <td className="py-2 text-right">{ad.leads}</td>
                                <td className="py-2 text-right text-muted-foreground">${ad.cpl.toFixed(2)}</td>
                                <td className="py-2 text-right">
                                  <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
                                    {ad.roas.toFixed(1)}x
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-border text-xs text-muted-foreground">
                              <td className="pt-2 font-semibold text-foreground">Total</td>
                              <td className="pt-2 text-right font-semibold text-foreground">
                                {a.topAds.reduce((s, ad) => s + ad.leads, 0)}
                              </td>
                              <td className="pt-2 text-right">
                                ${(a.topAds.reduce((s, ad) => s + ad.cpl, 0) / Math.max(a.topAds.length, 1)).toFixed(2)}
                              </td>
                              <td className="pt-2 text-right">{a.roas.toFixed(1)}x</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </ChartCard>
                  </div>
                  )}
                </motion.div>
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
                                  <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{rep.name}</td>
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

            {/* ══════════════ RESOURCES ══════════════ */}
            {tab === "resources" && config.tabs.resources && (
              <TabsContent value="resources">
                <motion.div key="resources" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold flex items-center gap-2"><BookOpen className="h-4 w-4 text-orange-400" />Resources</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">SOPs, trainings, tools, and templates curated for you.</p>
                    </div>
                    {isAdmin && (
                      <Button size="sm" onClick={() => setAddingResource(true)}
                        className="gap-1.5 text-xs h-8 bg-orange-500 hover:bg-orange-600 text-white">
                        <Plus className="h-3.5 w-3.5" /> Add Resource
                      </Button>
                    )}
                  </div>

                  {/* Admin add form */}
                  {isAdmin && addingResource && (
                    <Card className="bg-card border-orange-500/30">
                      <CardContent className="px-4 py-4 space-y-3">
                        <p className="text-xs font-semibold text-orange-400">New Resource</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Title</Label>
                            <Input value={newResource.title} onChange={e => setNewResource(p => ({...p, title: e.target.value}))} placeholder="e.g. Cold Outreach SOP" className="h-8 text-sm bg-muted border-border" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">URL</Label>
                            <Input value={newResource.url} onChange={e => setNewResource(p => ({...p, url: e.target.value}))} placeholder="https://..." className="h-8 text-sm bg-muted border-border" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Category</Label>
                            <Input value={newResource.category} onChange={e => setNewResource(p => ({...p, category: e.target.value}))} placeholder="e.g. Sales Processes" className="h-8 text-sm bg-muted border-border" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Type</Label>
                            <select value={newResource.type} onChange={e => setNewResource(p => ({...p, type: e.target.value as ResourceType}))}
                              className="h-8 text-sm bg-muted border border-border rounded-md px-2 text-foreground">
                              <option value="sop">SOP</option>
                              <option value="training">Training</option>
                              <option value="tool">Tool</option>
                              <option value="template">Template</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2 flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Description</Label>
                            <Input value={newResource.description} onChange={e => setNewResource(p => ({...p, description: e.target.value}))} placeholder="Brief description..." className="h-8 text-sm bg-muted border-border" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={addResource} className="h-7 bg-orange-500 hover:bg-orange-600 text-white text-xs">Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddingResource(false)} className="h-7 text-xs">Cancel</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Filter pills */}
                  <div className="flex gap-2 flex-wrap">
                    {(["all", "sop", "training", "tool", "template"] as const).map(f => (
                      <button key={f} onClick={() => setResourceFilter(f)}
                        className={`text-xs px-3 py-1 rounded-full border transition-colors ${resourceFilter === f ? "bg-orange-500 border-orange-500 text-white" : "border-border text-muted-foreground hover:border-orange-500/40 hover:text-orange-400"}`}>
                        {f === "all" ? "All" : f === "sop" ? "SOPs" : f === "training" ? "Trainings" : f === "tool" ? "Tools" : "Templates"}
                      </button>
                    ))}
                  </div>

                  {/* Resource cards grouped by category */}
                  {(() => {
                    const filtered = resources.filter(r => resourceFilter === "all" || r.type === resourceFilter);
                    const byCategory = filtered.reduce<Record<string, Resource[]>>((acc, r) => {
                      const cat = r.category || "General";
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(r);
                      return acc;
                    }, {});
                    if (filtered.length === 0) return (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        {resources.length === 0 ? "No resources added yet. Admin can add resources above." : "No resources match this filter."}
                      </div>
                    );
                    const typeIcon = (type: ResourceType) => {
                      if (type === "sop") return <FileText className="h-3.5 w-3.5 text-orange-400" />;
                      if (type === "training") return <Video className="h-3.5 w-3.5 text-blue-400" />;
                      if (type === "tool") return <Wrench className="h-3.5 w-3.5 text-emerald-400" />;
                      return <Layout className="h-3.5 w-3.5 text-purple-400" />;
                    };
                    return Object.entries(byCategory).map(([cat, items]) => (
                      <div key={cat} className="space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{cat}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {items.map(resource => (
                            <Card key={resource.id} className="bg-card border-border hover:border-orange-500/30 transition-colors group">
                              <CardContent className="px-4 py-3 flex flex-col gap-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {typeIcon(resource.type)}
                                    <span className="text-sm font-semibold truncate">{resource.title}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-orange-400">
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    </a>
                                    {isAdmin && (
                                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => deleteResource(resource.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {resource.description && <p className="text-xs text-muted-foreground leading-relaxed">{resource.description}</p>}
                                <Badge className="w-fit text-[10px] bg-muted border-border">{resource.type.toUpperCase()}</Badge>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ CUSTOMIZE ══════════════ */}
            {tab === "customize" && !isAdmin && (
              <TabsContent value="customize">
                <motion.div key="customize" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-6 max-w-2xl">
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2"><Sliders className="h-4 w-4 text-orange-400" />Customize Dashboard</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Choose your business type to auto-configure, then fine-tune individual sections.</p>
                  </div>

                  {/* Business type cards */}
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">Business Type</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {(["coaching", "agency", "ecommerce", "saas", "custom"] as BusinessType[]).map(type => (
                          <button key={type} onClick={() => saveConfig(BUSINESS_PRESETS[type])}
                            className={`rounded-lg border px-3 py-3 text-center text-xs font-medium transition-all ${config.businessType === type ? "bg-orange-500/10 border-orange-500/50 text-orange-400" : "border-border text-muted-foreground hover:border-orange-500/30 hover:text-foreground"}`}>
                            {type === "coaching" ? "🎯 Coaching" : type === "agency" ? "🏢 Agency" : type === "ecommerce" ? "🛒 E-commerce" : type === "saas" ? "💻 SaaS" : "⚡ Custom"}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Tab toggles */}
                  <Card className="bg-card border-border">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold">Visible Tabs</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      {([["dashboard","Dashboard"],["pipeline","Pipeline"],["ads","Ads"],["reps","Rep Leaderboard"],["resources","Resources"]] as [keyof DashboardConfig["tabs"], string][]).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{label}</span>
                          <Switch checked={config.tabs[key]} onCheckedChange={v => saveConfig({ ...config, businessType: "custom", tabs: { ...config.tabs, [key]: v } })} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Widget toggles by section */}
                  {([
                    ["Dashboard Widgets", [
                      ["kpiCards","KPI Cards (Cash, Revenue, Leads, etc.)"],
                      ["monthlyGoal","Monthly Goal Progress"],
                      ["paceToGoal","Pace to Goal"],
                      ["reactivation","Reactivation Campaign"],
                      ["revenueChart","Revenue Over Time Chart"],
                      ["netByProduct","Net by Product / Offer Chart"],
                      ["netByProcessor","Net by Processor Chart"],
                      ["checkInScores","Client Pulse (Check-In Scores)"],
                    ]],
                    ["Pipeline Widgets", [
                      ["callMetrics","Call & Demo Metrics"],
                      ["funnelChart","Pipeline Funnel Chart"],
                      ["stageBreakdown","Stage Breakdown Chart"],
                    ]],
                    ["Ads Widgets", [
                      ["adMetrics","Facebook & Instagram Ad Metrics"],
                      ["leadsOverTime","Leads Over Time & by Campaign"],
                      ["topAds","Ad Spend Split & Top Ads"],
                    ]],
                    ["Rep Leaderboard Widgets", [
                      ["leaderboard","Rep Leaderboard Table & Snapshot"],
                      ["repCharts","Rep Performance Charts"],
                    ]],
                  ] as [string, [keyof DashboardConfig["widgets"], string][]][]).map(([section, items]) => (
                    <Card key={section} className="bg-card border-border">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold">{section}</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-3">
                        {items.map(([key, label]) => (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm text-foreground">{label}</span>
                            <Switch checked={config.widgets[key]} onCheckedChange={v => saveConfig({ ...config, businessType: "custom", widgets: { ...config.widgets, [key]: v } })} />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ INTEGRATIONS ══════════════ */}
            {tab === "integrations" && !isAdmin && (
              <TabsContent value="integrations">
                <motion.div key="integrations" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-4 max-w-2xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold">Data Integrations</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Connect your tools — data syncs automatically every morning.
                        {lastSynced && ` Last synced: ${new Date(lastSynced).toLocaleString()}`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline"
                      onClick={async () => { setSyncingSource("all"); try { await fetch("/api/sync/all", { method: "POST" }); setLastSynced(new Date().toISOString()); } finally { setSyncingSource(null); } }}
                      disabled={syncingSource === "all"}
                      className="gap-1.5 text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
                      {syncingSource === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Sync All
                    </Button>
                  </div>

                  {(["meta", "ghl", "stripe", "sheets"] as const).map((source) => {
                    const labels: Record<string, { title: string; desc: string }> = {
                      meta:   { title: "Meta / Facebook Ads", desc: "Auto-pulls ad spend, leads, CPL, ROAS, CTR" },
                      ghl:    { title: "GoHighLevel (GHL)",   desc: "Auto-pulls pipeline stages, rep leaderboard, leads" },
                      stripe: { title: "Stripe",              desc: "Auto-pulls cash collected, MRR, refunds" },
                      sheets: { title: "Google Sheets",       desc: "Maps spreadsheet columns to dashboard fields" },
                    };
                    const connected =
                      (source === "meta" && !!(integrations.meta?.accessToken && integrations.meta?.adAccountId)) ||
                      (source === "ghl" && !!(integrations.ghl?.apiKey && integrations.ghl?.locationId)) ||
                      (source === "stripe" && !!integrations.stripe?.secretKey) ||
                      (source === "sheets" && !!integrations.sheets?.sheetUrl);
                    return (
                      <Card key={source} className={`border ${connected ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
                        <CardContent className="px-4 py-4">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {connected
                                ? <CheckCircle2 className="h-4 w-4 text-orange-400 shrink-0" />
                                : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                              <p className="text-sm font-semibold">{labels[source].title}</p>
                              {connected && <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">Connected</Badge>}
                            </div>
                            {connected && (
                              <Button size="sm" variant="ghost" onClick={() => syncSource(source)} disabled={!!syncingSource}
                                className="h-7 gap-1 text-orange-400 hover:text-orange-300 text-xs">
                                {syncingSource === source ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Sync
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground ml-6">{labels[source].desc}</p>
                          {!connected && (
                            <p className="text-xs text-orange-400/70 mt-2 ml-6 italic">
                              Go to <button onClick={() => router.push("/setup")} className="underline hover:text-orange-400">Setup</button> to connect this integration.
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ MASTER OVERVIEW ══════════════ */}
            {tab === "master" && (
              <TabsContent value="master">
                <motion.div key="master" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">

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
                              <div key={c.id} className="flex items-center gap-1 group">
                                <Link href={`/admin/client/${c.id}`}>
                                  <Badge className="cursor-pointer px-3 py-1.5 text-xs bg-muted hover:bg-orange-500/10 hover:text-orange-400 hover:border-orange-500/30 border border-border transition-colors">
                                    {c.name}
                                  </Badge>
                                </Link>
                                <Button
                                  size="icon" variant="ghost"
                                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-orange-400"
                                  onClick={() => { setEditingClientId(c.id); setEditingClientName(c.name); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Add Client */}
                  <Card className="bg-card border-border">
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
                          <Input
                            value={newClientName}
                            onChange={(e) => setNewClientName(e.target.value)}
                            placeholder="e.g. Alpha Coaching"
                            className="h-8 text-sm bg-muted border-border"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Login Password</Label>
                          <Input
                            value={newClientPassword}
                            onChange={(e) => setNewClientPassword(e.target.value)}
                            placeholder="e.g. alpha2026"
                            className="h-8 text-sm bg-muted border-border"
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={clientSaving || !newClientName.trim() || !newClientPassword.trim()}
                          onClick={addClient}
                          className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                        >
                          {clientSaving ? "Saving…" : "Add Client"}
                        </Button>
                      </div>
                      {clientMsg && (
                        <p className="text-xs text-emerald-400 mt-3">{clientMsg}</p>
                      )}
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
                                <td className="py-3 pr-4">
                                  <Badge className={`text-[10px] ${healthClass}`}>{healthLabel}</Badge>
                                </td>
                                <td className="py-3 pr-4 text-foreground">${revOwed.toLocaleString()}</td>
                                <td className="py-3 pr-4">
                                  <Badge className={client.revSharePaid
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]"
                                    : "bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]"}>
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

                </motion.div>
              </TabsContent>
            )}

          </AnimatePresence>
        </Tabs>
      </main>

      <EditDataSheet open={editOpen} data={data} onClose={() => setEditOpen(false)}
        onSave={(next) => { update(next); setEditOpen(false); }} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
