/**
 * Generates the exact data to paste into a StackNScale test Google Sheet.
 * Creates CSV files in scripts/test-data/ you can import into Google Sheets.
 *
 * Run: node scripts/create-test-sheet.mjs
 *
 * Then in Google Sheets:
 *   1. Create a new spreadsheet
 *   2. File > Import each CSV into its own tab (or paste the printed data)
 *   3. Share → "Anyone with the link" → Viewer
 *   4. Paste the sheet URL into the app's integrations
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dir, "test-data");
mkdirSync(outDir, { recursive: true });

// ── Tab 0: Dashboard Summary ─────────────────────────────────────────────────
const tab0 = [
  [
    "Cash Collected MTD","Cash Collected Last Month","Net Revenue MTD",
    "Leads This Month","Total Deals Closed MTD","MRR",
    "Total Refund","Monthly Goal","Cost Per Close","Avg Lead Response Min",
    "Calls Made","Calls Answered","Demos Set","Demos Showed","Pitched","Closed",
    "Answer Rate","Show Rate","Close Rate","Demo To Close",
    "Total Ad Spend","Total Leads","CPL","ROAS","CTR","CPC",
    "Impressions","Reach","Insta CPL",
    "Cash Collected Week","Deal Close","Calls Made Week",
    "Rate Of","Close Rate Week","Close Rate Pct","Show Rate Pct",
    "Avg Deal Size","Top Rep Cash",
  ],
  [
    52000,38000,50200,
    156,21,22000,
    800,80000,47,4.1,
    225,148,55,43,41,21,
    65.8,78.2,51.2,48.8,
    1400,167,8.4,16.3,9.8,1.76,
    74200,59100,7.2,
    9,21,225,
    74.5,52.4,75.6,83,
    9500,31000,
  ],
].map(r => r.join(",")).join("\n");

// ── Tab 1: Revenue Log ────────────────────────────────────────────────────────
const tab1 = [
  ["Date","Amount","Processor","Product"],
  ["Apr 1 2026",8500,"Stripe","Scale (Tier 3)"],
  ["Apr 3 2026",5000,"Stripe","Growth (Tier 2)"],
  ["Apr 5 2026",8500,"Stripe","Scale (Tier 3)"],
  ["Apr 7 2026",3500,"PayPal","Starter (Tier 1)"],
  ["Apr 9 2026",8500,"Stripe","Scale (Tier 3)"],
  ["Apr 12 2026",5000,"Stripe","Growth (Tier 2)"],
  ["Apr 14 2026",1200,"Stripe","Starter (Tier 1)"],
  ["Apr 17 2026",8500,"Stripe","Scale (Tier 3)"],
  ["Apr 19 2026",5000,"Stripe","Growth (Tier 2)"],
  ["Apr 21 2026",3500,"PayPal","Starter (Tier 1)"],
].map(r => r.join(",")).join("\n");

// ── Tab 2: DM/Calls Production ────────────────────────────────────────────────
const tab2 = [
  ["Rep Name","Calls Made","Calls Answered","Demos Set","Demos Showed","Pitched","Deals Closed","Cash Collected"],
  ["Maria Gomez",85,58,22,18,17,10,31000],
  ["James Carter",52,35,14,11,10,5,12500],
  ["Ryan Brooks",55,36,12,9,8,4,8500],
  ["Evan Bautista",33,19,7,5,6,2,5000],
].map(r => r.join(",")).join("\n");

// ── Write CSV files ───────────────────────────────────────────────────────────
writeFileSync(join(outDir, "tab0-dashboard-summary.csv"), tab0);
writeFileSync(join(outDir, "tab1-revenue-log.csv"), tab1);
writeFileSync(join(outDir, "tab2-dm-calls-production.csv"), tab2);

console.log(`
✅ CSV files written to scripts/test-data/
   - tab0-dashboard-summary.csv
   - tab1-revenue-log.csv
   - tab2-dm-calls-production.csv

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO SET UP THE GOOGLE SHEET (2 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to sheets.google.com → create a new spreadsheet
   Name it: "StackNScale — Test Dashboard"

2. Rename "Sheet1" tab → "Dashboard Summary"
   File > Import > Upload tab0-dashboard-summary.csv
   → Import location: "Replace current sheet"

3. Add new tab → name it "Revenue Log"
   File > Import → tab1-revenue-log.csv
   → Import location: "Replace current sheet"

4. Add new tab → name it "DM Calls Production"
   File > Import → tab2-dm-calls-production.csv
   → Import location: "Replace current sheet"

   ⚠️  Tab order MUST be: Dashboard Summary (gid=0), Revenue Log (gid=1), DM Calls Production (gid=2)
   Drag tabs left/right to reorder if needed.

5. Share → "Anyone with the link" → Viewer → Copy link

6. Paste the link into the app:
   Settings → Integrations → Google Sheets URL → Save

7. Trigger sync:
   POST http://localhost:3000/api/sync/sheets  (or use the sync button in-app)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPECTED DASHBOARD NUMBERS AFTER SYNC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cash Collected MTD : $52,000
  Leads This Month   : 156
  Deals Closed MTD   : 21
  MRR                : $22,000
  Monthly Goal       : $80,000 (65% pace)
  Revenue Chart      : 10 April entries
  Net by Product     : Scale $34k / Growth $15k / Starter $8.2k
  Net by Processor   : Stripe $59k / PayPal $7k
  Rep Leaderboard    : Maria ($31k) > James ($12.5k) > Ryan ($8.5k) > Evan ($5k)
`);
