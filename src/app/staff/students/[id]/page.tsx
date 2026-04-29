"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { type CoachingClient, type StudentProgress, STATUS_ORDER, STATUS_LABELS, type CoachingStatus } from "@/lib/coaching-types";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, ExternalLink, CheckCircle2, Circle, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Detail = CoachingClient & { progress: StudentProgress | null };

const STATUS_COLORS: Record<CoachingStatus, string> = {
  payment_received:    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  id_pending:          "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  id_pending_review:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  id_verified:         "bg-blue-500/10 text-blue-400 border-blue-500/20",
  onboarding_form_sent:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  onboarding_complete: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  coach_assigned:      "bg-orange-500/10 text-orange-400 border-orange-500/20",
  kickoff_booked:      "bg-orange-500/10 text-orange-400 border-orange-500/20",
  active:              "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  alumni:              "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
};

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/staff/students/${id}`);
    if (res.ok) setDetail(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function addNote() {
    if (!note.trim() || saving) return;
    setSaving(true);
    await fetch(`/api/staff/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setNote("");
    await load();
    setSaving(false);
  }

  async function advanceStatus(status: CoachingStatus) {
    await fetch(`/api/staff/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  if (!detail) {
    return <p className="text-sm text-muted-foreground text-center py-16">Student not found</p>;
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(detail.status as CoachingStatus);
  const progressPct = currentStatusIndex >= 0 ? Math.round(((currentStatusIndex + 1) / STATUS_ORDER.length) * 100) : 0;
  const statusColor = STATUS_COLORS[detail.status as CoachingStatus] ?? "bg-zinc-500/10 text-zinc-400";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/staff/students" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Students
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{detail.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{detail.email} {detail.phone && `· ${detail.phone}`}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={cn("text-[10px]", statusColor)}>
            {STATUS_LABELS[detail.status as CoachingStatus] ?? detail.status}
          </Badge>
          {detail.driveFolder?.url && (
            <a href={detail.driveFolder.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
              Drive <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Pipeline progress</span><span>{progressPct}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Milestone checklist */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold mb-3">Milestones</h2>
          {STATUS_ORDER.map((s, i) => {
            const done = i <= currentStatusIndex;
            const isCurrent = i === currentStatusIndex;
            const isNext = i === currentStatusIndex + 1;
            return (
              <button
                key={s}
                onClick={() => isNext ? advanceStatus(s) : undefined}
                disabled={!isNext}
                className={cn(
                  "w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left transition-colors",
                  isNext && "hover:bg-orange-500/10 cursor-pointer",
                  !isNext && "cursor-default"
                )}
              >
                {done ? (
                  <CheckCircle2 className={cn("h-4 w-4 shrink-0", isCurrent ? "text-orange-400" : "text-emerald-400")} />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn("text-xs", done ? "text-foreground" : "text-muted-foreground")}>
                  {STATUS_LABELS[s]}
                </span>
                {isNext && (
                  <span className="ml-auto text-[10px] text-orange-400 font-medium">Advance →</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Info + Notes */}
        <div className="space-y-4">
          {/* Info */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold">Details</h2>
            {[
              { label: "Coach", value: detail.coachAssigned ?? "Unassigned" },
              { label: "Started", value: detail.activeDate ? new Date(detail.activeDate).toLocaleDateString() : "—" },
              { label: "Created", value: new Date(detail.createdAt).toLocaleDateString() },
              { label: "ID Verification", value: detail.idVerification },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Progress Notes */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold">Progress Notes</h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(detail.progress?.notes ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No notes yet</p>
              ) : (
                detail.progress!.notes.slice().reverse().map((n, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-muted rounded-lg p-2.5 space-y-1"
                  >
                    <p className="text-xs text-foreground">{n.text}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {n.author} · {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </motion.div>
                ))
              )}
            </div>
            <Separator />
            <div className="flex gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-orange-500/50"
              />
              <button
                onClick={addNote}
                disabled={!note.trim() || saving}
                className="h-8 w-8 self-end shrink-0 flex items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
