"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { type CoachingClient, STATUS_ORDER, STATUS_LABELS, type CoachingStatus } from "@/lib/coaching-types";
import { User, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface Props {
  client: CoachingClient;
  noteCount?: number;
}

export function StudentProgressCard({ client, noteCount = 0 }: Props) {
  const statusIndex = STATUS_ORDER.indexOf(client.status as CoachingStatus);
  const progressPct = statusIndex >= 0 ? Math.round(((statusIndex + 1) / STATUS_ORDER.length) * 100) : 0;
  const statusColor = STATUS_COLORS[client.status as CoachingStatus] ?? "bg-zinc-500/10 text-zinc-400";

  return (
    <Link
      href={`/staff/students/${client.ghlContactId}`}
      className="block bg-card border border-border rounded-xl p-4 hover:border-orange-500/40 transition-colors group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate group-hover:text-orange-400 transition-colors">
              {client.name}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{client.email}</p>
          </div>
        </div>
        <Badge className={cn("text-[10px] shrink-0 ml-2", statusColor)}>
          {STATUS_LABELS[client.status as CoachingStatus] ?? client.status}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{progressPct}% complete</span>
          {client.coachAssigned && <span>Coach: {client.coachAssigned}</span>}
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[10px] text-muted-foreground">
          {noteCount > 0 ? `${noteCount} note${noteCount === 1 ? "" : "s"}` : "No notes"}
        </span>
        {client.driveFolder?.url && (
          <a
            href={client.driveFolder.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-orange-400 transition-colors"
          >
            Drive <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </Link>
  );
}
