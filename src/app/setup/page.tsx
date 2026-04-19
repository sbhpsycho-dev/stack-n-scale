"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, CheckCircle2 } from "lucide-react";
import { useSalesData } from "@/hooks/use-sales-data";
import { type ClientIntegrations } from "@/lib/integrations";
import { ProgressBar } from "@/components/setup/progress-bar";
import { StepWelcome } from "@/components/setup/step-welcome";
import { StepDashboard } from "@/components/setup/step-dashboard";
import { StepPipeline } from "@/components/setup/step-pipeline";
import { StepAds } from "@/components/setup/step-ads";
import { StepReps } from "@/components/setup/step-reps";
import { StepIntegrations } from "@/components/setup/step-integrations";

const TOTAL_STEPS = 6;

type SaveState = "idle" | "saving" | "saved";

export default function SetupPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const isAdmin = session?.user?.role === "admin";
  const clientId = isAdmin ? "admin" : (session?.user?.clientId ?? null);
  const clientName = session?.user?.name ?? "there";

  const { data, update, loading } = useSalesData(clientId);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(data);
  const [integrations, setIntegrations] = useState<ClientIntegrations>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect admins away from setup
  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && isAdmin) router.push("/");
  }, [status, isAdmin, router]);

  // Sync draft when remote data first loads
  useEffect(() => {
    if (!loading) setDraft(data);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing integrations
  useEffect(() => {
    if (!clientId || isAdmin) return;
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((d) => { if (d && typeof d === "object") setIntegrations(d); })
      .catch(() => {});
  }, [clientId, isAdmin]);

  // Debounced auto-save on draft changes
  useEffect(() => {
    if (loading) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSaveState("saving");
      update(draft);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveState("saved"), 600);
      setTimeout(() => setSaveState("idle"), 3000);
    }, 800);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() { setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  function finish() {
    update(draft);
    // Mark setup complete so the dashboard doesn't redirect back here
    if (clientId) localStorage.setItem(`sns-setup-done-${clientId}`, "1");
    router.push("/");
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-wide">Stack N Scale</span>
          </div>
          <div className="flex items-center gap-2 h-7">
            <AnimatePresence mode="wait">
              {saveState === "saving" && (
                <motion.span
                  key="saving"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-muted-foreground"
                >
                  Saving…
                </motion.span>
              )}
              {saveState === "saved" && (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-orange-400 flex items-center gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            <button
              onClick={() => router.push("/")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip setup →
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          <ProgressBar step={step} />

          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {step === 0 && <StepWelcome name={clientName} onContinue={next} />}
                {step === 1 && <StepDashboard draft={draft} onChange={setDraft} onBack={back} onContinue={next} onSkip={next} />}
                {step === 2 && <StepPipeline draft={draft} onChange={setDraft} onBack={back} onContinue={next} onSkip={next} />}
                {step === 3 && <StepAds draft={draft} onChange={setDraft} onBack={back} onContinue={next} onSkip={next} />}
                {step === 4 && <StepReps draft={draft} onChange={setDraft} onBack={back} onContinue={next} onSkip={next} />}
                {step === 5 && (
                  <StepIntegrations
                    integrations={integrations}
                    onChange={setIntegrations}
                    onBack={back}
                    onFinish={finish}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
