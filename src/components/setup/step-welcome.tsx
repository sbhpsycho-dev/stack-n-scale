import { TrendingUp, BarChart3, Megaphone, Users, Plug } from "lucide-react";
import { StepNav } from "./step-nav";

const steps = [
  { icon: BarChart3,  label: "Dashboard KPIs",  desc: "Revenue, leads, MRR" },
  { icon: TrendingUp, label: "Pipeline",         desc: "Calls, demos, closes" },
  { icon: Megaphone,  label: "Ads",              desc: "Meta & Instagram metrics" },
  { icon: Users,      label: "Sales Reps",       desc: "Leaderboard performance" },
  { icon: Plug,       label: "Integrations",     desc: "Auto-sync from your tools" },
];

interface StepWelcomeProps {
  name: string;
  onContinue: () => void;
}

export function StepWelcome({ name, onContinue }: StepWelcomeProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Welcome, {name} 👋</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Let&apos;s set up your dashboard. We&apos;ll walk through your key metrics and then connect your tools for automatic updates.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {steps.map(({ icon: Icon, label, desc }, i) => (
          <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Step {i + 2} — {label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <StepNav step={0} totalSteps={6} onBack={() => {}} onContinue={onContinue} />
    </div>
  );
}
