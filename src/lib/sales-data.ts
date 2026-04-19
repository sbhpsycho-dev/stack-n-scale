// Stack N Scale — types + seed data from dashboard PDF

export type ClientMeta = {
  id: string;       // URL-safe slug, e.g. "alpha-coaching"
  name: string;     // Display name, e.g. "Alpha Coaching"
  password: string; // Login password for this client
};

export const SEED_REGISTRY: ClientMeta[] = [
  { id: "alpha-coaching",   name: "Alpha Coaching",   password: "alpha2026"   },
  { id: "peak-performance", name: "Peak Performance", password: "peak2026"    },
  { id: "momentum-media",   name: "Momentum Media",   password: "momentum2026" },
];

export type TimePoint    = { date: string; amount: number };
export type NameAmount   = { name: string; amount: number };
export type FunnelWeek   = { week: string; callsMade: number; callsAnswered: number; demosSet: number; demosShowed: number; pitched: number; closed: number };
export type StageCount   = { stage: string; count: number };
export type LeadPoint    = { date: string; leads: number };
export type CampaignLead = { campaign: string; leads: number };
export type AdSetCPL     = { adSet: string; cpl: number };
export type TopAd        = { name: string; leads: number; cpl: number; roas: number };
export type SpendSplit   = { platform: string; pct: number };
export type CheckInScore = { week: string; score: number };
export type Rep = {
  name: string;
  callsMade: number;
  callsAnswered: number;
  demosSet: number;
  demosShowed: number;
  pitched: number;
  dealsClosed: number;
  cashCollected: number;
  answerRate: number;
};

export type Client = {
  name: string;
  goLiveDate: string;
  setupFee: number;
  revSharePct: number;
  revSharePaid: boolean;
  cashCollectedMTD: number;
  cumulativeRevenue: number;
  checkInScore: number;
};

export type SalesData = {
  dashboard: {
    cashCollectedMTD: number;
    leadsThisMonth: number;
    totalDealsClosedMTD: number;
    netRevenueMTD: number;
    costPerClose: number;
    mrr: number;
    totalRefund: number;
    totalRefundPct: number;
    monthlyGoal: number;
    cashCollectedLastMonth: number;
    avgLeadResponseTimeMin: number;
    reactivation: {
      contacted: number;
      replied: number;
      booked: number;
      closed: number;
    };
    checkInScores: CheckInScore[];
    revenueOverTime: TimePoint[];
    netByProduct: NameAmount[];
    netByProcessor: NameAmount[];
  };
  pipeline: {
    callsMade: number;
    callsAnswered: number;
    demosSet: number;
    demosShowed: number;
    pitched: number;
    closed: number;
    answerRate: number;
    showRate: number;
    closeRate: number;
    demoToClose: number;
    funnelByWeek: FunnelWeek[];
    stageBreakdown: StageCount[];
  };
  ads: {
    totalAdSpend: number;
    totalLeads: number;
    cpl: number;
    roas: number;
    ctr: number;
    cpc: number;
    impressions: number;
    reach: number;
    instaCPL: number;
    leadsOverTime: LeadPoint[];
    leadsByCampaign: CampaignLead[];
    cplByAdSet: AdSetCPL[];
    topAds: TopAd[];
    spendSplit: SpendSplit[];
  };
  reps: {
    cashCollectedWeek: number;
    dealClose: number;
    callsMadeWeek: number;
    rateOf: number;
    closeRateWeek: number;
    topRepCash: number;
    showRatePct: number;
    closeRatePct: number;
    avgDealSize: number;
    leaderboard: Rep[];
  };
  clients: Client[];
};

