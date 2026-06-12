export interface Deal {
  id: string;
  date: string;
  clientName: string;
  offer: "5K" | "10K";
  grossAmount: number;
  processor: "fanbasis" | "stripe" | "whop";
  processorFee: number;
  netAmount: number;
  leadSource: "ad" | "organic";
  dmSetter: string | null;
  setter: string | null;
  closer: string | null;
  clientEmail?: string | null;
  contractValue?: number | null;   // full agreed contract; may exceed grossAmount on payment plans
  // Discord IDs — populated after staff migration; additive, don't remove name fields above
  dmSetterId?: string | null;
  setterId?: string | null;
  closerId?: string | null;
  payouts: DealPayout;
  payoutStatus: "pending" | "approved" | "paid";
  notes: string;
}

export interface DealPayout {
  caelum: number;
  mediaBuyer: number;
  dmSetter: number;
  setter: number;
  closer: number;
  totalPayouts: number;
  companyReinvestment: number;
  evanTakeHome: number;
}

export interface PayoutItem {
  dealId: string;
  recipient: string;
  amount: number;
  status: "pending" | "paid";
  weekId: string;
}

export interface WeeklyPayout {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  dealIds: string[];
  totals: {
    caelum: number;
    mediaBuyer: number;
    dmSetter: number;
    setter: number;
    closer: number;
    totalPayouts: number;
    evanTakeHome: number;
    gross: number;
    fees: number;
  };
  status: "pending" | "approved" | "paid";
  approvedAt?: string;
}
