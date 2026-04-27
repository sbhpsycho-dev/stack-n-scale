import { google } from "googleapis";

const SHEET_ID = "1uStqjKxygyGjuBiXDBDKbZ4effE4BfoBAKqjrg0LyZk";

const SA_EMAIL = "stack-n-scale-drive@sns-clients-494517.iam.gserviceaccount.com";
const SA_KEY = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!SA_KEY) {
  console.error("Set GOOGLE_SA_PRIVATE_KEY in your environment");
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: SA_EMAIL, private_key: SA_KEY },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// Dark brand palette
const DARK_BG   = { red: 0.063, green: 0.063, blue: 0.063 }; // #101010
const GOLD      = { red: 0.784, green: 0.565, blue: 0.165 }; // #c8902a
const WHITE     = { red: 1, green: 1, blue: 1 };
const LIGHT_ROW = { red: 0.97, green: 0.96, blue: 0.94 };    // warm off-white
const BORDER    = { red: 0.8,  green: 0.8,  blue: 0.8 };

function headerFormat(sheetId) {
  return [
    // Background + text colour for row 1
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: DARK_BG,
            textFormat: { bold: true, fontSize: 10, foregroundColor: GOLD,
              fontFamily: "Arial" },
            verticalAlignment: "MIDDLE",
            horizontalAlignment: "LEFT",
            padding: { top: 8, bottom: 8, left: 10, right: 10 },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment,padding)",
      },
    },
    // Freeze row 1
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    // Row height for header
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 40 },
        fields: "pixelSize",
      },
    },
    // Alternating row colours for data rows
    {
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 1000 },
          rowProperties: {
            headerColor: DARK_BG,
            firstBandColor: WHITE,
            secondBandColor: LIGHT_ROW,
          },
        },
      },
    },
  ];
}

function colWidths(sheetId, widths) {
  return widths.map((px, i) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
      properties: { pixelSize: px },
      fields: "pixelSize",
    },
  }));
}

async function run() {
  // ── Get current sheet IDs ────────────────────────────────────────────────
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = meta.data.sheets.map(s => ({
    id: s.properties.sheetId,
    title: s.properties.title,
  }));

  const sheet1 = existing[0];
  let sheet2 = existing[1];

  const requests = [];

  // ── Rename Sheet1 ────────────────────────────────────────────────────────
  requests.push({
    updateSheetProperties: {
      properties: { sheetId: sheet1.id, title: "Onboarding Forms" },
      fields: "title",
    },
  });

  // ── Add Sheet2 if missing, or rename if exists ───────────────────────────
  if (!sheet2) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: "ID Verification" } } }],
      },
    });
    sheet2 = {
      id: addRes.data.replies[0].addSheet.properties.sheetId,
      title: "ID Verification",
    };
  } else {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: sheet2.id, title: "ID Verification" },
        fields: "title",
      },
    });
  }

  // ── Apply formatting to both sheets ─────────────────────────────────────
  requests.push(
    ...headerFormat(sheet1.id),
    ...colWidths(sheet1.id, [160, 160, 220, 260, 260, 220, 220, 220, 220, 260, 260, 260]),
    ...headerFormat(sheet2.id),
    ...colWidths(sheet2.id, [160, 160, 220, 140, 100]),
  );

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });

  // ── Write headers ────────────────────────────────────────────────────────
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: "Onboarding Forms!A1:L1",
          values: [[
            "Submitted At", "Name", "Email", "Motivation",
            "Why SNS", "30-Day Goal", "3-Month Goal", "6-Month Goal",
            "1-Year Goal", "Biggest Challenge", "Success in 90 Days", "Additional Notes",
          ]],
        },
        {
          range: "ID Verification!A1:E1",
          values: [["Submitted At", "Name", "Email", "Status", "Signature"]],
        },
      ],
    },
  });

  console.log("✓ Sheets formatted and headers added.");
}

run().catch(err => { console.error(err.message); process.exit(1); });
