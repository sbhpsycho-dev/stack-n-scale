export interface Deal {
  id: string;
  date: string;
  clientName: string;
  offer: "5K" | "10K";
  grossAmount: number;
  processor: "fanbasis" | "stripe";
  processorFee: number;
  netAmount: number;
  leadSource: "ad" | "organic";
  setter: string | null;
  closer: string | null;
  payouts: DealPayout;
  payoutStatus: "pending" | "approved" | "paid";
  notes: string;
}

export interface DealPayout {
  caelum: number;
  mediaBuyer: number;
  setter: number;
  closer: number;
  totalPayouts: number;
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
