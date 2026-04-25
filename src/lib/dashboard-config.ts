export type BusinessType = "coaching" | "agency" | "ecommerce" | "saas" | "custom";

export type DashboardConfig = {
  businessType: BusinessType;
  tabs: {
    dashboard: boolean;
    pipeline: boolean;
    ads: boolean;
    reps: boolean;
    resources: boolean;
  };
  widgets: {
    kpiCards: boolean;
    monthlyGoal: boolean;
    reactivation: boolean;
    revenueChart: boolean;
    netByProduct: boolean;
    netByProcessor: boolean;
    checkInScores: boolean;
    paceToGoal: boolean;
    callMetrics: boolean;
    funnelChart: boolean;
    stageBreakdown: boolean;
    adMetrics: boolean;
    leadsOverTime: boolean;
    topAds: boolean;
    leaderboard: boolean;
    repCharts: boolean;
  };
};

export const BUSINESS_PRESETS: Record<BusinessType, DashboardConfig> = {
  coaching: {
    businessType: "coaching",
    tabs: { dashboard: true, pipeline: true, ads: false, reps: true, resources: true },
    widgets: {
      kpiCards: true, monthlyGoal: true, reactivation: true, revenueChart: true,
      netByProduct: true, netByProcessor: false, checkInScores: true, paceToGoal: true,
      callMetrics: true, funnelChart: true, stageBreakdown: false,
      adMetrics: false, leadsOverTime: false, topAds: false,
      leaderboard: true, repCharts: true,
    },
  },
  agency: {
    businessType: "agency",
    tabs: { dashboard: true, pipeline: true, ads: true, reps: true, resources: true },
    widgets: {
      kpiCards: true, monthlyGoal: true, reactivation: false, revenueChart: true,
      netByProduct: true, netByProcessor: true, checkInScores: false, paceToGoal: true,
      callMetrics: true, funnelChart: true, stageBreakdown: true,
      adMetrics: true, leadsOverTime: true, topAds: true,
      leaderboard: true, repCharts: true,
    },
  },
  ecommerce: {
    businessType: "ecommerce",
    tabs: { dashboard: true, pipeline: false, ads: true, reps: false, resources: true },
    widgets: {
      kpiCards: true, monthlyGoal: true, reactivation: false, revenueChart: true,
      netByProduct: true, netByProcessor: true, checkInScores: false, paceToGoal: true,
      callMetrics: false, funnelChart: false, stageBreakdown: false,
      adMetrics: true, leadsOverTime: true, topAds: true,
      leaderboard: false, repCharts: false,
    },
  },
  saas: {
    businessType: "saas",
    tabs: { dashboard: true, pipeline: true, ads: false, reps: false, resources: true },
    widgets: {
      kpiCards: true, monthlyGoal: true, reactivation: false, revenueChart: true,
      netByProduct: false, netByProcessor: false, checkInScores: false, paceToGoal: true,
      callMetrics: true, funnelChart: true, stageBreakdown: true,
      adMetrics: false, leadsOverTime: false, topAds: false,
      leaderboard: false, repCharts: false,
    },
  },
  custom: {
    businessType: "custom",
    tabs: { dashboard: true, pipeline: true, ads: true, reps: true, resources: true },
    widgets: {
      kpiCards: true, monthlyGoal: true, reactivation: true, revenueChart: true,
      netByProduct: true, netByProcessor: true, checkInScores: true, paceToGoal: true,
      callMetrics: true, funnelChart: true, stageBreakdown: true,
      adMetrics: true, leadsOverTime: true, topAds: true,
      leaderboard: true, repCharts: true,
    },
  },
};

export const DEFAULT_CONFIG: DashboardConfig = BUSINESS_PRESETS.coaching;
