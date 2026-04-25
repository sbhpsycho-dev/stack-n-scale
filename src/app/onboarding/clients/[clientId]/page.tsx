"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ExternalLink, Loader2, ArrowLeft } from "lucide-react";
import type { CoachingClient } from "@/lib/coaching-types";
import { STATUS_LABELS } from "@/lib/coaching-types";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
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

type FormResponse = {
  name: string;
  email: string;
  motivation: string;
  whySNS: string;
  goal30Days: string;
  goal3Months: string;
  goal6Months: string;
  goal1Year: string;
  biggestChallenge: string;
  successIn90Days: string;
  additionalNotes?: string;
  submittedAt: string;
  signature?: string | null;
};

type IdSubmission = {
  name: string;
  email: string;
  submittedAt: string;
  consentGiven: boolean;
  hasSig: boolean;
  signature?: string | null;
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p>
      <p className="text-sm mt-0.5">{value || <span className="text-muted-foreground/50 italic">—</span>}</p>
    </div>
  );
}

function ResponseField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-orange-400/80 font-semibold">{label}</p>
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export default function ClientDetail() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const email = decodeURIComponent(params.clientId as string);
  const [client, setClient] = useState<CoachingClient | null>(null);
  const [formResponse, setFormResponse] = useState<FormResponse | null>(null);
  const [idSubmission, setIdSubmission] = useState<IdSubmission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && session?.user?.role !== "admin") { router.push("/"); return; }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/onboarding/clients")
        .then((r) => r.json())
        .then((d: CoachingClient[]) => (Array.isArray(d) ? d : []).find((c) => c.email === email) ?? null),
      fetch(`/api/onboarding/form-response?email=${encodeURIComponent(email)}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/onboarding/id-submission?email=${encodeURIComponent(email)}`)
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([found, form, idSub]) => {
      setClient(found);
      setFormResponse(form);
      setIdSubmission(idSub);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [status, email]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Client not found.</p>
        <Link href="/onboarding/clients" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
          ← Back
        </Link>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[client.status as keyof typeof STATUS_LABELS] ?? client.status;
  const statusCls = STATUS_COLORS[client.status] ?? "bg-muted text-muted-foreground border-border";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/onboarding/clients"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 px-2 text-muted-foreground")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
            <span className="font-bold text-sm">{client.name}</span>
            <Badge className={`text-[10px] ${statusCls}`}>{statusLabel}</Badge>
          </div>
          {client.driveFolder && (
            <a
              href={client.driveFolder.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 text-xs border-orange-500/40 text-orange-400 hover:bg-orange-500/10 h-8"
              )}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Drive Folder
            </a>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Email" value={client.email} />
            <Field label="Phone" value={client.phone} />
            <Field label="Joined" value={new Date(client.createdAt).toLocaleDateString()} />
            <Field label="GHL Contact ID" value={client.ghlContactId} />
            <Field label="Coach" value={client.coachAssigned} />
            <Field label="Active Since" value={client.activeDate ? new Date(client.activeDate).toLocaleDateString() : undefined} />
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Onboarding Progress</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {client.idVerification === "rejected" && client.rejectionReason && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 mb-1">
                <p className="text-[10px] uppercase tracking-widest text-red-400 font-semibold mb-1">ID Rejected</p>
                <p className="text-xs text-red-300/80">{client.rejectionReason}</p>
              </div>
            )}
            {[
              { label: "Payment", done: true },
              { label: "ID Verification", done: client.idVerification === "approved" },
              { label: "Drive Folder Created", done: !!client.driveFolder },
              { label: "Onboarding Form", done: ["onboarding_complete", "coach_assigned", "kickoff_booked", "active", "alumni"].includes(client.status) },
              { label: "Coach Assigned", done: !!client.coachAssigned },
              { label: "Kickoff Booked", done: ["kickoff_booked", "active", "alumni"].includes(client.status) },
              { label: "Active", done: ["active", "alumni"].includes(client.status) },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full shrink-0 ${done ? "bg-emerald-400" : "bg-border"}`} />
                <p className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</p>
                {done && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] ml-auto">Done</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ID Verification Submission */}
        {idSubmission ? (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Identity Verification Submission</CardTitle>
              <span className="text-[10px] text-muted-foreground">
                Submitted {new Date(idSubmission.submittedAt).toLocaleDateString()}
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-xs text-muted-foreground">Consent confirmed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${idSubmission.hasSig ? "bg-emerald-400" : "bg-border"}`} />
                  <span className="text-xs text-muted-foreground">Signature {idSubmission.hasSig ? "on file" : "not provided"}</span>
                </div>
              </div>
              {idSubmission.signature && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-orange-400/80 font-semibold mb-2">Signature</p>
                  <div className="rounded border border-border bg-black/40 p-3 inline-block">
                    <img src={idSubmission.signature} alt="Client signature" className="max-h-24 w-auto" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No ID verification submitted yet.</p>
            </CardContent>
          </Card>
        )}

        {/* Onboarding Form Responses */}
        {formResponse ? (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Onboarding Questionnaire</CardTitle>
              <span className="text-[10px] text-muted-foreground">
                Submitted {new Date(formResponse.submittedAt).toLocaleDateString()}
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-5">
              <ResponseField label="What motivated you to get started?" value={formResponse.motivation} />
              <ResponseField label="Why Stack N Scale Enterprises?" value={formResponse.whySNS} />
              <div className="border-t border-border/40 pt-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Goals</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ResponseField label="30-Day Goal" value={formResponse.goal30Days} />
                  <ResponseField label="3-Month Goal" value={formResponse.goal3Months} />
                  <ResponseField label="6-Month Goal" value={formResponse.goal6Months} />
                  <ResponseField label="1-Year Goal" value={formResponse.goal1Year} />
                </div>
              </div>
              <ResponseField label="Biggest Challenge" value={formResponse.biggestChallenge} />
              <ResponseField label="Success in 90 Days" value={formResponse.successIn90Days} />
              {formResponse.additionalNotes && (
                <ResponseField label="Additional Notes" value={formResponse.additionalNotes} />
              )}
              {formResponse.signature && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-orange-400/80 font-semibold mb-2">Signature</p>
                  <div className="rounded border border-border bg-black/40 p-3 inline-block">
                    <img src={formResponse.signature} alt="Client signature" className="max-h-24 w-auto" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No onboarding questionnaire submitted yet.</p>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card border-border">
          <CardContent className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">GHL Contact Record</p>
              <p className="text-xs text-muted-foreground mt-0.5">Full history, workflow activity, and form submissions</p>
            </div>
            <a
              href={`https://app.gohighlevel.com/contacts/detail/${client.ghlContactId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs border-border h-8")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in GHL
            </a>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
