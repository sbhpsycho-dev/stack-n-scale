"use client";

import { useState, useEffect } from "react";
import { StudentProgressCard } from "@/components/staff/student-progress-card";
import { type CoachingClient, type StudentProgress, STATUS_ORDER, type CoachingStatus, STATUS_LABELS } from "@/lib/coaching-types";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type ClientWithProgress = CoachingClient & { progress: StudentProgress | null };

export default function StudentsPage() {
  const [clients, setClients] = useState<ClientWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<CoachingStatus | "all">("all");
  const [filterCoach, setFilterCoach] = useState<string>("all");

  useEffect(() => {
    fetch("/api/staff/students")
      .then((r) => r.json())
      .then(setClients)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const coaches = Array.from(new Set(clients.map((c) => c.coachAssigned).filter(Boolean))) as string[];

  const filtered = clients.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchCoach = filterCoach === "all" || c.coachAssigned === filterCoach;
    return matchSearch && matchStatus && matchCoach;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Students</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{clients.length} total · {filtered.length} shown</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students…"
            className="pl-8 h-8 text-xs w-48 bg-muted border-border"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as CoachingStatus | "all")}
          className="h-8 px-2.5 text-xs bg-muted border border-border rounded-lg text-foreground"
        >
          <option value="all">All Statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        {coaches.length > 0 && (
          <select
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
            className="h-8 px-2.5 text-xs bg-muted border border-border rounded-lg text-foreground"
          >
            <option value="all">All Coaches</option>
            {coaches.map((coach) => (
              <option key={coach} value={coach}>{coach}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">No students found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <StudentProgressCard
              key={c.ghlContactId}
              client={c}
              noteCount={c.progress?.notes.length ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
