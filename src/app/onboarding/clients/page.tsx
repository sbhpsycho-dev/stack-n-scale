"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { CoachingClient, CoachingStatus } from "@/lib/coaching-types";
import { STATUS_ORDER, STATUS_LABELS } from "@/lib/coaching-types";
import { cn } from "@/lib/utils";

function daysInStage(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

const STATUS_COLORS: Record<CoachingStatus, string> = {
  payment_received: "border-blue-500/30",
  id_pending: "border-yellow-500/30",
  id_pending_review: "border-orange-500/30",
  id_verified: "border-emerald-500/30",
  onboarding_form_sent: "border-blue-500/30",
  onboarding_complete: "border-emerald-500/30",
  coach_assigned: "border-purple-500/30",
  kickoff_booked: "border-purple-500/30",
  active: "border-emerald-500/30",
  alumni: "border-border",
};

export default function ClientsPipeline() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<CoachingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [retryResult, setRetryResult] = useState<Record<string, "ok" | "err">>({});

  async function retryUpload(e: React.MouseEvent, email: string) {
    e.preventDefault();
    e.stopPropagation();
    setRetrying((r) => ({ ...r, [email]: true }));
    try {
      const res = await fetch("/api/onboarding/retry-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setRetryResult((r) => ({ ...r, [email]: data.ok ? "ok" : "err" }));
    } catch {
      setRetryResult((r) => ({ ...r, [email]: "err" }));
    } finally {
      setRetrying((r) => ({ ...r, [email]: false }));
    }
  }

  const FORM_SUBMITTED_STATUSES: CoachingStatus[] = [
    "onboarding_complete", "coach_assigned", "kickoff_booked", "active", "alumni",
  ];

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && session?.user?.role !== "admin") { router.push("/"); return; }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/onboarding/clients")
      .then((r) => r.json())
      .then((d) => { setClients(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [status]);

  const grouped = STATUS_ORDER.reduce<Record<CoachingStatus, CoachingClient[]>>((acc, s) => {
    acc[s] = clients.filter((c) => c.status === s);
    return acc;
  }, {} as Record<CoachingStatus, CoachingClient[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-full mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-wide">Stack N Scale</span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
              Client Pipeline
            </Badge>
          </div>
          <Link
            href="/onboarding"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs text-muted-foreground hover:text-foreground h-8 px-3")}
          >
            ← Onboarding
          </Link>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          {STATUS_ORDER.map((stage) => {
            const stageClients = grouped[stage];
            return (
              <div key={stage} className="w-52 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold truncate">
                    {STATUS_LABELS[stage]}
                  </p>
                  {stageClients.length > 0 && (
                    <Badge className="bg-muted text-muted-foreground border-border text-[10px] ml-1">
                      {stageClients.length}
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {stageClients.length === 0 && (
                    <div className="border border-dashed border-border rounded-lg p-3">
                      <p className="text-[11px] text-muted-foreground/50 text-center">Empty</p>
                    </div>
                  )}
                  {stageClients.map((c) => (
                    <Link key={c.email} href={`/onboarding/clients/${encodeURIComponent(c.email)}`}>
                      <Card className={`bg-card border ${STATUS_COLORS[stage]} hover:bg-muted/20 transition-colors cursor-pointer`}>
                        <CardContent className="px-3 py-3 space-y-2">
                          <p className="text-xs font-semibold leading-tight truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-muted-foreground">
                              {daysInStage(c.createdAt)}d in pipeline
                            </p>
                            <div className="flex items-center gap-1.5">
                              {FORM_SUBMITTED_STATUSES.includes(stage) && (
                                <button
                                  onClick={(e) => retryUpload(e, c.email)}
                                  title="Retry Drive upload"
                                  className={cn(
                                    "transition-colors",
                                    retryResult[c.email] === "ok" ? "text-emerald-400" :
                                    retryResult[c.email] === "err" ? "text-red-400" :
                                    "text-muted-foreground hover:text-orange-400"
                                  )}
                                >
                                  <RefreshCw className={cn("h-3 w-3", retrying[c.email] && "animate-spin")} />
                                </button>
                              )}
                              {c.driveFolder && (
                                <a
                                  href={c.driveFolder.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-orange-400 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
