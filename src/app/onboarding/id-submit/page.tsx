"use client";

import { useState, useRef } from "react";

const gold = "#c8902a";

function FileField({ label, name, onChange, accept = "image/*" }: {
  label: string; name: string; onChange: (f: File | null) => void; accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFileName(file?.name ?? null);
    onChange(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold, fontFamily: "Georgia, serif" }}>
        {label} <span style={{ color: "#a09070", marginLeft: 4 }}>*</span>
      </label>
      <div
        onClick={() => ref.current?.click()}
        style={{
          background: "#0a0a0a", border: `1px solid ${fileName ? gold : "#2a2a2a"}`, borderRadius: 4,
          padding: "16px 14px", color: fileName ? "#f5f0e8" : "#4a3a20", fontSize: 13,
          fontFamily: "Georgia, serif", cursor: "pointer", textAlign: "center",
          transition: "border-color 0.15s",
        }}
      >
        {fileName ?? "Click to select file"}
      </div>
      <input ref={ref} type="file" name={name} accept={accept} onChange={handleChange} style={{ display: "none" }} />
    </div>
  );
}

export default function IdSubmitPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [idFront, setIdFront] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idFront || !selfie) { setError("Please attach both files."); return; }
    setSubmitting(true);
    setError("");

    const fd = new FormData();
    fd.append("name", name);
    fd.append("email", email);
    fd.append("idFront", idFront);
    fd.append("selfie", selfie);

    try {
      const res = await fetch("/api/onboarding/id-submit", { method: "POST", body: fd });
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
    width: "100%", maxWidth: 580, overflow: "hidden",
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
              Your identity verification documents have been received.
            </p>
            <p style={{ margin: 0, fontSize: 15, color: "#a09070", lineHeight: 1.9 }}>
              Our team will review your submission and be in touch shortly.
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
          <h1 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 400, color: "#f5f0e8", letterSpacing: 1 }}>Identity Verification.</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#6a5a40", lineHeight: 1.8 }}>
            Please upload a valid government-issued photo ID and a selfie holding it.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "40px 48px", display: "flex", flexDirection: "column", gap: 24 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold, fontFamily: "Georgia, serif" }}>
                Full Name <span style={{ color: "#a09070", marginLeft: 4 }}>*</span>
              </label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your full name"
                style={{
                  background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4,
                  padding: "12px 14px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia, serif",
                  outline: "none", width: "100%", boxSizing: "border-box",
                }}
                onFocus={e => { e.target.style.borderColor = gold; }}
                onBlur={e => { e.target.style.borderColor = "#2a2a2a"; }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold, fontFamily: "Georgia, serif" }}>
                Email Address <span style={{ color: "#a09070", marginLeft: 4 }}>*</span>
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
                style={{
                  background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 4,
                  padding: "12px 14px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia, serif",
                  outline: "none", width: "100%", boxSizing: "border-box",
                }}
                onFocus={e => { e.target.style.borderColor = gold; }}
                onBlur={e => { e.target.style.borderColor = "#2a2a2a"; }}
              />
            </div>
          </div>

          <div style={{ padding: "20px 24px", background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 4 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, letterSpacing: "3px", color: gold, textTransform: "uppercase" }}>Requirements</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {[
                "Government-issued photo ID (driver's license, passport, state ID)",
                "Selfie clearly showing your face while holding the ID",
                "Both documents must be legible and fully visible",
              ].map(t => (
                <li key={t} style={{ fontSize: 13, color: "#6a5a40", lineHeight: 2 }}>{t}</li>
              ))}
            </ul>
          </div>

          <FileField label="Photo ID (front)" name="idFront" onChange={setIdFront} />
          <FileField label="Selfie holding your ID" name="selfie" onChange={setSelfie} />

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
              {submitting ? "Uploading…" : "Submit Verification"}
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
