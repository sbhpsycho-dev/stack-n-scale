"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import type { CoachingClient } from "@/lib/coaching-types";
import { cn } from "@/lib/utils";

const REJECTION_PRESETS = [
  "Blurry photo — please retake in better lighting",
  "ID not clearly visible — hold it flat and steady",
  "Face not visible in selfie — must show your face holding the ID",
  "Wrong document type — we need a government-issued photo ID",
];

export default function VerificationQueue() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<CoachingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewClient, setReviewClient] = useState<CoachingClient | null>(null);
  const [rejectionNote, setRejectionNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && session?.user?.role !== "admin") { router.push("/"); return; }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/onboarding/clients")
      .then((r) => r.json())
      .then((d: CoachingClient[]) => {
        const queue = (Array.isArray(d) ? d : []).filter((c) => c.idVerification === "submitted");
        setClients(queue);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [status]);

  async function handleAction(email: string, action: "approve" | "reject") {
    setSaving(true);
    await fetch("/api/onboarding/verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action, notes: rejectionNote }),
    });
    setClients((prev) => prev.filter((c) => c.email !== email));
    setReviewClient(null);
    setRejectionNote("");
    setSaving(false);
  }

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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm tracking-wide">Stack N Scale</span>
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
              ID Verification
            </Badge>
            {clients.length > 0 && (
              <Badge className="bg-orange-500 text-white border-0 text-xs">{clients.length}</Badge>
            )}
          </div>
          <Link
            href="/onboarding"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs text-muted-foreground hover:text-foreground h-8 px-3")}
          >
            ← Onboarding
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {clients.length === 0 && !reviewClient ? (
          <Card className="border-border bg-card">
            <CardContent className="px-6 py-12 flex flex-col items-center gap-3 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-400" />
              <p className="font-semibold">Queue is clear</p>
              <p className="text-sm text-muted-foreground">No ID submissions pending review.</p>
            </CardContent>
          </Card>
        ) : reviewClient ? (
          /* ─── Review Panel ─── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base">{reviewClient.name}</h2>
                <p className="text-xs text-muted-foreground">{reviewClient.email}</p>
              </div>
              <button
                onClick={() => { setReviewClient(null); setRejectionNote(""); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to queue
              </button>
            </div>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Submitted Documents</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  The ID verification photos submitted by the client appear in their GHL contact record
                  under the <strong>Identity Verification Form</strong> submission. Open GHL to view the photos,
                  then approve or reject below.
                </p>
                <a
                  href={`https://app.gohighlevel.com/contacts/detail/${reviewClient.ghlContactId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs text-orange-400 hover:text-orange-300"
                >
                  Open in GHL →
                </a>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Rejection reason (required if rejecting)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {REJECTION_PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setRejectionNote(p)}
                      className={`text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                        rejectionNote === p
                          ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                          : "border-border text-muted-foreground hover:border-orange-500/30 hover:text-orange-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  placeholder="Or type a custom rejection reason…"
                  className="text-xs bg-muted border-border h-20 resize-none"
                />
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                disabled={saving}
                onClick={() => handleAction(reviewClient.email, "approve")}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve Verification
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2"
                disabled={saving || !rejectionNote.trim()}
                onClick={() => handleAction(reviewClient.email, "reject")}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </Button>
            </div>
          </div>
        ) : (
          /* ─── Queue Table ─── */
          <div className="space-y-2">
            {clients.map((c) => {
              const hoursAgo = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 3_600_000);
              return (
                <Card key={c.email} className="border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                  <CardContent className="px-4 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email} · submitted ~{hoursAgo}h ago</p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8"
                      onClick={() => setReviewClient(c)}
                    >
                      Review
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
