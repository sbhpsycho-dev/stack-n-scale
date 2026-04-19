const STEPS = ["Welcome", "Dashboard", "Pipeline", "Ads", "Reps", "Integrations"];

export function ProgressBar({ step }: { step: number }) {
  return (
    <div className="w-full mb-6">
      <div className="flex justify-between mb-2">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`text-[10px] font-medium transition-colors ${
              i <= step ? "text-orange-400" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 text-right">
        Step {step + 1} of {STEPS.length}
      </p>
    </div>
  );
}
