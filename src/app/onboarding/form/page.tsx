"use client";

import { useState, useEffect } from "react";
import { toastError } from "@/lib/toast";

const gold = "#c8902a";
const DRAFT_KEY = "sns-onboarding-draft";

const REQUIRED = [
  "name", "email", "motivation", "whySNS",
  "goal30Days", "goal3Months", "goal6Months", "goal1Year",
  "biggestChallenge", "successIn90Days",
] as const;

const INITIAL = {
  name: "", email: "", motivation: "", whySNS: "",
  goal30Days: "", goal3Months: "", goal6Months: "", goal1Year: "",
  biggestChallenge: "", successIn90Days: "", additionalNotes: "",
};

type FormData = typeof INITIAL;

function Field({ label, name, value, onChange, type = "text", required = true, placeholder = "", showError = false }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string; showError?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = focused ? gold : showError ? "#ef4444" : "#2a2a2a";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold, fontFamily: "Georgia, serif" }}>
        {label}{required && <span style={{ color: "#a09070", marginLeft: 4 }}>*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={{
          background: "#0a0a0a", border: `1px solid ${borderColor}`, borderRadius: 4,
          padding: "12px 14px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia, serif",
          outline: "none", width: "100%", boxSizing: "border-box", transition: "border-color 0.15s",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showError && (
        <span style={{ fontSize: 11, color: "#ef4444", fontFamily: "Georgia, serif" }}>This field is required.</span>
      )}
    </div>
  );
}

function TextArea({ label, name, value, onChange, required = true, placeholder = "", showError = false }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  required?: boolean; placeholder?: string; showError?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = focused ? gold : showError ? "#ef4444" : "#2a2a2a";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold, fontFamily: "Georgia, serif" }}>
        {label}{required && <span style={{ color: "#a09070", marginLeft: 4 }}>*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        rows={4}
        style={{
          background: "#0a0a0a", border: `1px solid ${borderColor}`, borderRadius: 4,
          padding: "12px 14px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia, serif",
          outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", transition: "border-color 0.15s",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showError && (
        <span style={{ fontSize: 11, color: "#ef4444", fontFamily: "Georgia, serif" }}>This field is required.</span>
      )}
    </div>
  );
}

