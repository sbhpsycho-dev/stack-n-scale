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

function Field({ label, value, onChange, prefix, suffix }: { label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>}
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`bg-muted border-border h-9 text-sm ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`}
          placeholder="0"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

function setA(draft: SalesData, key: keyof SalesData["ads"], val: number): SalesData {
  return { ...draft, ads: { ...draft.ads, [key]: val } };
}

export function StepAds({ draft, onChange, onBack, onContinue, onSkip }: Props) {
  const a = draft.ads;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight">Ad Metrics</h2>
        <p className="text-muted-foreground mt-1 text-sm">Facebook and Instagram advertising performance.</p>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Facebook Ads</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total Ad Spend" prefix="$" value={a.totalAdSpend} onChange={(v) => onChange(setA(draft, "totalAdSpend", v))} />
            <Field label="Total Leads" value={a.totalLeads} onChange={(v) => onChange(setA(draft, "totalLeads", v))} />
            <Field label="Cost Per Lead" prefix="$" value={a.cpl} onChange={(v) => onChange(setA(draft, "cpl", v))} />
            <Field label="ROAS" suffix="x" value={a.roas} onChange={(v) => onChange(setA(draft, "roas", v))} />
            <Field label="CTR" suffix="%" value={a.ctr} onChange={(v) => onChange(setA(draft, "ctr", v))} />
            <Field label="CPC" prefix="$" value={a.cpc} onChange={(v) => onChange(setA(draft, "cpc", v))} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Instagram</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Impressions" value={a.impressions} onChange={(v) => onChange(setA(draft, "impressions", v))} />
            <Field label="Reach" value={a.reach} onChange={(v) => onChange(setA(draft, "reach", v))} />
            <Field label="Instagram CPL" prefix="$" value={a.instaCPL} onChange={(v) => onChange(setA(draft, "instaCPL", v))} />
          </div>
        </div>
      </div>

      <StepNav step={3} totalSteps={6} onBack={onBack} onContinue={onContinue} onSkip={onSkip} />
    </div>
  );
}
