"use client";

import { useState, useEffect, useCallback } from "react";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Download, X } from "lucide-react";
import type { Deal, DealPayout } from "@/lib/deal-types";
import { fmtDate } from "@/lib/fmt-date";
import { toast, toastError } from "@/lib/toast";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function statusBadge(s: Deal["payoutStatus"]) {
  const cls =
    s === "paid"     ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    s === "approved" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                       "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  const label =
    s === "paid"     ? "Paid" :
    s === "approved" ? "Approved" : "Pending";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Preview breakdown (shown in modal before save) ─────────────────────────

function PayoutPreview({ p }: { p: DealPayout }) {
  const rows: [string, number][] = [
    ["Caelum (15% net)", p.caelum],
    ["Media Buyer (5% gross)", p.mediaBuyer],
    ["DM Setter", p.dmSetter],
    ["Setter", p.setter],
    ["Closer", p.closer],
    ["Total Payouts", p.totalPayouts],
    ["Evan Take Home", p.evanTakeHome],
  ];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1 text-xs">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payout Breakdown</p>
      {rows.map(([label, val]) => (
        <div key={label} className={`flex justify-between ${label === "Evan Take Home" ? "font-bold text-orange-400 border-t border-border pt-1 mt-1" : ""}`}>
          <span className="text-muted-foreground">{label}</span>
          <span>{fmt$(val)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Add Deal Modal ──────────────────────────────────────────────────────────

type FormData = {
  date: string; clientName: string; clientEmail: string; offer: "5K" | "10K";
  grossAmount: string; contractValue: string; processor: "fanbasis" | "stripe";
  processorFee: string; leadSource: "ad" | "organic";
  dmSetter: string; setter: string; closer: string; notes: string;
};

const EMPTY: FormData = {
  date: new Date().toISOString().slice(0, 10),
  clientName: "", clientEmail: "", offer: "5K", grossAmount: "", contractValue: "",
  processor: "fanbasis", processorFee: "",
  leadSource: "organic", dmSetter: "", setter: "", closer: "", notes: "",
};

function calcPreview(f: FormData): DealPayout | null {
  const gross = parseFloat(f.grossAmount);
  const fee   = parseFloat(f.processorFee);
  if (isNaN(gross) || gross <= 0 || isNaN(fee) || fee < 0) return null;
  const net        = gross - fee;
  const caelum     = Math.round(net * 0.15);
  const mediaBuyer = f.leadSource === "ad" ? Math.round(gross * 0.05) : 0;
  const setterCount = [f.dmSetter.trim(), f.setter.trim()].filter(Boolean).length;
  const eachShare   = setterCount > 1 ? gross * 0.10 : gross * 0.20;
  const dmSetter    = f.dmSetter.trim() ? Math.round(eachShare) : 0;
  const setter      = f.setter.trim()   ? Math.round(eachShare) : 0;
  const closer      = f.closer.trim()   ? Math.round(gross * 0.10) : 0;
  const totalPayouts = caelum + mediaBuyer + dmSetter + setter + closer;
  const remaining = net - totalPayouts;
  const companyReinvestment = Math.round(remaining * 0.10);
  return { caelum, mediaBuyer, dmSetter, setter, closer, totalPayouts, companyReinvestment, evanTakeHome: remaining - companyReinvestment };
}

function AddDealModal({ onClose, onSaved, reps }: { onClose: () => void; onSaved: (d: Deal) => void; reps: string[] }) {
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feeError, setFeeError] = useState("");

  const set = (k: keyof FormData, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  function validateFee(grossStr: string, feeStr: string) {
    const gross = parseFloat(grossStr);
    const fee   = parseFloat(feeStr);
    if (!isNaN(gross) && !isNaN(fee) && fee > gross) {
      setFeeError("Fee can't exceed gross amount");
    } else {
      setFeeError("");
    }
  }

  const preview = calcPreview(form);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (feeError) return;
    const gross = parseFloat(form.grossAmount);
    const fee   = parseFloat(form.processorFee);
    if (isNaN(gross) || gross <= 0) { setError("Enter a valid gross amount."); return; }
    if (isNaN(fee) || fee < 0)      { setError("Enter a valid processor fee."); return; }
    if (fee > gross)                 { setError("Fee can't exceed gross amount."); return; }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          grossAmount:   gross,
          processorFee:  fee,
          clientEmail:   form.clientEmail.trim() || null,
          contractValue: form.contractValue ? parseFloat(form.contractValue) : null,
          dmSetter: form.dmSetter.trim() || null,
          setter:   form.setter.trim()   || null,
          closer:   form.closer.trim()   || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? "Failed to save. Please try again.");
        return;
      }
      const { deal } = await res.json();
      onSaved(deal);
      toast("Deal logged", { description: `${form.clientName} · ${fmt$(gross)}` });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const inp = "w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500/60 placeholder:text-muted-foreground";
  const sel = `${inp} cursor-pointer`;

  const setterCount = [form.dmSetter.trim(), form.setter.trim()].filter(Boolean).length;
  const repHint = setterCount === 2
    ? "2 setters: each gets 10% of gross"
    : setterCount === 1
    ? "1 setter: gets 20% of gross"
    : "Add a setter to assign payout";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-deal-title"
    >
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="add-deal-title" className="font-bold text-base">Log New Deal</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="deal-date" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</label>
              <input id="deal-date" type="date" className={inp} value={form.date} onChange={e => set("date", e.target.value)} required />
            </div>
            <div>
              <label htmlFor="deal-offer" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Offer</label>
              <select id="deal-offer" className={sel} value={form.offer} onChange={e => set("offer", e.target.value as "5K" | "10K")}>
                <option value="5K">5K</option>
                <option value="10K">10K</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="deal-client" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Client Name</label>
              <input id="deal-client" className={inp} placeholder="e.g. John Smith" value={form.clientName} onChange={e => set("clientName", e.target.value)} required />
            </div>
            <div>
              <label htmlFor="deal-email" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Client Email</label>
              <input id="deal-email" type="email" className={inp} placeholder="client@email.com" value={form.clientEmail} onChange={e => set("clientEmail", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="deal-gross" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Collected Today ($)</label>
              <input
                id="deal-gross" type="number" className={inp} placeholder="5000"
                min="1" value={form.grossAmount}
                onChange={e => { set("grossAmount", e.target.value); validateFee(e.target.value, form.processorFee); }}
                required
              />
            </div>
            <div>
              <label htmlFor="deal-contract" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Contract Value ($)</label>
              <input
                id="deal-contract" type="number" className={inp} placeholder="Same as collected (or total if split)"
                min="1" value={form.contractValue}
                onChange={e => set("contractValue", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="deal-fee" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Processor Fee ($)</label>
              <input
                id="deal-fee" type="number" className={`${inp} ${feeError ? "border-red-500/60" : ""}`}
                placeholder="150" min="0" value={form.processorFee}
                onChange={e => { set("processorFee", e.target.value); validateFee(form.grossAmount, e.target.value); }}
                required
              />
              {feeError && <p className="text-[11px] text-red-400 mt-1">{feeError}</p>}
            </div>
            <div /></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="deal-processor" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Processor</label>
              <select id="deal-processor" className={sel} value={form.processor} onChange={e => set("processor", e.target.value as FormData["processor"])}>
                <option value="fanbasis">Fanbasis</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>
            <div>
              <label htmlFor="deal-source" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Lead Source</label>
              <select id="deal-source" className={sel} value={form.leadSource} onChange={e => set("leadSource", e.target.value as FormData["leadSource"])}>
                <option value="organic">Organic</option>
                <option value="ad">Ad</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Reps (optional)</label>
            <p className="text-[11px] text-muted-foreground mb-1.5">{repHint}</p>
            <div className="grid grid-cols-3 gap-2">
              {(["dmSetter", "setter", "closer"] as const).map((field) => {
                const labels: Record<typeof field, string> = { dmSetter: "DM Setter", setter: "Setter", closer: "Closer" };
                return (
                  <div key={field}>
                    <label htmlFor={`deal-${field}`} className="text-[10px] text-muted-foreground mb-0.5 block">{labels[field]}</label>
                    <select
                      id={`deal-${field}`}
                      className={sel}
                      value={form[field]}
                      onChange={e => set(field, e.target.value)}
                    >
                      <option value="">— None —</option>
                      {reps.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="deal-notes" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</label>
            <textarea id="deal-notes" className={`${inp} resize-none h-16`} placeholder="Optional notes" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {preview && <PayoutPreview p={preview} />}
          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              type="submit" disabled={saving || !!feeError}
              className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Log Deal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type Filters = { from: string; to: string; processor: string; source: string; rep: string };
const EMPTY_FILTERS: Filters = { from: "", to: "", processor: "", source: "", rep: "" };

function exportCSV(deals: Deal[]) {
  const headers = ["Date", "Client", "Offer", "Gross", "Fee", "Net", "Processor", "Source", "DM Setter", "Setter", "Closer", "Caelum", "Media Buyer", "Setter Pay", "Closer Pay", "Evan Take Home", "Status"];
  const rows = deals.map(d => [
    d.date, d.clientName, d.offer, d.grossAmount, d.processorFee, d.netAmount,
    d.processor, d.leadSource, d.dmSetter ?? "", d.setter ?? "", d.closer ?? "",
    d.payouts.caelum.toFixed(2), d.payouts.mediaBuyer.toFixed(2),
    d.payouts.setter.toFixed(2), d.payouts.closer.toFixed(2),
    d.payouts.evanTakeHome.toFixed(2), d.payoutStatus,
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "deals.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showModal, setShowModal] = useState(false);
  const [reps, setReps] = useState<string[]>([]);
  const [dateError, setDateError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    fetch("/api/staff/reps").then(r => r.ok ? r.json() : []).then((list: { name: string }[]) => {
      setReps(list.map(r => r.name));
    });
  }, []);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (f.from)      p.set("from", f.from);
    if (f.to)        p.set("to", f.to);
    if (f.processor) p.set("processor", f.processor);
    if (f.source)    p.set("source", f.source);
    if (f.rep)       p.set("rep", f.rep);
    try {
      const res = await fetch(`/api/deals?${p}`);
      if (res.ok) { setDeals((await res.json()).deals); setLastUpdated(new Date()); }
      else toastError("Failed to load deals");
    } catch {
      toastError("Network error", "Could not fetch deals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filters); }, [load, filters]);

  // Auto-refresh every 30s so deals logged by teammates appear without a manual reload
  useEffect(() => {
    const id = setInterval(() => load(filters), 30_000);
    return () => clearInterval(id);
  }, [load, filters]);

  function setFilter(k: keyof Filters, v: string) {
    if (k === "to" && filters.from && v && v < filters.from) {
      setDateError("End date must be after start date");
      return;
    }
    if (k === "from" && filters.to && v && v > filters.to) {
      setDateError("Start date must be before end date");
      return;
    }
    setDateError("");
    setFilters(prev => ({ ...prev, [k]: v }));
  }

  const totals = deals.reduce(
    (acc, d) => ({
      gross: acc.gross + d.grossAmount,
      evan:  acc.evan  + d.payouts.evanTakeHome,
      deals: acc.deals + 1,
    }),
    { gross: 0, evan: 0, deals: 0 }
  );

  const inp = "bg-muted border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-orange-500/60 placeholder:text-muted-foreground";

  return (
    <div className="space-y-5">
      {showModal && (
        <AddDealModal
          reps={reps}
          onClose={() => setShowModal(false)}
          onSaved={(d) => { setDeals(prev => [d, ...prev]); setShowModal(false); }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Deal Log</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All closed deals · live · as of {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => exportCSV(deals)}
            aria-label="Export deals as CSV"
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors text-muted-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="h-10 px-5 flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-md shadow-orange-500/20"
          >
            <Plus className="h-4 w-4" /> Add Deal
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total Deals" value={totals.deals} variant="default" index={0} />
        <MetricCard label="Gross" value={totals.gross} prefix="$" variant="orange" index={1} />
        <MetricCard label="Evan Take Home" value={totals.evan} prefix="$" variant="green" index={2} />
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="px-4 py-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input type="date" className={inp} value={filters.from} onChange={e => setFilter("from", e.target.value)} placeholder="From" />
            <input type="date" className={inp} value={filters.to}   onChange={e => setFilter("to",   e.target.value)} placeholder="To" />
            <select className={inp} value={filters.processor} onChange={e => setFilter("processor", e.target.value)}>
              <option value="">All Processors</option>
              <option value="fanbasis">Fanbasis</option>
              <option value="stripe">Stripe</option>
            </select>
            <select className={inp} value={filters.source} onChange={e => setFilter("source", e.target.value)}>
              <option value="">All Sources</option>
              <option value="ad">Ad</option>
              <option value="organic">Organic</option>
            </select>
            <input className={inp} placeholder="Rep name" value={filters.rep} onChange={e => setFilter("rep", e.target.value)} />
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setDateError(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          </div>
          {dateError && <p className="text-[11px] text-red-400">{dateError}</p>}
        </CardContent>
      </Card>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /></div>
        ) : deals.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <p className="text-sm text-muted-foreground">No deals found.</p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-md shadow-orange-500/20"
            >
              <Plus className="h-4 w-4" /> Log a Deal
            </button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {["Date", "Client", "Offer", "Gross", "Net", "Processor", "Source", "DM Setter", "Setter/Closer", "Caelum", "Media Buyer", "Sales", "Evan", "Status"].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map((d, i) => (
                <tr key={d.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.date)}</td>
                  <td className="px-3 py-2 font-medium max-w-[120px] truncate">{d.clientName}</td>
                  <td className="px-3 py-2">{d.offer}</td>
                  <td className="px-3 py-2 text-orange-400">{fmt$(d.grossAmount)}</td>
                  <td className="px-3 py-2">{fmt$(d.netAmount)}</td>
                  <td className="px-3 py-2 capitalize">{d.processor}</td>
                  <td className="px-3 py-2 capitalize">{d.leadSource}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.dmSetter ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {d.setter ?? "—"}{d.closer ? ` / ${d.closer}` : ""}
                  </td>
                  <td className="px-3 py-2">{fmt$(d.payouts.caelum)}</td>
                  <td className="px-3 py-2">{d.payouts.mediaBuyer > 0 ? fmt$(d.payouts.mediaBuyer) : "—"}</td>
                  <td className="px-3 py-2">{fmt$(d.payouts.setter + d.payouts.closer)}</td>
                  <td className="px-3 py-2 text-green-400 font-semibold">{fmt$(d.payouts.evanTakeHome)}</td>
                  <td className="px-3 py-2">{statusBadge(d.payoutStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
