"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarView } from "@/components/staff/calendar-view";
import { type StaffCalendarEvent } from "@/lib/staff-types";
import { Loader2, RefreshCw, Link as LinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function StaffCalendarPage() {
  const [events, setEvents] = useState<StaffCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const searchParams = useSearchParams();

  async function load() {
    setLoading(true);
    try {
      const [eventsRes, statusRes] = await Promise.all([
        fetch("/api/staff/calendar"),
        fetch("/api/staff/calendar/outlook"),
      ]);
      if (eventsRes.ok) setEvents(await eventsRes.json());
      if (statusRes.ok) {
        const s = await statusRes.json() as { connected: boolean };
        setOutlookConnected(s.connected);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (searchParams.get("connected") === "outlook") setOutlookConnected(true);
  }, []);

  const googleCount = events.filter((e) => e.source === "google").length;
  const outlookCount = events.filter((e) => e.source === "outlook").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Calendar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {googleCount} Google · {outlookCount} Outlook events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!outlookConnected ? (
            <a
              href="/api/staff/calendar/outlook?action=connect"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/20 transition-colors"
            >
              <LinkIcon className="h-3.5 w-3.5" /> Connect Outlook
            </a>
          ) : (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
              Outlook Connected
            </Badge>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : (
        <CalendarView events={events} />
      )}
    </div>
  );
}