export const SEED: SalesData = {
  dashboard: {
    cashCollectedMTD: 20001,
    leadsThisMonth: 125,
    totalDealsClosedMTD: 14,
    netRevenueMTD: 19501,
    costPerClose: 57,
    mrr: 13750,
    totalRefund: 500,
    totalRefundPct: 0.02,
    monthlyGoal: 70000,
    cashCollectedLastMonth: 16200,
    avgLeadResponseTimeMin: 4.2,
    reactivation: {
      contacted: 142,
      replied: 38,
      booked: 12,
      closed: 5,
    },
    checkInScores: [
      { week: "Mar 3",  score: 6 },
      { week: "Mar 10", score: 7 },
      { week: "Mar 17", score: 7 },
      { week: "Mar 24", score: 8 },
      { week: "Mar 31", score: 8 },
      { week: "Apr 7",  score: 9 },
      { week: "Apr 14", score: 9 },
    ],
    revenueOverTime: [
      { date: "Jun 3 2024", amount: 1200 },
      { date: "Jun 4 2024", amount: 3500 },
      { date: "Apr 4 2026", amount: 5200 },
      { date: "Apr 7 2026", amount: 8900 },
    ],
    netByProduct: [
      { name: "Scale (Tier 3)",   amount: 7800 },
      { name: "Growth (Tier 2)",  amount: 4600 },
      { name: "Starter (Tier 1)", amount: 4500 },
      { name: "Test Payment",     amount: 2400 },
    ],
    netByProcessor: [
      { name: "Stripe",   amount: 17500 },
      { name: "PayPal",   amount: 2300  },
      { name: "Fanbasis", amount: 201   },
    ],
  },
  pipeline: {
    callsMade: 195,
    callsAnswered: 128,
    demosSet: 47,
    demosShowed: 36,
    pitched: 35,
    closed: 17,
    answerRate: 65.32,
    showRate: 65.64,
    closeRate: 48.57,
    demoToClose: 48.57,
    funnelByWeek: [
      { week: "Mar 16", callsMade: 90,  callsAnswered: 55, demosSet: 20, demosShowed: 14, pitched: 14, closed: 7  },
      { week: "Mar 23", callsMade: 105, callsAnswered: 73, demosSet: 27, demosShowed: 22, pitched: 21, closed: 10 },
    ],
    stageBreakdown: [
      { stage: "New Lead",   count: 13 },
      { stage: "Contacted",  count: 6  },
      { stage: "Booked",     count: 5  },
      { stage: "Lost",       count: 4  },
      { stage: "Closed Won", count: 4  },
      { stage: "Pitched",    count: 3  },
      { stage: "Showed",     count: 2  },
    ],
  },
  ads: {
    totalAdSpend: 845,
    totalLeads: 113,
    cpl: 4,
    roas: 15.8,
    ctr: 11,
    cpc: 2.05,
    impressions: 59500,
    reach: 48300,
    instaCPL: 3,
    leadsOverTime: [
      { date: "Jun 2", leads: 30 },
      { date: "Jun 3", leads: 45 },
      { date: "Jun 5", leads: 25 },
      { date: "Jun 6", leads: 13 },
    ],
    leadsByCampaign: [
      { campaign: "Lead Gen - June", leads: 57 },
      { campaign: "Scale - June",    leads: 43 },
      { campaign: "Brand Awareness", leads: 13 },
    ],
    cplByAdSet: [
      { adSet: "Age 30-45",    cpl: 2.0 },
      { adSet: "Interest",     cpl: 1.0 },
      { adSet: "Lookalike 1%", cpl: 1.0 },
    ],
    topAds: [
      { name: "Creative A", leads: 58, cpl: 9.2,  roas: 8.1 },
      { name: "Creative B", leads: 38, cpl: 12.4, roas: 5.3 },
      { name: "Creative C", leads: 17, cpl: 9.81, roas: 2.4 },
    ],
    spendSplit: [
      { platform: "Facebook",  pct: 65.3 },
      { platform: "Instagram", pct: 34.7 },
    ],
  },
  reps: {
    cashCollectedWeek: 5,
    dealClose: 17,
    callsMadeWeek: 195,
    rateOf: 75.7,
    closeRateWeek: 50,
    topRepCash: 72000,
    showRatePct: 79,
    closeRatePct: 60,
    avgDealSize: 7000,
    leaderboard: [
      { name: "Maria Gomez",   callsMade: 78, callsAnswered: 52, demosSet: 19, demosShowed: 15, pitched: 15, dealsClosed: 9, cashCollected: 72000, answerRate: 66.7 },
      { name: "James Carter",  callsMade: 45, callsAnswered: 30, demosSet: 12, demosShowed: 9,  pitched: 9,  dealsClosed: 4, cashCollected: 20000, answerRate: 66.7 },
      { name: "Ryan Brooks",   callsMade: 30, callsAnswered: 18, demosSet: 6,  demosShowed: 4,  pitched: 4,  dealsClosed: 1, cashCollected: 8000,  answerRate: 60.0 },
      { name: "Evan Bautista", callsMade: 42, callsAnswered: 28, demosSet: 10, demosShowed: 8,  pitched: 7,  dealsClosed: 3, cashCollected: 0,     answerRate: 66.7 },
    ],
  },
  clients: [
    {
      name: "Alpha Coaching",
      goLiveDate: "2026-02-01",
      setupFee: 3000,
      revSharePct: 10,
      revSharePaid: true,
      cashCollectedMTD: 18500,
      cumulativeRevenue: 54200,
      checkInScore: 9,
    },
    {
      name: "Peak Performance",
      goLiveDate: "2026-03-10",
      setupFee: 2500,
      revSharePct: 8,
      revSharePaid: false,
      cashCollectedMTD: 9200,
      cumulativeRevenue: 14700,
      checkInScore: 6,
    },
    {
      name: "Momentum Media",
      goLiveDate: "2026-04-01",
      setupFee: 4000,
      revSharePct: 12,
      revSharePaid: false,
      cashCollectedMTD: 3100,
      cumulativeRevenue: 3100,
      checkInScore: 3,
    },
  ],
};
