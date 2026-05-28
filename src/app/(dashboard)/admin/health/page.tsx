"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, RefreshCw, Loader2, Check, X, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriveFailure {
  email: string;
  [key: string]: unknown;
}

interface HealthData {
  status: "healthy" | "degraded";
  checkedAt: string;
  components: {
    driveSync: {
      status: "ok" | "failures";
      failureCount: number;
      failures: DriveFailure[];
      confirmedCount: number;
    };
    sheetsSync: {
      status: "ok";
      syncedCount: number;
    };
    webhooks: {
      stripe:   { lastReceived: string | null };
      fanbasis: { lastReceived: string | null };
      ghl:      { lastReceived: string | null };
      meta:     { lastReceived: string | null };
    };
    makecom: {
      configured: {
        deal:         boolean;
        idSubmit:     boolean;
        verification: boolean;
        payout:       boolean;
        checkin:      boolean;
        onboarding:   boolean;
      };
    };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <Check className="h-3 w-3" />
      {label ?? "OK"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
      <X className="h-3 w-3" />
      {label ?? "Error"}
    </span>
  );
}

function WebhookRow({ name, lastReceived }: { name: string; lastReceived: string | null }) {
  const hasData = !!lastReceived;
  const diffMs  = lastReceived ? Date.now() - new Date(lastReceived).getTime() : Infinity;
  const stale   = diffMs > 1000 * 60 * 60 * 48; // warn if > 48h

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2">
        {!hasData
          ? <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          : stale
          ? <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
          : <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
        <span className="text-sm font-medium capitalize">{name}</span>
      </div>
      <span className={`text-xs ${!hasData ? "text-muted-foreground" : stale ? "text-orange-400" : "text-emerald-400"}`}>
        {fmtTime(lastReceived)}
      </span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [health, setHealth]   = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [retrying, setRetrying]   = useState<string | null>(null);
  const [retryMsg, setRetryMsg]   = useState<Record<string, { ok: boolean; text: string }>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Auth guard
  useEffect(() => {
    if (authStatus === "unauthenticated") { router.replace("/login"); return; }
    if (authStatus === "authenticated" && session.user.role !== "admin") { router.replace("/"); }
  }, [authStatus, session, router]);

  const fetchHealth = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-health");
      if (res.status === 401) { router.replace("/login"); return; }
      if (!res.ok) { setError("Failed to load system health"); return; }
      const data = await res.json() as HealthData;
      setHealth(data);
    } catch {
      setError("Network error — could not reach health API");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  // Initial load + 30-second poll
  useEffect(() => {
    if (authStatus !== "authenticated" || session?.user?.role !== "admin") return;
    fetchHealth();
    const id = setInterval(() => fetchHealth(true), 30_000);
    return () => clearInterval(id);
  }, [authStatus, session, fetchHealth]);

  async function handleRetry(email: string) {
    setRetrying(email);
    setRetryMsg(prev => ({ ...prev, [email]: { ok: false, text: "" } }));
    try {
      const res = await fetch("/api/onboarding/retry-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      setRetryMsg(prev => ({
        ...prev,
        [email]: {
          ok: data.ok,
          text: data.ok ? "Re-upload succeeded" : (data.error ?? "Re-upload failed"),
        },
      }));
      if (data.ok) {
        // Refresh health after 1s so the failure disappears
        setTimeout(() => fetchHealth(true), 1000);
      }
    } catch {
      setRetryMsg(prev => ({ ...prev, [email]: { ok: false, text: "Network error" } }));
    } finally {
      setRetrying(null);
    }
  }

  // ── Loading / error states ──────────────────────────────────────────────────
  if (authStatus === "loading" || (loading && !health)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-3">
        <XCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => fetchHealth()}
          className="h-8 px-4 rounded-lg bg-muted text-xs hover:bg-muted/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!health) return null;

  const { driveSync, sheetsSync, webhooks, makecom } = health.components;
  const makeConfigured = Object.values(makecom.configured);
  const makeOkCount    = makeConfigured.filter(Boolean).length;
  const makeTotal      = makeConfigured.length;

