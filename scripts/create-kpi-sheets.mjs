/**
 * Creates Google Sheets KPI trackers for Stack N Scale admin + each registered client.
 * Each sheet has 3 tabs that match what syncSheets() expects:
 *   Tab 0 (gid=0): KPI Metrics    — flat row: header | values
 *   Tab 1 (gid=1): Revenue Log    — Date, Amount, Processor, Product
 *   Tab 2 (gid=2): Sales Reps     — Rep Name, Calls Made, …
 *
 * Run:
 *   node --env-file=.env.local scripts/create-kpi-sheets.mjs
 *
 * Paste the output URLs into Dashboard → Settings → Integrations → Google Sheets.
 */

import { google } from "googleapis";

const SA_EMAIL        = process.env.GOOGLE_SA_EMAIL;
const SA_KEY          = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
const IMPERSONATE     = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL;
const PARENT_FOLDER   = process.env.GOOGLE_DRIVE_CLIENTS_ROOT_FOLDER_ID;

if (!SA_EMAIL || !SA_KEY) {
  console.error("❌  Set GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY in .env.local");
  process.exit(1);
}

// Use domain-wide delegation (impersonate real user) to avoid SA quota limits
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: SA_EMAIL, private_key: SA_KEY },
  clientOptions: IMPERSONATE ? { subject: IMPERSONATE } : undefined,
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

const sheets = google.sheets({ version: "v4", auth });
const drive  = google.drive({ version: "v3", auth });

// ── Sheets to create ──────────────────────────────────────────────────────────
// Add or remove entries here to match your SEED_REGISTRY in sales-data.ts
const TARGETS = [
  { label: "Stack N Scale (Admin)",   title: "Stack N Scale — KPI Tracker"    },
  { label: "Alpha Coaching",          title: "Alpha Coaching — KPI Tracker"   },
  { label: "Peak Performance",        title: "Peak Performance — KPI Tracker" },
  { label: "Momentum Media",          title: "Momentum Media — KPI Tracker"   },
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

// Seed values row — matches the SEED object in sales-data.ts
const KPI_SEED_VALUES = [
  20001, 16200, 19501,
  125, 14, 13750,
  500, 70000, 57, 4.2,
  195, 128, 47, 36, 35, 17,
  65.32, 65.64, 48.57, 48.57,
  845, 113, 4, 15.8, 11, 2.05,
  59500, 48300, 3,
  5, 17, 195,
  75.7, 50, 48.57, 79,
  7000, 72000,
];

const REV_HEADERS  = ["Date", "Amount", "Processor", "Product"];
const REPS_HEADERS = [
  "Rep Name", "Calls Made", "Calls Answered",
  "Demos Set", "Demos Showed", "Pitched",
  "Deals Closed", "Cash Collected",
];

// ── Brand palette (dark theme matching the dashboard) ─────────────────────────
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
            textFormat: { bold: true, fontSize: 10, foregroundColor: GOLD, fontFamily: "Arial" },
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

// ── Create one sheet ──────────────────────────────────────────────────────────
async function createKpiSheet(title) {
  // 1. Create the spreadsheet via Drive API (same path as the working folder creation)
  const createBody = {
    name: title,
    mimeType: "application/vnd.google-apps.spreadsheet",
  };
  if (PARENT_FOLDER) createBody.parents = [PARENT_FOLDER];

  const driveRes = await drive.files.create({
    requestBody: createBody,
    fields: "id",
  });
  const spreadsheetId = driveRes.data.id;

  // 2. Get the auto-created default sheet (Sheet1) and rename it, then add the other 2 tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const defaultSheetId = meta.data.sheets[0].properties.sheetId;

  const addSheetsRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Rename default sheet to "KPI Metrics"
        {
          updateSheetProperties: {
            properties: { sheetId: defaultSheetId, title: "KPI Metrics" },
            fields: "title",
          },
        },
        // Add Revenue Log tab
        { addSheet: { properties: { title: "Revenue Log", index: 1 } } },
        // Add Sales Reps tab
        { addSheet: { properties: { title: "Sales Reps", index: 2 } } },
      ],
    },
  });

  // Build sheetId map from the batchUpdate replies
  const sheetMap = { "KPI Metrics": defaultSheetId };
  for (const reply of addSheetsRes.data.replies) {
    if (reply.addSheet) {
      sheetMap[reply.addSheet.properties.title] = reply.addSheet.properties.sheetId;
    }
  }

  // 3. Format all 3 header rows (dark bg, gold text, freeze, 40px height)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        ...headerFormatRequests(sheetMap["KPI Metrics"]),
        ...headerFormatRequests(sheetMap["Revenue Log"]),
        ...headerFormatRequests(sheetMap["Sales Reps"]),
      ],
    },
  });

  // 4. Write headers + seed data into each tab
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        // KPI Metrics: row 1 = headers, row 2 = seed values (edit these to enter real numbers)
        { range: "KPI Metrics!A1", values: [KPI_HEADERS]      },
        { range: "KPI Metrics!A2", values: [KPI_SEED_VALUES]   },
        // Revenue Log: headers only — add rows below for each payment received
        { range: "Revenue Log!A1",  values: [REV_HEADERS]      },
        // Sales Reps: headers only — add one row per rep
        { range: "Sales Reps!A1",   values: [REPS_HEADERS]     },
      ],
    },
  });

  // 5. Make publicly readable so syncSheets can export CSV without OAuth
  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: { role: "reader", type: "anyone" },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("Creating Stack N Scale KPI tracker sheets...\n");

const results = [];
for (const { label, title } of TARGETS) {
  try {
    const url = await createKpiSheet(title);
    results.push({ label, url });
    console.log(`✅  ${label.padEnd(28)} ${url}`);
  } catch (err) {
    console.error(`❌  ${label.padEnd(28)} ${err.message}`);
  }
}

if (results.length) {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEP — connect each sheet to the right dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Open each sheet URL above
2. Edit row 2 of "KPI Metrics" with your real numbers
3. Add rows to "Revenue Log" and "Sales Reps" as needed
4. In the dashboard: Settings → Integrations → Google Sheets
   → paste the matching sheet URL → Save → Sync
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}
