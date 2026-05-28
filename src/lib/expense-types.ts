// ─── SNS Expense Tracker — Types ─────────────────────────────────────────────

export type ExpenseCategory =
  | "advertising"
  | "software"
  | "payment_processing"
  | "team"
  | "legal"
  | "other";

export type ExpenseRecurrence = "fixed" | "variable";

export interface SNSExpense {
  id: string;
  /** "YYYY-MM" for recurring fixed costs; "YYYY-MM-DD" for one-off variable costs */
  date: string;
  vendor: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  recurrence: ExpenseRecurrence;
  /** true = pre-loaded from the known fixed-cost list */
  isSeeded: boolean;
  notes?: string;
  createdAt: string;
}

export interface ExpenseSummary {
  month: string; // "YYYY-MM"
  totalFixed: number;
  totalVariable: number;
  grandTotal: number;
  byCategory: Record<ExpenseCategory, number>;
  expenses: SNSExpense[];
}

export interface BreakevenResult {
  month: string;
  totalFixed: number;
  totalVariable: number;
  grandTotal: number;
  /** Minimum deals at $5K offer to cover all operating costs */
  dealsAt5K: number;
  /** Minimum deals at $10K offer to cover all operating costs */
  dealsAt10K: number;
  /** Gross revenue needed to cover operating costs (before commissions/fees) */
  revenueBenchmark: number;
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  advertising:         "Advertising & Marketing",
  software:            "Software & Subscriptions",
  payment_processing:  "Payment Processing",
  team:                "Team & Contractors",
  legal:               "Legal & Professional",
  other:               "Other",
};

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  advertising:        "#f97316",  // orange
  software:           "#3b82f6",  // blue
  payment_processing: "#8b5cf6",  // purple
  team:               "#22c55e",  // green
  legal:              "#eab308",  // yellow
  other:              "#6b7280",  // gray
};
