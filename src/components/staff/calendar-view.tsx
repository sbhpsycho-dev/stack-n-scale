"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type StaffCalendarEvent } from "@/lib/staff-types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

interface Props {
  events: StaffCalendarEvent[];
}

export function CalendarView({ events }: Props) {
  const today = new Date();
  const [current, setCurrent] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<StaffCalendarEvent | null>(null);

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete final row
  while (cells.length % 7 !== 0) cells.push(null);

  function eventsOnDay(day: number) {
    const d = new Date(year, month, day);
    return events.filter((e) => isSameDay(new Date(e.start), d));
  }

  function prev() { setCurrent(new Date(year, month - 1, 1)); }
  function next() { setCurrent(new Date(year, month + 1, 1)); }

  return (
    <div className="flex gap-4 h-full">
      {/* Calendar grid */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">{MONTHS[month]} {year}</h2>
          <div className="flex items-center gap-1">
            <button onClick={prev} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="h-7 px-2.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors"
            >
              Today
            </button>
            <button onClick={next} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="bg-background min-h-[80px]" />;
            const dayEvents = eventsOnDay(day);
            const isToday = isSameDay(new Date(year, month, day), today);
            return (
              <div
                key={day}
                className="bg-background min-h-[80px] p-1.5 cursor-default"
              >
                <div className={cn(
                  "text-xs font-semibold h-5 w-5 flex items-center justify-center rounded-full mb-1",
                  isToday ? "bg-orange-500 text-white" : "text-foreground"
                )}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setSelected(e)}
                      className={cn(
                        "w-full text-left text-[10px] px-1 py-0.5 rounded truncate font-medium",
                        e.source === "google"
                          ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                          : "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                      )}
                    >
                      {e.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="h-2.5 w-2.5 rounded-sm bg-blue-500/50" /> Google Calendar
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="h-2.5 w-2.5 rounded-sm bg-orange-500/50" /> Outlook Calendar
          </div>
        </div>
      </div>

      {/* Event detail panel */}
      {selected && (
        <div className="w-64 shrink-0 border border-border rounded-xl p-4 bg-card space-y-3 h-fit">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">{selected.title}</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>{new Date(selected.start).toLocaleString()}</p>
            {selected.end && <p>→ {new Date(selected.end).toLocaleString()}</p>}
          </div>
          {selected.location && (
            <p className="text-xs text-foreground">{selected.location}</p>
          )}
          {selected.description && (
            <p className="text-xs text-muted-foreground line-clamp-4">{selected.description}</p>
          )}
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "h-2 w-2 rounded-full",
              selected.source === "google" ? "bg-blue-500" : "bg-orange-500"
            )} />
            <span className="text-[11px] text-muted-foreground capitalize">{selected.source}</span>
          </div>
        </div>
      )}
    </div>
  );
}
