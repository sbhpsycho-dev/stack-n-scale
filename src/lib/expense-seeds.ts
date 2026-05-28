// ─── SNS Fixed Cost Seed Data ─────────────────────────────────────────────────
// Source: Stack N Scale Enterprises — Monthly Expense Breakdown (May 2026)
// Total: $8,204/month in fixed costs

import type { ExpenseCategory, ExpenseRecurrence } from "./expense-types";

interface SeedEntry {
  vendor: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  recurrence: ExpenseRecurrence;
}

export const EXPENSE_SEEDS: SeedEntry[] = [
  // ── Advertising & Marketing ($5,500/mo) ──────────────────────────────────
  {
    vendor:      "Meta",
    description: "Ad spend",
    amount:      4500,
    category:    "advertising",
    recurrence:  "fixed",
  },
  {
    vendor:      "Media Buyer",
    description: "Retainer",
    amount:      1000,
    category:    "advertising",
    recurrence:  "fixed",
  },

  // ── Software & Subscriptions ($2,704/mo) ─────────────────────────────────
  {
    vendor:      "GoHighLevel",
    description: "CRM & marketing platform",
    amount:      297,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Skool",
    description: "Community platform",
    amount:      10,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Make.com",
    description: "Automation platform",
    amount:      20,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Zapier",
    description: "Workflow automation",
    amount:      30,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Notion",
    description: "Project management",
    amount:      50,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Claude (Anthropic)",
    description: "AI assistant",
    amount:      100,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Zoom",
    description: "Video conferencing",
    amount:      17,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "PandaDoc",
    description: "Contracts & proposals",
    amount:      65,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Kendo AI",
    description: "AI sales tool",
    amount:      70,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Lovable.dev",
    description: "AI development platform",
    amount:      25,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Miro",
    description: "Visual collaboration",
    amount:      20,
    category:    "software",
    recurrence:  "fixed",
  },
  {
    vendor:      "Job Board",
    description: "Hiring & recruitment",
    amount:      2000,
    category:    "software",
    recurrence:  "fixed",
  },
];

// ── Commission structure (for break-even & debrief calculations) ─────────────

export const COMMISSION_RATES = {
  /** Caelum: 15% of net per deal */
  caelum:     { basis: "net",   rate: 0.15 },
  /** Setter: 10% of gross per deal */
  setter:     { basis: "gross", rate: 0.10 },
  /** Closer: 10% of gross per deal */
  closer:     { basis: "gross", rate: 0.10 },
  /** Media buyer: 5% of gross on ad deals */
  mediaBuyer: { basis: "gross", rate: 0.05 },
} as const;

/** Average processor fee % (Stripe ~2.9%; Fanbasis similar) */
export const AVG_PROCESSOR_FEE_RATE = 0.029;

/** Average total commission rate on gross (conservative: setter + closer + media buyer = ~25%) */
export const AVG_COMMISSION_RATE_ON_GROSS = 0.25;
