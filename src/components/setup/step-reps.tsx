"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type SalesData, type Rep } from "@/lib/sales-data";
import { StepNav } from "./step-nav";
import { UserPlus, X } from "lucide-react";

interface Props {
  draft: SalesData;
  onChange: (d: SalesData) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

const BLANK_REP: Rep = { name: "", callsMade: 0, callsAnswered: 0, demosSet: 0, demosShowed: 0, pitched: 0, dealsClosed: 0, cashCollected: 0, answerRate: 0 };

function numInput(val: number, onChange: (v: number) => void) {
  return (
    <Input
      type="number"
      value={val || ""}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="bg-muted border-border h-8 text-xs px-2 w-full"
      placeholder="0"
    />
  );
}

export function StepReps({ draft, onChange, onBack, onContinue, onSkip }: Props) {
  const leaderboard = draft.reps.leaderboard;

  function updateRep(i: number, patch: Partial<Rep>) {
    const updated = leaderboard.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    onChange({ ...draft, reps: { ...draft.reps, leaderboard: updated } });
  }

  function addRep() {
    onChange({ ...draft, reps: { ...draft.reps, leaderboard: [...leaderboard, { ...BLANK_REP }] } });
  }

  function removeRep(i: number) {
    onChange({ ...draft, reps: { ...draft.reps, leaderboard: leaderboard.filter((_, idx) => idx !== i) } });
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight">Sales Rep Leaderboard</h2>
        <p className="text-muted-foreground mt-1 text-sm">Add your reps and their monthly performance numbers.</p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-xl text-center gap-2">
          <p className="text-sm text-muted-foreground">No reps added yet</p>
          <Button size="sm" variant="outline" onClick={addRep} className="gap-1.5 mt-1">
            <UserPlus className="h-3.5 w-3.5" /> Add First Rep
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((rep, i) => (
            <div key={i} className="bg-muted/50 border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-3">
                <Input
                  value={rep.name}
                  onChange={(e) => updateRep(i, { name: e.target.value })}
                  placeholder="Rep name"
                  className="bg-muted border-border h-8 text-sm font-medium flex-1"
                />
                <button
                  onClick={() => removeRep(i)}
                  className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Calls Made</p>
                  {numInput(rep.callsMade, (v) => updateRep(i, { callsMade: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Answered</p>
                  {numInput(rep.callsAnswered, (v) => updateRep(i, { callsAnswered: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Demos Set</p>
                  {numInput(rep.demosSet, (v) => updateRep(i, { demosSet: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Showed</p>
                  {numInput(rep.demosShowed, (v) => updateRep(i, { demosShowed: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Pitched</p>
                  {numInput(rep.pitched, (v) => updateRep(i, { pitched: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Closed</p>
                  {numInput(rep.dealsClosed, (v) => updateRep(i, { dealsClosed: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Cash ($)</p>
                  {numInput(rep.cashCollected, (v) => updateRep(i, { cashCollected: v }))}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Answer %</p>
                  {numInput(rep.answerRate, (v) => updateRep(i, { answerRate: v }))}
                </div>
              </div>
            </div>
          ))}

          <Button size="sm" variant="outline" onClick={addRep} className="gap-1.5 w-full">
            <UserPlus className="h-3.5 w-3.5" /> Add Rep
          </Button>
        </div>
      )}

      <StepNav step={4} totalSteps={6} onBack={onBack} onContinue={onContinue} onSkip={onSkip} />
    </div>
  );
}