export default function OnboardingForm() {
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setForm(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!done) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch {}
    }
  }, [form, done]);

  const set = (key: keyof FormData) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  const filledRequired = REQUIRED.filter(k => form[k].trim()).length;
  const progressPct = Math.round((filledRequired / REQUIRED.length) * 100);

  function fieldError(key: keyof FormData): boolean {
    return submitted && (REQUIRED as readonly string[]).includes(key) && !form[key].trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    if (REQUIRED.some(k => !form[k].trim())) {
      toastError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        setDone(true);
      } else {
        toastError(json.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      toastError("Network error. Please check your connection and try again.");
    }
    setSubmitting(false);
  }

  const containerStyle: React.CSSProperties = {
    minHeight: "100vh", background: "#0a0a0a", display: "flex",
    alignItems: "flex-start", justifyContent: "center",
    padding: "48px 16px", fontFamily: "Georgia, serif",
  };

  const cardStyle: React.CSSProperties = {
    background: "#111111", border: "1px solid #1e1e1e", borderRadius: 4,
    width: "100%", maxWidth: 640, overflow: "hidden",
  };

  if (done) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ padding: "40px 48px 32px", borderBottom: "1px solid #1e1e1e", textAlign: "center" }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, letterSpacing: "4px", color: gold, textTransform: "uppercase" }}>Stack N Scale Enterprises</p>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 400, color: "#f5f0e8", letterSpacing: 1 }}>Received.</h1>
          </div>
          <div style={{ padding: "40px 48px", textAlign: "center" }}>
            <p style={{ margin: "0 0 16px", fontSize: 15, color: "#a09070", lineHeight: 1.9 }}>
              We&apos;ve received your responses and will be in touch within 24 hours.
            </p>
            <p style={{ margin: 0, fontSize: 15, color: "#a09070", lineHeight: 1.9 }}>
              Once your identity verification is complete, you&apos;ll receive an email with a link to your private Discord channel.
            </p>
          </div>
          <div style={{ padding: "24px 48px", borderTop: "1px solid #1e1e1e", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 11, color: "#3a3a3a", letterSpacing: 1 }}>
              STACK N SCALE ENTERPRISES &nbsp;·&nbsp; PRIVATE MEMBER CORRESPONDENCE
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ padding: "40px 48px 32px", borderBottom: "1px solid #1e1e1e", textAlign: "center" }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, letterSpacing: "4px", color: gold, textTransform: "uppercase" }}>Stack N Scale Enterprises</p>
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 400, color: "#f5f0e8", letterSpacing: 1 }}>Onboarding.</h1>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6a5a40", lineHeight: 1.8 }}>
            Help us understand your vision so we can support your growth at the highest level.
          </p>
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#4a3a20", letterSpacing: "2px", textTransform: "uppercase" }}>Progress</span>
              <span style={{ fontSize: 10, color: "#4a3a20" }}>{filledRequired} / {REQUIRED.length} fields</span>
            </div>
            <div style={{ height: 2, background: "#1e1e1e", borderRadius: 1 }}>
              <div style={{ height: 2, width: `${progressPct}%`, background: gold, borderRadius: 1, transition: "width 0.4s ease" }} />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "40px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Full Name" name="name" value={form.name} onChange={set("name")} placeholder="Your full name" showError={fieldError("name")} />
            <Field label="Email Address" name="email" value={form.email} onChange={set("email")} type="email" placeholder="your@email.com" showError={fieldError("email")} />
          </div>

          <TextArea
            label="What motivated you to get started?"
            name="motivation" value={form.motivation} onChange={set("motivation")}
            placeholder="Share what drove you to take this step..."
            showError={fieldError("motivation")}
          />

          <TextArea
            label="What brought you to Stack N Scale Enterprises?"
            name="whySNS" value={form.whySNS} onChange={set("whySNS")}
            placeholder="What stood out to you about us specifically..."
            showError={fieldError("whySNS")}
          />

          <div>
            <p style={{ margin: "0 0 16px", fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold }}>
              Your Goals
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <TextArea label="30-Day Goal" name="goal30Days" value={form.goal30Days} onChange={set("goal30Days")} placeholder="What do you want to achieve in the next 30 days?" showError={fieldError("goal30Days")} />
              <TextArea label="3-Month Goal" name="goal3Months" value={form.goal3Months} onChange={set("goal3Months")} placeholder="Where do you want to be in 3 months?" showError={fieldError("goal3Months")} />
              <TextArea label="6-Month Goal" name="goal6Months" value={form.goal6Months} onChange={set("goal6Months")} placeholder="What does the 6-month mark look like for you?" showError={fieldError("goal6Months")} />
              <TextArea label="1-Year Goal" name="goal1Year" value={form.goal1Year} onChange={set("goal1Year")} placeholder="Paint the full picture — where are you in a year?" showError={fieldError("goal1Year")} />
            </div>
          </div>

          <TextArea
            label="What is your biggest challenge right now?"
            name="biggestChallenge" value={form.biggestChallenge} onChange={set("biggestChallenge")}
            placeholder="Be honest — this helps us support you better..."
            showError={fieldError("biggestChallenge")}
          />

          <TextArea
            label="What does success look like for you in the next 90 days?"
            name="successIn90Days" value={form.successIn90Days} onChange={set("successIn90Days")}
            placeholder="Paint the picture of where you want to be..."
            showError={fieldError("successIn90Days")}
          />

          <TextArea
            label="Anything else you'd like us to know?"
            name="additionalNotes" value={form.additionalNotes} onChange={set("additionalNotes")}
            required={false} placeholder="Optional..."
          />

          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: submitting ? "#5a4010" : gold,
                color: "#0a0a0a", border: "none", cursor: submitting ? "not-allowed" : "pointer",
                fontSize: 12, letterSpacing: "3px", textTransform: "uppercase",
                padding: "16px 48px", borderRadius: 2, fontWeight: 600,
                fontFamily: "Georgia, serif", transition: "background 0.15s",
              }}
            >
              {submitting ? "Submitting…" : "Submit Onboarding Form"}
            </button>
          </div>
        </form>

        <div style={{ padding: "24px 48px", borderTop: "1px solid #1e1e1e", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#3a3a3a", letterSpacing: 1 }}>
            STACK N SCALE ENTERPRISES &nbsp;·&nbsp; PRIVATE MEMBER CORRESPONDENCE
          </p>
        </div>
      </div>
    </div>
  );
}
