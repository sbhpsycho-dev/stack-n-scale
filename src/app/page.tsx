"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Edit3, TrendingUp, RotateCcw, LogOut, Upload } from "lucide-react";
import { signOut } from "next-auth/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MetricCard } from "@/components/metric-card";
import { EditDataSheet } from "@/components/edit-data-sheet";
import { useSalesData } from "@/hooks/use-sales-data";
import { RevenueOverTimeChart, NetByProductChart, NetByProcessorChart } from "@/components/charts/revenue-chart";
import { PipelineFunnelChart, StageBreakdownChart } from "@/components/charts/funnel-chart";
import { LeadsOverTimeChart, LeadsByCampaignChart, AdSpendSplitChart } from "@/components/charts/ads-charts";
import { CallsPerRepChart, CloseRatePerRepChart, CashPerRepChart } from "@/components/charts/rep-charts";

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
  const { data, update, reset, loading } = useSalesData();
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const { dashboard: d, pipeline: p, ads: a, reps: r } = data;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.dashboard || !parsed.pipeline || !parsed.ads || !parsed.reps) return;
        update(parsed);
      } catch { /* bad file — silently ignore */ }
    };
    reader.readAsText(file);
  }, [update]);

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
            <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-wide">Stack N Scale</span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
              Sales Pipeline
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            <Button size="sm" variant="ghost" onClick={reset}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 text-xs h-8 px-3 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300">
              <Upload className="h-3.5 w-3.5" />
              Upload JSON
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
          <TabsList className="bg-muted border border-border h-9 mb-6">
            <TabsTrigger value="dashboard" className="text-xs px-4">Dashboard</TabsTrigger>
            <TabsTrigger value="pipeline"  className="text-xs px-4">Pipeline</TabsTrigger>
            <TabsTrigger value="ads"       className="text-xs px-4">Ads</TabsTrigger>
            <TabsTrigger value="reps"      className="text-xs px-4">Rep Leaderboard</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">

            {/* ══════════════ DASHBOARD ══════════════ */}
            {tab === "dashboard" && (
              <TabsContent value="dashboard">
                <motion.div key="dashboard" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <MetricCard label="Cash Collected MTD" value={d.cashCollectedMTD} prefix="$" variant="green"   index={0} />
                    <MetricCard label="Net Revenue MTD"    value={d.netRevenueMTD}    prefix="$" variant="orange"  index={1} />
                    <MetricCard label="Leads This Month"   value={d.leadsThisMonth}              variant="default" index={2} />
                    <MetricCard label="Total Deals Closed" value={d.totalDealsClosedMTD}         variant="orange"  index={3} />
                    <MetricCard label="Cost Per Close"     value={d.costPerClose}     prefix="$" variant="default" index={4} />
                    <MetricCard label="MRR"                value={d.mrr}              prefix="$" variant="black"   index={5} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Total Refund MTD" value={d.totalRefund}    prefix="$" variant="orange" index={6} />
                    <MetricCard label="Total Refund %"   value={d.totalRefundPct} suffix="%" variant="green"  index={7} decimals={2} />
                  </div>

                  <ChartCard title="Revenue Over Time">
                    <RevenueOverTimeChart data={d.revenueOverTime} />
                  </ChartCard>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ChartCard title="Net Amount by Product / Offer">
                      <NetByProductChart data={d.netByProduct} />
                    </ChartCard>
                    <ChartCard title="Net Amount by Processor">
                      <NetByProcessorChart data={d.netByProcessor} />
                    </ChartCard>
                  </div>
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ PIPELINE ══════════════ */}
            {tab === "pipeline" && (
              <TabsContent value="pipeline">
                <motion.div key="pipeline" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
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

                  <ChartCard title="Full Pipeline Funnel">
                    <PipelineFunnelChart data={p.funnelByWeek} />
                  </ChartCard>
                  <ChartCard title="Record Count by Pipeline Stage">
                    <StageBreakdownChart data={p.stageBreakdown} />
                  </ChartCard>
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ ADS ══════════════ */}
            {tab === "ads" && (
              <TabsContent value="ads">
                <motion.div key="ads" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
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

                  <Separator className="bg-border/50" />

                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold">Instagram Ads</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <MetricCard label="Impressions" value={a.impressions} variant="default" index={0} />
                      <MetricCard label="Reach"       value={a.reach}       variant="default" index={1} />
                      <MetricCard label="Total Leads" value={a.totalLeads}  variant="default" index={2} />
                      <MetricCard label="CPL"         value={a.instaCPL}    prefix="$" variant="default" index={3} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ChartCard title="Leads Over Time">
                      <LeadsOverTimeChart data={a.leadsOverTime} />
                    </ChartCard>
                    <ChartCard title="Leads by Campaign">
                      <LeadsByCampaignChart data={a.leadsByCampaign} />
                    </ChartCard>
                  </div>

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
                </motion.div>
              </TabsContent>
            )}

            {/* ══════════════ REP LEADERBOARD ══════════════ */}
            {tab === "reps" && (
              <TabsContent value="reps">
                <motion.div key="reps" variants={tabAnim} initial="initial" animate="animate" exit="exit" className="space-y-5">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MetricCard label="Total Cash Collected"
                      value={r.leaderboard.reduce((s, rep) => s + rep.cashCollected, 0)}
                      prefix="$" variant="green" index={8} />
                    <MetricCard label="Avg Deal Size" value={r.avgDealSize} prefix="$" variant="default" index={9} />
                  </div>
                </motion.div>
              </TabsContent>
            )}

          </AnimatePresence>
        </Tabs>
      </main>

      <EditDataSheet open={editOpen} data={data} onClose={() => setEditOpen(false)}
        onSave={(next) => { update(next); setEditOpen(false); }} />
    </div>
  );
}
