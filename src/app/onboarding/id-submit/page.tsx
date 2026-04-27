"use client";

import { useState, useRef, useEffect } from "react";

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

function SignatureCanvas({ onSign }: { onSign: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#f5f0e8";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSignature) setHasSignature(true);
  }

  function stopDraw() {
    if (drawing.current && hasSignature) {
      // Capture signature once per stroke-end, not on every pixel move
      onSign(canvasRef.current!.toDataURL("image/png"));
    }
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSign(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ fontSize: 11, letterSpacing: "3px", textTransform: "uppercase", color: gold, fontFamily: "Georgia, serif" }}>
          Signature <span style={{ color: "#a09070", marginLeft: 4 }}>*</span>
        </label>
        {hasSignature && (
          <button
            type="button"
            onClick={clear}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, letterSpacing: "2px", textTransform: "uppercase",
              color: "#6a5a40", fontFamily: "Georgia, serif",
            }}
          >
            Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={560}
        height={120}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
        style={{
          background: "#0a0a0a",
          border: `1px solid ${hasSignature ? gold : "#2a2a2a"}`,
          borderRadius: 4,
          width: "100%",
          height: 120,
          cursor: "crosshair",
          touchAction: "none",
          display: "block",
        }}
      />
      <p style={{ margin: 0, fontSize: 11, color: "#4a3a20", fontFamily: "Georgia, serif" }}>
        Sign above using your mouse or finger
      </p>
    </div>
  );
}

export default function IdSubmitPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("name");
    const e = params.get("email");
    if (n) setName(n);
    if (e) setEmail(e);
  }, []);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [discordOAuthUrl, setDiscordOAuthUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idFront || !selfie) { setError("Please attach both files."); return; }
    if (!signature) { setError("Please provide your signature."); return; }
    if (!consented) { setError("You must check the consent box to proceed."); return; }

    setSubmitting(true);
    setError("");

    const fd = new FormData();
    fd.append("name", name);
    fd.append("email", email);
    fd.append("idFront", idFront);
    fd.append("selfie", selfie);
    fd.append("signature", signature);
    fd.append("consented", "true");

    try {
      const res = await fetch("/api/onboarding/id-submit", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setDiscordOAuthUrl(json.discordOAuthUrl ?? null);
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
    width: "100%", maxWidth: 620, overflow: "hidden",
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
            <p style={{ margin: discordOAuthUrl ? "0 0 36px" : 0, fontSize: 15, color: "#a09070", lineHeight: 1.9 }}>
              {discordOAuthUrl
                ? "You're all set — connect your Discord below to access your private channel and the student community."
                : "Our team will review your submission and be in touch shortly."}
            </p>
            {discordOAuthUrl && (
              <a
                href={discordOAuthUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block", background: gold, color: "#0a0a0a",
                  textDecoration: "none", fontSize: 12, letterSpacing: "3px",
                  textTransform: "uppercase", padding: "16px 40px", borderRadius: 2,
                  fontWeight: 600,
                }}
              >
                Connect Discord →
              </a>
            )}
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

          <SignatureCanvas onSign={setSignature} />

          {/* Consent checkbox */}
          <div
            style={{
              padding: "20px 24px", background: "#0f0f0f",
              border: `1px solid ${consented ? gold : "#1e1e1e"}`, borderRadius: 4,
              transition: "border-color 0.15s",
            }}
          >
            <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer" }}>
              <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={e => setConsented(e.target.checked)}
                  style={{ position: "absolute", opacity: 0, width: 18, height: 18, cursor: "pointer", margin: 0 }}
                />
                <div style={{
                  width: 18, height: 18, border: `1px solid ${consented ? gold : "#3a3a3a"}`,
                  borderRadius: 2, background: consented ? gold : "#0a0a0a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {consented && (
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path d="M1 4L4 7.5L10 1" stroke="#0a0a0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#a09070", lineHeight: 1.8, fontFamily: "Georgia, serif" }}>
                I confirm that the documents submitted are genuine and unaltered. I consent to identity
                verification as part of the onboarding process for Stack N Scale Enterprises and
                acknowledge that my submission will be reviewed by the Stack N Scale team.
              </span>
            </label>
          </div>

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
