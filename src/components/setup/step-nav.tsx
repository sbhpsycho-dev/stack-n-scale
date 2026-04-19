import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, SkipForward } from "lucide-react";

interface StepNavProps {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
  onSkip?: () => void;
  continueLabel?: string;
  loading?: boolean;
}

export function StepNav({ step, totalSteps, onBack, onContinue, onSkip, continueLabel, loading }: StepNavProps) {
  const isLast = step === totalSteps - 1;

  return (
    <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
        {onSkip && !isLast && (
          <Button variant="ghost" size="sm" onClick={onSkip} className="gap-1.5 text-muted-foreground">
            <SkipForward className="h-3.5 w-3.5" /> Skip for now
          </Button>
        )}
      </div>
      <Button
        onClick={onContinue}
        disabled={loading}
        className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
      >
        {loading ? (
          <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
        ) : (
          <>
            {continueLabel ?? (isLast ? "Finish Setup" : "Continue")}
            {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
          </>
        )}
      </Button>
    </div>
  );
}
