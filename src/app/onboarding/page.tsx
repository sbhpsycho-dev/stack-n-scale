"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Users, ShieldCheck, ClipboardList, Zap, ArrowRight, Loader2 } from "lucide-react";
import type { CoachingClient } from "@/lib/coaching-types";
import { cn } from "@/lib/utils";

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function OnboardingDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<CoachingClient[]>([]);
  const [loading, setLoading] = useState(true);

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

  const active = clients.filter((c) => c.status === "active").length;
  const pendingVerification = clients.filter((c) => c.idVerification === "submitted").length;
  const pendingOnboarding = clients.filter((c) => c.status === "onboarding_form_sent").length;
  const recentActivity = clients.slice(0, 5);

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-wide">Stack N Scale</span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
              Onboarding
            </Badge>
          </div>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs text-muted-foreground hover:text-foreground h-8 px-3")}
          >
            ← Sales Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Clients", value: clients.length, icon: Users, color: "text-foreground" },
            { label: "Pending ID Review", value: pendingVerification, icon: ShieldCheck, color: pendingVerification > 0 ? "text-orange-400" : "text-foreground" },
            { label: "Awaiting Onboarding Form", value: pendingOnboarding, icon: ClipboardList, color: "text-foreground" },
            { label: "Active Clients", value: active, icon: Zap, color: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="bg-card border-border">
              <CardContent className="px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className={`border cursor-pointer hover:bg-muted/30 transition-colors ${pendingVerification > 0 ? "border-orange-500/30 bg-orange-500/5" : "border-border"}`}>
            <CardContent className="px-4 py-4">
              <Link href="/onboarding/verification" className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">ID Verification Queue</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingVerification > 0
                      ? `${pendingVerification} submission${pendingVerification > 1 ? "s" : ""} waiting for review`
                      : "No pending submissions"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {pendingVerification > 0 && (
                    <Badge className="bg-orange-500 text-white border-0 text-xs">{pendingVerification}</Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="border border-border cursor-pointer hover:bg-muted/30 transition-colors">
            <CardContent className="px-4 py-4">
              <Link href="/onboarding/clients" className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Client Pipeline</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {clients.length} total clients across all stages
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Recent Clients</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients yet. They appear here when a Stripe payment clears.</p>
            ) : (
              <div className="space-y-0">
                {recentActivity.map((c) => (
                  <Link
                    key={c.email}
                    href={`/onboarding/clients/${encodeURIComponent(c.email)}`}
                    className="flex items-center justify-between py-3 border-b border-border/40 last:border-0 hover:bg-muted/20 -mx-4 px-4 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email} · {daysAgo(c.createdAt)}d ago</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    payment_received: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    id_pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    id_pending_review: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    id_verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    onboarding_form_sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    onboarding_complete: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    coach_assigned: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    kickoff_booked: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    alumni: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<string, string> = {
    payment_received: "Payment Received",
    id_pending: "ID Pending",
    id_pending_review: "ID In Review",
    id_verified: "ID Verified",
    onboarding_form_sent: "Onboarding Sent",
    onboarding_complete: "Onboarding Done",
    coach_assigned: "Coach Assigned",
    kickoff_booked: "Kickoff Booked",
    active: "Active",
    alumni: "Alumni",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  return <Badge className={`text-[10px] ${cls}`}>{labels[status] ?? status}</Badge>;
}
