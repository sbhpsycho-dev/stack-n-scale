"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { type SalesData } from "@/lib/sales-data";

interface Props {
  open: boolean;
  data: SalesData;
  onClose: () => void;
  onSave: (next: SalesData) => void;
}

function Field({ label, value, onChange }: { label: string; value: string | number; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm bg-muted border-border" />
    </div>
  );
}

function JsonField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Textarea rows={5} defaultValue={JSON.stringify(value, null, 2)}
        onChange={(e) => onChange(e.target.value)}
        className="text-[11px] font-mono bg-muted border-border resize-none" />
    </div>
  );
}

export function EditDataSheet({ open, data, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<SalesData>(data);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (open) setDraft(data); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = (v: string) => parseFloat(v) || 0;

  const setD = (k: keyof SalesData["dashboard"], v: string) =>
    setDraft((d) => ({ ...d, dashboard: { ...d.dashboard, [k]: n(v) } }));
  const setP = (k: keyof SalesData["pipeline"], v: string) =>
    setDraft((d) => ({ ...d, pipeline: { ...d.pipeline, [k]: n(v) } }));
  const setA = (k: keyof SalesData["ads"], v: string) =>
    setDraft((d) => ({ ...d, ads: { ...d.ads, [k]: n(v) } }));
  const setR = (k: keyof SalesData["reps"], v: string) =>
    setDraft((d) => ({ ...d, reps: { ...d.reps, [k]: n(v) } }));
  const setJson = (section: keyof SalesData, key: string, v: string) => {
    try {
      const parsed = JSON.parse(v);
      setDraft((d) => ({ ...d, [section]: { ...(d[section] as object), [key]: parsed } }));
    } catch { /* ignore invalid JSON while typing */ }
  };

  function handleSave() {
    onSave(draft);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-background border-border overflow-y-auto">
        <SheetHeader className="mb-5">
          <SheetTitle className="text-base font-bold">Edit Dashboard Data</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Update any numbers and hit Save — changes persist in your browser.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="dashboard">
          <TabsList className="bg-muted border border-border mb-5 h-8 w-full">
            {["dashboard", "pipeline", "ads", "reps"].map((t) => (
              <TabsTrigger key={t} value={t} className="text-[11px] flex-1 capitalize">{t}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard" className="space-y-3">
            <Field label="Cash Collected MTD ($)"  value={draft.dashboard.cashCollectedMTD}    onChange={(v) => setD("cashCollectedMTD", v)} />
            <Field label="Net Revenue MTD ($)"      value={draft.dashboard.netRevenueMTD}        onChange={(v) => setD("netRevenueMTD", v)} />
            <Field label="Leads This Month"         value={draft.dashboard.leadsThisMonth}       onChange={(v) => setD("leadsThisMonth", v)} />
            <Field label="Total Deals Closed"       value={draft.dashboard.totalDealsClosedMTD}  onChange={(v) => setD("totalDealsClosedMTD", v)} />
            <Field label="Cost Per Close ($)"       value={draft.dashboard.costPerClose}         onChange={(v) => setD("costPerClose", v)} />
            <Field label="MRR ($)"                  value={draft.dashboard.mrr}                  onChange={(v) => setD("mrr", v)} />
            <Field label="Total Refund ($)"         value={draft.dashboard.totalRefund}          onChange={(v) => setD("totalRefund", v)} />
            <Field label="Total Refund %"           value={draft.dashboard.totalRefundPct}       onChange={(v) => setD("totalRefundPct", v)} />
            <JsonField label='Revenue Over Time — [{"date":"","amount":0}]'   value={draft.dashboard.revenueOverTime} onChange={(v) => setJson("dashboard", "revenueOverTime", v)} />
            <JsonField label='Net by Product — [{"name":"","amount":0}]'      value={draft.dashboard.netByProduct}    onChange={(v) => setJson("dashboard", "netByProduct", v)} />
            <JsonField label='Net by Processor — [{"name":"","amount":0}]'    value={draft.dashboard.netByProcessor}  onChange={(v) => setJson("dashboard", "netByProcessor", v)} />
          </TabsContent>

          <TabsContent value="pipeline" className="space-y-3">
            <Field label="Calls Made"      value={draft.pipeline.callsMade}     onChange={(v) => setP("callsMade", v)} />
            <Field label="Calls Answered"  value={draft.pipeline.callsAnswered} onChange={(v) => setP("callsAnswered", v)} />
            <Field label="Demos Set"       value={draft.pipeline.demosSet}      onChange={(v) => setP("demosSet", v)} />
            <Field label="Demos Showed"    value={draft.pipeline.demosShowed}   onChange={(v) => setP("demosShowed", v)} />
            <Field label="Pitched"         value={draft.pipeline.pitched}       onChange={(v) => setP("pitched", v)} />
            <Field label="Closed"          value={draft.pipeline.closed}        onChange={(v) => setP("closed", v)} />
            <Field label="Answer Rate %"   value={draft.pipeline.answerRate}    onChange={(v) => setP("answerRate", v)} />
            <Field label="Show Rate %"     value={draft.pipeline.showRate}      onChange={(v) => setP("showRate", v)} />
            <Field label="Close Rate %"    value={draft.pipeline.closeRate}     onChange={(v) => setP("closeRate", v)} />
            <Field label="Demo to Close %" value={draft.pipeline.demoToClose}   onChange={(v) => setP("demoToClose", v)} />
            <JsonField label='Funnel by Week — [{"week":"","callsMade":0,"callsAnswered":0,"demosSet":0,"demosShowed":0,"pitched":0,"closed":0}]' value={draft.pipeline.funnelByWeek} onChange={(v) => setJson("pipeline", "funnelByWeek", v)} />
            <JsonField label='Stage Breakdown — [{"stage":"","count":0}]' value={draft.pipeline.stageBreakdown} onChange={(v) => setJson("pipeline", "stageBreakdown", v)} />
          </TabsContent>

          <TabsContent value="ads" className="space-y-3">
            <Field label="Total Ad Spend ($)" value={draft.ads.totalAdSpend} onChange={(v) => setA("totalAdSpend", v)} />
            <Field label="Total Leads"        value={draft.ads.totalLeads}   onChange={(v) => setA("totalLeads", v)} />
            <Field label="Cost Per Lead ($)"  value={draft.ads.cpl}          onChange={(v) => setA("cpl", v)} />
            <Field label="ROAS"               value={draft.ads.roas}         onChange={(v) => setA("roas", v)} />
            <Field label="CTR %"              value={draft.ads.ctr}          onChange={(v) => setA("ctr", v)} />
            <Field label="CPC ($)"            value={draft.ads.cpc}          onChange={(v) => setA("cpc", v)} />
            <Field label="Impressions"        value={draft.ads.impressions}  onChange={(v) => setA("impressions", v)} />
            <Field label="Reach"              value={draft.ads.reach}        onChange={(v) => setA("reach", v)} />
            <Field label="Instagram CPL ($)"  value={draft.ads.instaCPL}     onChange={(v) => setA("instaCPL", v)} />
            <JsonField label='Leads Over Time — [{"date":"","leads":0}]' value={draft.ads.leadsOverTime} onChange={(v) => setJson("ads", "leadsOverTime", v)} />
            <JsonField label='Leads by Campaign — [{"campaign":"","leads":0}]' value={draft.ads.leadsByCampaign} onChange={(v) => setJson("ads", "leadsByCampaign", v)} />
            <JsonField label='Top Ads — [{"name":"","leads":0,"cpl":0,"roas":0}]' value={draft.ads.topAds} onChange={(v) => setJson("ads", "topAds", v)} />
          </TabsContent>

          <TabsContent value="reps" className="space-y-3">
            <Field label="Cash Collected (Week)" value={draft.reps.cashCollectedWeek} onChange={(v) => setR("cashCollectedWeek", v)} />
            <Field label="Deal Close"            value={draft.reps.dealClose}         onChange={(v) => setR("dealClose", v)} />
            <Field label="Calls Made (Week)"     value={draft.reps.callsMadeWeek}     onChange={(v) => setR("callsMadeWeek", v)} />
            <Field label="Rate Of"               value={draft.reps.rateOf}            onChange={(v) => setR("rateOf", v)} />
            <Field label="Close Rate % (Week)"   value={draft.reps.closeRateWeek}     onChange={(v) => setR("closeRateWeek", v)} />
            <Field label="Top Rep Cash ($)"      value={draft.reps.topRepCash}        onChange={(v) => setR("topRepCash", v)} />
            <Field label="Show Rate %"           value={draft.reps.showRatePct}       onChange={(v) => setR("showRatePct", v)} />
            <Field label="Close Rate %"          value={draft.reps.closeRatePct}      onChange={(v) => setR("closeRatePct", v)} />
            <Field label="Avg Deal Size ($)"     value={draft.reps.avgDealSize}       onChange={(v) => setR("avgDealSize", v)} />
            <JsonField
              label='Rep Leaderboard — [{"name":"","callsMade":0,"callsAnswered":0,"demosSet":0,"demosShowed":0,"pitched":0,"dealsClosed":0,"cashCollected":0,"answerRate":0}]'
              value={draft.reps.leaderboard}
              onChange={(v) => setJson("reps", "leaderboard", v)} />
          </TabsContent>
        </Tabs>

        <div className="mt-6 flex gap-2 pb-4">
          <AnimatePresence mode="wait">
            <motion.div key={saved ? "saved" : "save"} className="flex-1"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Button className="w-full font-semibold" onClick={handleSave}
                style={{ background: saved ? "#22c55e" : "#f97316", color: "white" }}>
                {saved ? "Saved!" : "Save Changes"}
              </Button>
            </motion.div>
          </AnimatePresence>
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
