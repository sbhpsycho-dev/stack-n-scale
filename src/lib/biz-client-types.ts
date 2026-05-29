export type BizClientStatus = "lead" | "signed" | "active" | "paused" | "churned";

export const BIZ_STATUS_LABELS: Record<BizClientStatus, string> = {
  lead:    "Lead",
  signed:  "Signed",
  active:  "Active",
  paused:  "Paused",
  churned: "Churned",
};

export const BIZ_STATUS_ORDER: BizClientStatus[] = ["lead", "signed", "active", "paused", "churned"];

export const BIZ_STATUS_COLORS: Record<BizClientStatus, string> = {
  lead:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  signed:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
  active:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  churned: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export type KpiDef = {
  key: string;
  label: string;
  unit: "%" | "$" | "number";
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  kpis: KpiDef[];
};

export type BizClient = {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  status: BizClientStatus;
  startDate?: string;
  monthlyValue?: number;
  services?: string;
  notes?: string;
  createdAt: string;
  teamMembers: TeamMember[];
  portalUsername?: string;
  portalPasswordHash?: string;
};

export type KpiEntry = {
  date: string;
  values: Record<string, number>;
  updatedAt: string;
};

// Role-based KPI presets — auto-populated when adding a team member
export const ROLE_KPI_PRESETS: Record<string, KpiDef[]> = {
  VA: [
    { key: "studentContractCompletionRate", label: "Student Contract Completion Rate", unit: "%" },
    { key: "mastermindAttendanceRate",       label: "Mastermind Attendance Rate",       unit: "%" },
    { key: "tuesdayReminderCompletionRate",  label: "Tuesday Reminder Completion Rate", unit: "%" },
    { key: "studentResponseRate",            label: "Student Response Rate",            unit: "%" },
    { key: "onboardingCompletionRate",       label: "Onboarding Completion Rate",       unit: "%" },
  ],
  "Sales Director": [
    { key: "teamShowUpRate",         label: "Team Show-Up Rate",         unit: "%" },
    { key: "teamCloseRate",          label: "Team Close Rate",           unit: "%" },
    { key: "customerRetentionRate",  label: "Customer Retention Rate",   unit: "%" },
    { key: "trainingCompletionRate", label: "Training Completion Rate",  unit: "%" },
    { key: "averageDealSize",        label: "Average Deal Size",         unit: "$" },
  ],
  Setter: [
    { key: "contactRate",         label: "Contact Rate",         unit: "%" },
    { key: "appointmentsBooked",  label: "Appointments Booked",  unit: "number" },
    { key: "showRate",            label: "Show Rate",            unit: "%" },
    { key: "conversionRate",      label: "Conversion Rate",      unit: "%" },
  ],
  Closer: [
    { key: "closeRate",       label: "Close Rate",       unit: "%" },
    { key: "cashCollected",   label: "Cash Collected",   unit: "$" },
    { key: "dealsClosed",     label: "Deals Closed",     unit: "number" },
    { key: "avgDealSize",     label: "Avg Deal Size",    unit: "$" },
  ],
};
