"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

const WEEKS = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 6", "Week 7", "Week 8", "Week 9", "Week 10", "Week 11", "Week 12+"];
const GOAL_OPTIONS = ["Yes, all of them", "Most of them", "Some of them", "No"];
const HOURS_OPTIONS = ["Less than 2 hours", "2–5 hours", "5–10 hours", "10+ hours"];

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-zinc-200 mb-1.5">
      {children}{required && <span className="text-orange-500 ml-0.5">*</span>}
    </label>
  );
}

function Input({ name, placeholder, required, type = "text" }: {
  name: string; placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <input
      name={name}
      type={type}
      required={required}
      placeholder={placeholder}
      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500
                 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40 transition-colors"
    />
  );
}

function Textarea({ name, placeholder, required, rows = 3 }: {
  name: string; placeholder?: string; required?: boolean; rows?: number;
}) {
  return (
    <textarea
      name={name}
      rows={rows}
      required={required}
      placeholder={placeholder}
      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none
                 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40 transition-colors"
    />
  );
}

function Select({ name, options, required, placeholder }: {
  name: string; options: string[]; required?: boolean; placeholder?: string;
}) {
  return (
    <select
      name={name}
      required={required}
      defaultValue=""
      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-100
                 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40 transition-colors"
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ScoreSelect({ name, required }: { name: string; required?: boolean }) {
  return (
    <select
      name={name}
      required={required}
      defaultValue=""
      className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-100
                 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/40 transition-colors"
    >
      <option value="" disabled>Select a score</option>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <option key={n} value={n}>
          {n} — {n <= 3 ? "Struggling" : n <= 5 ? "Below expectations" : n <= 7 ? "Average" : n <= 9 ? "Good" : "Excellent"}
        </option>
      ))}
    </select>
  );
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-4 pl-9">{children}</div>
    </div>
  );
}

export default function CheckInPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    const data = Object.fromEntries(new FormData(e.currentTarget));

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong");
      }
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Check-in submitted!</h1>
          <p className="text-zinc-400 text-sm">Thanks for taking the time. Evan and your coach have been notified. Keep pushing — you got this.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-block px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-semibold mb-3">
            Stack N Scale
          </div>
          <h1 className="text-2xl font-bold text-white">Weekly Check-In</h1>
          <p className="text-zinc-400 text-sm mt-1">Takes 3–5 minutes. Helps us catch issues early and support you better.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1 */}
          <Section number={1} title="This Week">
            <div>
              <Label required>Full Name</Label>
              <Input name="fullName" placeholder="Your full name" required />
            </div>
            <div>
              <Label required>What week of the program are you on?</Label>
              <Select name="programWeek" options={WEEKS} required placeholder="Select week…" />
            </div>
            <div>
              <Label required>Did you complete your goals from last week?</Label>
              <Select name="goalsCompleted" options={GOAL_OPTIONS} required placeholder="Select one…" />
            </div>
            <div>
              <Label required>What went well this week?</Label>
              <Textarea name="wentWell" placeholder="Share your wins, no matter how small…" required rows={3} />
            </div>
            <div>
              <Label required>What did you struggle with or get stuck on?</Label>
              <Textarea name="struggled" placeholder="Be honest — this is how we help you…" required rows={3} />
            </div>
            <div>
              <Label required>How many hours did you put into the program this week?</Label>
              <Select name="hoursWorked" options={HOURS_OPTIONS} required placeholder="Select range…" />
            </div>
          </Section>

          <div className="border-t border-zinc-800" />

          {/* Section 2 */}
          <Section number={2} title="Program Feedback">
            <div>
              <Label required>How satisfied are you with the program right now? (1–10)</Label>
              <ScoreSelect name="satisfactionScore" required />
              <p className="text-xs text-zinc-500 mt-1.5">Scores 7 or below will be flagged immediately to Evan.</p>
            </div>
            <div>
              <Label required>What&apos;s one thing we could do better to support you?</Label>
              <Textarea name="couldDoBetter" placeholder="Be specific — your feedback directly shapes the program…" required rows={3} />
            </div>
            <div>
              <Label>Is there anything in the curriculum missing or that needs more depth? (optional)</Label>
              <Textarea name="curriculumGaps" placeholder="Any topics, modules, or resources you wish existed…" rows={2} />
            </div>
          </Section>

          <div className="border-t border-zinc-800" />

          {/* Section 3 */}
          <Section number={3} title="Activity Numbers">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Calls or DMs sent</Label>
                <Input name="dmsSent" type="number" placeholder="0" />
              </div>
              <div>
                <Label>Conversations opened</Label>
                <Input name="conversationsOpened" type="number" placeholder="0" />
              </div>
              <div>
                <Label>Zooms or calls booked</Label>
                <Input name="callsBooked" type="number" placeholder="0" />
              </div>
            </div>
          </Section>

          <div className="border-t border-zinc-800" />

          {/* Section 4 */}
          <Section number={4} title="Next Week">
            <div>
              <Label required>What are your top 3 goals for next week?</Label>
              <Textarea name="nextWeekGoals" placeholder={"1. \n2. \n3. "} required rows={4} />
            </div>
            <div>
              <Label required>What do you need from Evan or your coach this week?</Label>
              <Textarea name="needFromCoach" placeholder="Be specific — support, feedback, accountability, a call…" required rows={3} />
            </div>
            <div>
              <Label>Anything else you want Evan to know? (optional)</Label>
              <Textarea name="anythingElse" placeholder="Open floor…" rows={2} />
            </div>
          </Section>

          {status === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed
                       text-white font-semibold text-sm transition-colors"
          >
            {status === "submitting" ? "Submitting…" : "Submit Check-In"}
          </button>
        </form>
      </div>
    </div>
  );
}