  const MAKE_LABELS: Record<keyof typeof makecom.configured, string> = {
    deal:         "Deal Closed",
    idSubmit:     "ID Submission",
    verification: "Verification",
    payout:       "Payout",
    checkin:      "Check-in Alert",
    onboarding:   "Onboarding Form",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Stack N Scale" width={28} height={28} className="object-contain" />
            <span className="font-bold text-sm tracking-wide">System Health</span>
            {health.status === "healthy"
              ? <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Healthy</Badge>
              : <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">Degraded</Badge>
            }
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              Checked {fmtTime(health.checkedAt)}
            </span>
            <button
              onClick={() => { setRefreshing(true); fetchHealth(); }}
              disabled={refreshing}
              className="h-8 px-3 rounded-lg bg-muted text-xs font-medium flex items-center gap-1.5 hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {refreshing
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              Refresh
            </button>
            <Link
              href="/staff"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Status Overview ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Drive Sync",
              ok: driveSync.status === "ok",
              sub: driveSync.status === "ok"
                ? `${driveSync.confirmedCount} confirmed`
                : `${driveSync.failureCount} failure${driveSync.failureCount !== 1 ? "s" : ""}`,
            },
            {
              label: "Sheets Sync",
              ok: sheetsSync.status === "ok",
              sub: `${sheetsSync.syncedCount} synced`,
            },
            {
              label: "Webhooks",
              ok: Object.values(webhooks).some(w => w.lastReceived !== null),
              sub: `${Object.values(webhooks).filter(w => w.lastReceived !== null).length} / 4 seen`,
            },
            {
              label: "Make.com",
              ok: makeOkCount === makeTotal,
              sub: `${makeOkCount} / ${makeTotal} configured`,
            },
          ].map(({ label, ok, sub }) => (
            <Card key={label} className={`bg-card border ${ok ? "border-border" : "border-red-500/30"}`}>
              <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  {ok
                    ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    : <XCircle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <p className={`text-sm font-semibold ${ok ? "text-foreground" : "text-red-400"}`}>{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Drive Failures ──────────────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Drive Upload Failures
              {driveSync.failureCount > 0
                ? <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">{driveSync.failureCount}</Badge>
                : <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">None</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {driveSync.failures.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No Drive upload failures. All clear.</p>
            ) : (
              <div className="space-y-2">
                {driveSync.failures.map((failure) => {
                  const msg = retryMsg[failure.email];
                  return (
                    <div
                      key={failure.email}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50 border border-border/60"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{failure.email}</p>
                        {msg?.text && (
                          <p className={`text-[11px] mt-0.5 ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
                            {msg.text}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRetry(failure.email)}
                        disabled={retrying === failure.email}
                        className="shrink-0 h-7 px-3 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[11px] font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {retrying === failure.email
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RefreshCw className="h-3 w-3" />}
                        Retry Upload
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Webhook Activity ─────────────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Webhook Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-2">
            <WebhookRow name="Stripe"   lastReceived={webhooks.stripe.lastReceived} />
            <WebhookRow name="Fanbasis" lastReceived={webhooks.fanbasis.lastReceived} />
            <WebhookRow name="GHL"      lastReceived={webhooks.ghl.lastReceived} />
            <WebhookRow name="Meta"     lastReceived={webhooks.meta.lastReceived} />
          </CardContent>
        </Card>

        {/* ── Make.com Scenario Config ─────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Make.com Scenarios
              <span className={`text-[11px] font-normal ${makeOkCount === makeTotal ? "text-emerald-400" : "text-orange-400"}`}>
                {makeOkCount} / {makeTotal} webhooks configured
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.entries(makecom.configured) as [keyof typeof makecom.configured, boolean][]).map(([key, configured]) => (
                <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 border border-border/40">
                  <span className="text-xs font-medium">{MAKE_LABELS[key]}</span>
                  <StatusBadge ok={configured} label={configured ? "Configured" : "Missing"} />
                </div>
              ))}
            </div>
            {makeOkCount < makeTotal && (
              <p className="text-[11px] text-muted-foreground mt-3">
                Missing webhooks require env vars to be set in Vercel (e.g. <code className="bg-muted px-1 rounded">MAKE_DEAL_WEBHOOK_URL</code>).
              </p>
            )}
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
