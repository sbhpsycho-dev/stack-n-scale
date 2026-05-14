/**
 * Finishes setting up the 4 Stack N Scale KPI tracker sheets that were created
 * in Google Drive via the MCP. For each sheet this script:
 *   1. Renames the first tab to "KPI Metrics" (if needed)
 *   2. Adds "Revenue Log" and "Sales Reps" tabs
 *   3. Writes headers + seed values into all tabs
 *   4. Applies dark-brand formatting (gold headers on black)
 *   5. Makes the sheet publicly readable so syncSheets() can pull CSV
 *
 * PRE-REQUISITE (one-time, ~2 min):
 *   Open each sheet URL below and share it with the SA email (Editor access):
 *     stack-n-scale-drive@sns-clients-494517.iam.gserviceaccount.com
 *   Shortcut: in Google Sheets → Share → paste the SA email → Editor → Send
 *
 * Run:
 *   node --env-file=.env.local scripts/finalize-kpi-sheets.mjs
 */

import { google } from "googleapis";

const SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const SA_KEY   = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!SA_EMAIL || !SA_KEY) {
  console.error("❌  Set GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY in .env.local");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: SA_EMAIL, private_key: SA_KEY },
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

const sheets = google.sheets({ version: "v4", auth });
const drive  = google.drive({ version: "v3", auth });

// ── Sheet IDs created via MCP on 2026-04-27 ───────────────────────────────────
const TARGETS = [
  {
    label: "Stack N Scale (Admin)",
    id: "1rCKimgpr2oSaLNNrHRVExNekXGMLPb0mtvoBKkWFG68",
  },
  {
    label: "Alpha Coaching",
    id: "1_A618hw2Ub244qw_6QgfLCVeEVfICuCxFebTYKrlY6M",
  },
  {
    label: "Peak Performance",
    id: "1hdeAzEl_qKepBk6Rb9K7G5oHErHzWk2WJTOeIznOZAY",
  },
  {
    label: "Momentum Media",
    id: "1Tv1yy8qjVQ68nq0cvKlyMFSGzoKiK9oJ1dGkc8B7jms",
  },
];

// ── Tab headers ───────────────────────────────────────────────────────────────
const KPI_HEADERS = [
  "Cash Collected MTD", "Cash Collected Last Month", "Net Revenue MTD",
  "Leads This Month", "Total Deals Closed MTD", "MRR",
  "Total Refund", "Monthly Goal", "Cost Per Close", "Avg Lead Response Min",
  "Calls Made", "Calls Answered", "Demos Set", "Demos Showed", "Pitched", "Closed",
  "Answer Rate", "Show Rate", "Close Rate", "Demo To Close",
  "Total Ad Spend", "Total Leads", "CPL", "ROAS", "CTR", "CPC",
  "Impressions", "Reach", "Insta CPL",
  "Cash Collected Week", "Deal Close", "Calls Made Week",
  "Rate Of", "Close Rate Week", "Close Rate Pct", "Show Rate Pct",
  "Avg Deal Size", "Top Rep Cash",
];

const KPI_BLANK = KPI_HEADERS.map(() => 0);

const REV_HEADERS  = ["Date", "Amount", "Processor", "Product"];
const REPS_HEADERS = [
  "Rep Name", "Calls Made", "Calls Answered",
  "Demos Set", "Demos Showed", "Pitched",
  "Deals Closed", "Cash Collected",
];

// ── Brand colours ─────────────────────────────────────────────────────────────
const DARK_BG = { red: 0.063, green: 0.063, blue: 0.063 };
const GOLD    = { red: 0.784, green: 0.565, blue: 0.165 };

function headerFormatRequests(sheetId) {
  return [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: DARK_BG,
            textFormat: {
              bold: true, fontSize: 10,
              foregroundColor: GOLD, fontFamily: "Arial",
            },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "LEFT",
            padding: { top: 8, bottom: 8, left: 10, right: 10 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment,padding)",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 40 },
        fields: "pixelSize",
      },
    },
  ];
}

// ── Process one sheet ─────────────────────────────────────────────────────────
async function finalize(id) {
  // 1. Get existing sheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const existing = meta.data.sheets.map(s => ({
    id: s.properties.sheetId,
    title: s.properties.title,
  }));

  const firstSheet = existing[0];
  const hasRevLog  = existing.some(s => s.title === "Revenue Log");
  const hasReps    = existing.some(s => s.title === "Sales Reps");

  const requests = [];

  // 2. Rename first tab to "KPI Metrics" if needed
  if (firstSheet.title !== "KPI Metrics") {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: firstSheet.id, title: "KPI Metrics" },
        fields: "title",
      },
    });
  }

  // 3. Add missing tabs
  if (!hasRevLog) {
    requests.push({ addSheet: { properties: { title: "Revenue Log", index: 1 } } });
  }
  if (!hasReps) {
    requests.push({ addSheet: { properties: { title: "Sales Reps", index: 2 } } });
  }

  let revLogId, salesRepsId;

  if (requests.length > 0) {
    const batchRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests },
    });
    for (const reply of batchRes.data.replies ?? []) {
      if (reply.addSheet) {
        const t = reply.addSheet.properties.title;
        if (t === "Revenue Log") revLogId = reply.addSheet.properties.sheetId;
        if (t === "Sales Reps")  salesRepsId = reply.addSheet.properties.sheetId;
      }
    }
  }

  // Fall back to looking them up if they already existed
  if (!revLogId)   revLogId   = existing.find(s => s.title === "Revenue Log")?.id;
  if (!salesRepsId) salesRepsId = existing.find(s => s.title === "Sales Reps")?.id;

  // 4. Format all 3 header rows
  const formatRequests = [
    ...headerFormatRequests(firstSheet.id),
    ...(revLogId   ? headerFormatRequests(revLogId)   : []),
    ...(salesRepsId ? headerFormatRequests(salesRepsId) : []),
  ];

  if (formatRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: formatRequests },
    });
  }

  // 5. Write headers + empty values row to all tabs
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: "KPI Metrics!A1", values: [KPI_HEADERS]  },
        { range: "KPI Metrics!A2", values: [KPI_BLANK]    },
        { range: "Revenue Log!A1", values: [REV_HEADERS]  },
        { range: "Sales Reps!A1",  values: [REPS_HEADERS] },
      ],
    },
  });

  // 6. Make publicly readable (required for syncSheets CSV export)
  await drive.permissions.create({
    fileId: id,
    requestBody: { role: "reader", type: "anyone" },
  });

  return `https://docs.google.com/spreadsheets/d/${id}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("Finalizing KPI tracker sheets...\n");

const results = [];
for (const { label, id } of TARGETS) {
  try {
    const url = await finalize(id);
    results.push({ label, url });
    console.log(`✅  ${label.padEnd(28)} ${url}`);
  } catch (err) {
    const hint = err.message.includes("403") || err.message.includes("permission")
      ? " (share this sheet with the SA email first — see script header)"
      : "";
    console.error(`❌  ${label.padEnd(28)} ${err.message}${hint}`);
  }
}

if (results.length) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Open each KPI Tracker sheet above
2. In "KPI Metrics" tab — fill row 2 with your real numbers
3. Add rows to "Revenue Log" for each payment received
4. Add rows to "Sales Reps" for each rep (one row per rep)
5. Dashboard → Settings → Integrations → Google Sheets
   → paste the matching URL → Save → Sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
