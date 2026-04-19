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

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`bg-muted border-border h-9 text-sm ${suffix ? "pr-8" : ""}`}
          placeholder="0"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{suffix}</span>}
      </div>
    </div>
  );
}

function setP(draft: SalesData, key: keyof SalesData["pipeline"], val: number): SalesData {
  return { ...draft, pipeline: { ...draft.pipeline, [key]: val } };
}

export function StepPipeline({ draft, onChange, onBack, onContinue, onSkip }: Props) {
  const p = draft.pipeline;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight">Pipeline Metrics</h2>
        <p className="text-muted-foreground mt-1 text-sm">Your sales funnel numbers for this month.</p>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Funnel Activity</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calls Made" value={p.callsMade} onChange={(v) => onChange(setP(draft, "callsMade", v))} />
            <Field label="Calls Answered" value={p.callsAnswered} onChange={(v) => onChange(setP(draft, "callsAnswered", v))} />
            <Field label="Demos Set" value={p.demosSet} onChange={(v) => onChange(setP(draft, "demosSet", v))} />
            <Field label="Demos Showed" value={p.demosShowed} onChange={(v) => onChange(setP(draft, "demosShowed", v))} />
            <Field label="Pitched" value={p.pitched} onChange={(v) => onChange(setP(draft, "pitched", v))} />
            <Field label="Closed" value={p.closed} onChange={(v) => onChange(setP(draft, "closed", v))} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-3">Conversion Rates</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Answer Rate" suffix="%" value={p.answerRate} onChange={(v) => onChange(setP(draft, "answerRate", v))} />
            <Field label="Show Rate" suffix="%" value={p.showRate} onChange={(v) => onChange(setP(draft, "showRate", v))} />
            <Field label="Close Rate" suffix="%" value={p.closeRate} onChange={(v) => onChange(setP(draft, "closeRate", v))} />
            <Field label="Demo to Close" suffix="%" value={p.demoToClose} onChange={(v) => onChange(setP(draft, "demoToClose", v))} />
          </div>
        </div>
      </div>

      <StepNav step={2} totalSteps={6} onBack={onBack} onContinue={onContinue} onSkip={onSkip} />
    </div>
  );
}
