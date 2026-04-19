import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type SalesData } from "@/lib/sales-data";
import { StepNav } from "./step-nav";

interface Props {
  draft: SalesData;
  onChange: (d: SalesData) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

function Field({ label, value, onChange, prefix }: { label: string; value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>}
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`bg-muted border-border h-9 text-sm ${prefix ? "pl-7" : ""}`}
          placeholder="0"
        />
      </div>
    </div>
  );
}

function setD(draft: SalesData, key: keyof SalesData["dashboard"], val: number): SalesData {
  return { ...draft, dashboard: { ...draft.dashboard, [key]: val } };
}

function setR(draft: SalesData, key: keyof SalesData["dashboard"]["reactivation"], val: number): SalesData {
  return { ...draft, dashboard: { ...draft.dashboard, reactivation: { ...draft.dashboard.reactivation, [key]: val } } };
}

export function StepDashboard({ draft, onChange, onBack, onContinue, onSkip }: Props) {
  const d = draft.dashboard;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight">Dashboard KPIs</h2>
        <p className="text-muted-foreground mt-1 text-sm">Your core monthly performance numbers.</p>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Revenue</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cash Collected MTD" prefix="$" value={d.cashCollectedMTD} onChange={(v) => onChange(setD(draft, "cashCollectedMTD", v))} />
            <Field label="Net Revenue MTD" prefix="$" value={d.netRevenueMTD} onChange={(v) => onChange(setD(draft, "netRevenueMTD", v))} />
            <Field label="MRR" prefix="$" value={d.mrr} onChange={(v) => onChange(setD(draft, "mrr", v))} />
            <Field label="Cash Collected Last Month" prefix="$" value={d.cashCollectedLastMonth} onChange={(v) => onChange(setD(draft, "cashCollectedLastMonth", v))} />
            <Field label="Total Refunds" prefix="$" value={d.totalRefund} onChange={(v) => onChange(setD(draft, "totalRefund", v))} />
            <Field label="Refund %" value={d.totalRefundPct * 100} onChange={(v) => onChange(setD(draft, "totalRefundPct", v / 100))} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Goals & Leads</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly Goal" prefix="$" value={d.monthlyGoal} onChange={(v) => onChange(setD(draft, "monthlyGoal", v))} />
            <Field label="Leads This Month" value={d.leadsThisMonth} onChange={(v) => onChange(setD(draft, "leadsThisMonth", v))} />
            <Field label="Deals Closed MTD" value={d.totalDealsClosedMTD} onChange={(v) => onChange(setD(draft, "totalDealsClosedMTD", v))} />
            <Field label="Cost Per Close" prefix="$" value={d.costPerClose} onChange={(v) => onChange(setD(draft, "costPerClose", v))} />
            <Field label="Avg Lead Response (min)" value={d.avgLeadResponseTimeMin} onChange={(v) => onChange(setD(draft, "avgLeadResponseTimeMin", v))} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Reactivation Campaign</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacted" value={d.reactivation.contacted} onChange={(v) => onChange(setR(draft, "contacted", v))} />
            <Field label="Replied" value={d.reactivation.replied} onChange={(v) => onChange(setR(draft, "replied", v))} />
            <Field label="Booked" value={d.reactivation.booked} onChange={(v) => onChange(setR(draft, "booked", v))} />
            <Field label="Closed" value={d.reactivation.closed} onChange={(v) => onChange(setR(draft, "closed", v))} />
          </div>
        </div>
      </div>

      <StepNav step={1} totalSteps={6} onBack={onBack} onContinue={onContinue} onSkip={onSkip} />
    </div>
  );
}
