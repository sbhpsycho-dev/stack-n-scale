"use client";

import { useState } from "react";

const gold = "#c8902a";

function Field({ label, name, value, onChange, type = "text", required = true, placeholder = "" }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
          background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4,
          padding: "12px 14px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia, serif",
          outline: "none", width: "100%", boxSizing: "border-box",
        }}
        onFocus={e => { e.target.style.borderColor = gold; }}
        onBlur={e => { e.target.style.borderColor = "#2a2a2a"; }}
      />
    </div>
  );
}

function TextArea({ label, name, value, onChange, required = true, placeholder = "" }: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  required?: boolean; placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
          background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4,
          padding: "12px 14px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia, serif",
          outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical",
        }}
        onFocus={e => { e.target.style.borderColor = gold; }}
        onBlur={e => { e.target.style.borderColor = "#2a2a2a"; }}
      />
    </div>
  );
}

export default function OnboardingForm() {
  const [form, setForm] = useState({
    name: "", email: "", motivation: "", whySNS: "",
    goal30Days: "", goal3Months: "", goal6Months: "", goal1Year: "",
    biggestChallenge: "", successIn90Days: "", additionalNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) {
        setDone(true);
      } else {
        setError(json.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
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
              We've received your responses and will be in touch shortly.
            </p>
            <p style={{ margin: 0, fontSize: 15, color: "#a09070", lineHeight: 1.9 }}>
              Once your identity verification is complete, you'll receive an email with a link to your private Discord channel.
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
          <p style={{ margin: 0, fontSize: 13, color: "#6a5a40", lineHeight: 1.8 }}>
            Help us understand your vision so we can support your growth at the highest level.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "40px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Full Name" name="name" value={form.name} onChange={set("name")} placeholder="Your full name" />
            <Field label="Email Address" name="email" value={form.email} onChange={set("email")} type="email" placeholder="your@email.com" />
          </div>

          <TextArea
            label="What motivated you to get started?"
            name="motivation"
            value={form.motivation}
            onChange={set("motivation")}
            placeholder="Share what drove you to take this step..."
          />

          <TextArea
            label="What brought you to Stack N Scale Enterprises?"
            name="whySNS"
            value={form.whySNS}
            onChange={set("whySNS")}
            placeholder="What stood out to you about us specifically..."
          />

          <div>
            <p style={{ margin: "0 0 16px", fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold }}>
              Your Goals
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <TextArea label="30-Day Goal" name="goal30Days" value={form.goal30Days} onChange={set("goal30Days")} placeholder="What do you want to achieve in the next 30 days?" />
              <TextArea label="3-Month Goal" name="goal3Months" value={form.goal3Months} onChange={set("goal3Months")} placeholder="Where do you want to be in 3 months?" />
              <TextArea label="6-Month Goal" name="goal6Months" value={form.goal6Months} onChange={set("goal6Months")} placeholder="What does the 6-month mark look like for you?" />
              <TextArea label="1-Year Goal" name="goal1Year" value={form.goal1Year} onChange={set("goal1Year")} placeholder="Paint the full picture — where are you in a year?" />
            </div>
          </div>

          <TextArea
            label="What is your biggest challenge right now?"
            name="biggestChallenge"
            value={form.biggestChallenge}
            onChange={set("biggestChallenge")}
            placeholder="Be honest — this helps us support you better..."
          />

          <TextArea
            label="What does success look like for you in the next 90 days?"
            name="successIn90Days"
            value={form.successIn90Days}
            onChange={set("successIn90Days")}
            placeholder="Paint the picture of where you want to be..."
          />

          <TextArea
            label="Anything else you'd like us to know?"
            name="additionalNotes"
            value={form.additionalNotes}
            onChange={set("additionalNotes")}
            required={false}
            placeholder="Optional..."
          />

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: "#ef4444", textAlign: "center" }}>{error}</p>
          )}

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
