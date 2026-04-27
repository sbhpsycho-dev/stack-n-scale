/**
 * Writes realistic test data directly to the Upstash KV store.
 * The app reads from KV key "sns-dashboard-v1" for the admin dashboard.
 *
 * Run: node scripts/seed-kv.mjs
 */

import { readFileSync } from "fs";

const envRaw = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);

const KV_URL   = env.KV_REST_API_URL;
const KV_TOKEN = env.KV_REST_API_TOKEN;

const testData = {
  dashboard: {
    cashCollectedMTD: 52000,
    cashCollectedLastMonth: 38000,
    netRevenueMTD: 50200,
    leadsThisMonth: 156,
    totalDealsClosedMTD: 21,
    mrr: 22000,
    totalRefund: 800,
    totalRefundPct: 0.0154,
    monthlyGoal: 80000,
    avgLeadResponseTimeMin: 4.1,
    costPerClose: 47,
    reactivation: { contacted: 184, replied: 51, booked: 17, closed: 7 },
    checkInScores: [
      { week: "Jan 6",  score: 6 },
      { week: "Jan 13", score: 7 },
      { week: "Jan 20", score: 7 },
      { week: "Feb 3",  score: 8 },
      { week: "Feb 10", score: 8 },
      { week: "Feb 17", score: 9 },
      { week: "Mar 3",  score: 9 },
      { week: "Mar 10", score: 10 },
    ],
    revenueOverTime: [
      { date: "Apr 1 2026",  amount: 8500  },
      { date: "Apr 3 2026",  amount: 5000  },
      { date: "Apr 5 2026",  amount: 8500  },
      { date: "Apr 7 2026",  amount: 3500  },
      { date: "Apr 9 2026",  amount: 8500  },
      { date: "Apr 12 2026", amount: 5000  },
      { date: "Apr 14 2026", amount: 1200  },
      { date: "Apr 17 2026", amount: 8500  },
      { date: "Apr 19 2026", amount: 5000  },
      { date: "Apr 21 2026", amount: 3500  },
    ],
    netByProduct: [
      { name: "Scale (Tier 3)",   amount: 34000 },
      { name: "Growth (Tier 2)",  amount: 15000 },
      { name: "Starter (Tier 1)", amount: 8200  },
    ],
    netByProcessor: [
      { name: "Stripe", amount: 59200 },
      { name: "PayPal", amount: 7000  },
    ],
  },
  pipeline: {
    callsMade: 225,
    callsAnswered: 148,
    demosSet: 55,
    demosShowed: 43,
    pitched: 41,
    closed: 21,
    answerRate: 65.8,
    showRate: 78.2,
    closeRate: 51.2,
    demoToClose: 48.8,
    funnelByWeek: [
      { week: "Apr 7",  callsMade: 108, callsAnswered: 71, demosSet: 26, demosShowed: 20, pitched: 19, closed: 10 },
      { week: "Apr 14", callsMade: 117, callsAnswered: 77, demosSet: 29, demosShowed: 23, pitched: 22, closed: 11 },
    ],
    stageBreakdown: [
      { stage: "New Lead",   count: 18 },
      { stage: "Contacted",  count: 9  },
      { stage: "Booked",     count: 7  },
      { stage: "Showed",     count: 5  },
      { stage: "Pitched",    count: 4  },
      { stage: "Closed Won", count: 4  },
      { stage: "Lost",       count: 3  },
    ],
  },
  ads: {
    totalAdSpend: 1400,
    totalLeads: 167,
    cpl: 8.4,
    roas: 16.3,
    ctr: 9.8,
    cpc: 1.76,
    impressions: 74200,
    reach: 59100,
    instaCPL: 7.2,
    leadsOverTime: [
      { date: "Apr 7",  leads: 38 },
      { date: "Apr 8",  leads: 52 },
      { date: "Apr 9",  leads: 29 },
      { date: "Apr 10", leads: 48 },
    ],
    leadsByCampaign: [
      { campaign: "Lead Gen — April",  leads: 84 },
      { campaign: "Scale — April",     leads: 62 },
      { campaign: "Brand Awareness",   leads: 21 },
    ],
    cplByAdSet: [
      { adSet: "Age 28-45",    cpl: 7.2 },
      { adSet: "Lookalike 2%", cpl: 8.9 },
      { adSet: "Interest",     cpl: 9.4 },
    ],
    topAds: [
      { name: "Creative A — Testimonial", leads: 71, cpl: 7.4,  roas: 12.1 },
      { name: "Creative B — Results",     leads: 58, cpl: 9.8,  roas: 9.3  },
      { name: "Creative C — Hook",        leads: 38, cpl: 11.2, roas: 6.1  },
    ],
    spendSplit: [
      { platform: "Facebook",  pct: 62.4 },
      { platform: "Instagram", pct: 37.6 },
    ],
  },
  reps: {
    cashCollectedWeek: 9,
    dealClose: 21,
    callsMadeWeek: 225,
    rateOf: 74.5,
    closeRateWeek: 52.4,
    topRepCash: 31000,
    showRatePct: 83,
    closeRatePct: 75.6,
    avgDealSize: 9500,
    leaderboard: [
      { name: "Maria Gomez",   callsMade: 85, callsAnswered: 58, demosSet: 22, demosShowed: 18, pitched: 17, dealsClosed: 10, cashCollected: 31000, answerRate: 68.2 },
      { name: "James Carter",  callsMade: 52, callsAnswered: 35, demosSet: 14, demosShowed: 11, pitched: 10, dealsClosed: 5,  cashCollected: 12500, answerRate: 67.3 },
      { name: "Ryan Brooks",   callsMade: 55, callsAnswered: 36, demosSet: 12, demosShowed: 9,  pitched: 8,  dealsClosed: 4,  cashCollected: 8500,  answerRate: 65.5 },
      { name: "Evan Bautista", callsMade: 33, callsAnswered: 19, demosSet: 7,  demosShowed: 5,  pitched: 6,  dealsClosed: 2,  cashCollected: 5000,  answerRate: 57.6 },
    ],
  },
  clients: [
    { name: "Alpha Coaching",   goLiveDate: "2026-01-15", setupFee: 3500, revSharePct: 10, revSharePaid: true,  cashCollectedMTD: 24000, cumulativeRevenue: 87400, checkInScore: 10 },
    { name: "Peak Performance", goLiveDate: "2026-02-20", setupFee: 2500, revSharePct: 8,  revSharePaid: true,  cashCollectedMTD: 18000, cumulativeRevenue: 41200, checkInScore: 8  },
    { name: "Momentum Media",   goLiveDate: "2026-03-10", setupFee: 4000, revSharePct: 12, revSharePaid: false, cashCollectedMTD: 10000, cumulativeRevenue: 17600, checkInScore: 6  },
  ],
  // Passwords must be set via the admin panel after seeding — do not hardcode them here.
  clientRegistry: [
    { id: "alpha-coaching",   name: "Alpha Coaching",   password: "" },
    { id: "peak-performance", name: "Peak Performance", password: "" },
    { id: "momentum-media",   name: "Momentum Media",   password: "" },
  ],
};

// Write to KV via Upstash REST API
const res = await fetch(`${KV_URL}/set/sns-dashboard-v1`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KV_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(testData),
});

const result = await res.json();

if (res.ok && result.result === "OK") {
  console.log("✅ Test data written to KV (key: sns-dashboard-v1)");
  console.log("\nExpected dashboard values:");
  console.log("  Cash Collected MTD : $52,000");
  console.log("  Leads This Month   : 156");
  console.log("  Deals Closed MTD   : 21");
  console.log("  MRR                : $22,000");
  console.log("  Monthly Goal       : $80,000");
  console.log("  Top Rep            : Maria Gomez ($31,000)");
  console.log("\nRun 'npm run dev' and check the dashboard!");
} else {
  console.error("❌ KV write failed:", result);
}
