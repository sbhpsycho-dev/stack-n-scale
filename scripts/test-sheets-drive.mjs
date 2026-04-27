import { google } from "googleapis";
import { Readable } from "stream";

const SHEET_ID     = "1uStqjKxygyGjuBiXDBDKbZ4effE4BfoBAKqjrg0LyZk";
const ROOT_FOLDER  = "1VCraA8fUGeMbT_LnnkA_60CqU9b9WVJs";
const SA_EMAIL     = "stack-n-scale-drive@sns-clients-494517.iam.gserviceaccount.com";
const SA_KEY       = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!SA_KEY) { console.error("Set GOOGLE_SA_PRIVATE_KEY"); process.exit(1); }

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: SA_EMAIL, private_key: SA_KEY },
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const sheets = google.sheets({ version: "v4", auth });
const drive  = google.drive({ version: "v3", auth });

const now  = new Date().toISOString();
const name = "Test Client";
const email = "test@stacknscale.com";

// ── 1. Append to Onboarding Forms sheet ────────────────────────────────────
console.log("Writing to Onboarding Forms sheet...");
await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: "Onboarding Forms!A:L",
  valueInputOption: "RAW",
  requestBody: {
    values: [[
      now, name, email,
      "Test motivation", "Test why SNS",
      "30 day goal", "3 month goal", "6 month goal", "1 year goal",
      "Biggest challenge", "Success in 90 days", "Additional notes",
    ]],
  },
});
console.log("✓ Row added to Onboarding Forms");

// ── 2. Append to ID Verification sheet ─────────────────────────────────────
console.log("Writing to ID Verification sheet...");
await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: "ID Verification!A:E",
  valueInputOption: "RAW",
  requestBody: { values: [[now, name, email, "submitted", "yes"]] },
});
console.log("✓ Row added to ID Verification");

// ── 3. Create a temp test folder in root ───────────────────────────────────
console.log("Creating test client folder + subfolders in Drive...");
const clientFolder = await drive.files.create({
  requestBody: {
    name: `client - ${name} (TEST)`,
    mimeType: "application/vnd.google-apps.folder",
    parents: [ROOT_FOLDER],
  },
  fields: "id",
});
const clientFolderId = clientFolder.data.id;

await Promise.all([
  drive.files.create({
    requestBody: { name: "Onboarding", mimeType: "application/vnd.google-apps.folder", parents: [clientFolderId] },
    fields: "id",
  }),
  drive.files.create({
    requestBody: { name: "ID Verification", mimeType: "application/vnd.google-apps.folder", parents: [clientFolderId] },
    fields: "id",
  }),
]);
console.log("✓ Client folder + subfolders created in Drive");

console.log(`\n✅ All tests passed.\n  Sheets: https://docs.google.com/spreadsheets/d/${SHEET_ID}\n  Drive folder: https://drive.google.com/drive/folders/${clientFolderId}`);
