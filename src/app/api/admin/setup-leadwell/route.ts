import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { kv } from "@vercel/kv";
import { hashPassword } from "@/lib/password";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

// ─── Sheet Headers ────────────────────────────────────────────────────────────

const DAILY_LOG_HEADERS = [
  "Date", "Name", "Calls Made", "Calls Answered", "Conversations", "Fact Finds",
  "Zooms Booked", "Zooms Showed", "No-Showed", "Show Rate", "Deals Closed", "Cash Collected",
];

const DEAL_LOG_HEADERS = [
  "Date", "Client Name", "Offer", "Gross Amount", "Processor", "Processor Fee",
  "Net After Fees", "Lead Source", "Setter", "Closer", "Caelum 15%", "Media Buyer 5%",
  "Setter Pay", "Closer Pay", "Total Payouts", "Evan Take Home", "Payout Status", "Notes", "Deal ID",
];

const DAILY_ACTIVITY_HEADERS = [
  "Date", "Name", "Calls Made", "Calls Answered", "Demos Set", "Demos Showed",
  "Pitched", "Closed", "Cash Collected",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function colLetter(count: number) {
  return String.fromCharCode(64 + count); // 1→A, 12→L, etc.
}

async function createSheet(
  sheets: ReturnType<typeof google.sheets>,
  drive: ReturnType<typeof google.drive>,
  title: string,
  tabName: string,
  headers: string[],
): Promise<{ id: string; url: string }> {
  // Create spreadsheet
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: tabName, sheetId: 0 } }],
    },
  });
  const spreadsheetId = res.data.spreadsheetId!;

  // Write headers
  const endCol = colLetter(headers.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:${endCol}1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] },
  });

  // Freeze row 1
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount",
        },
      }],
    },
  });

  // Share with impersonation email so it appears in Caelum's Drive
  const shareEmail = process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL;
  if (shareEmail) {
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "writer", type: "user", emailAddress: shareEmail },
      sendNotificationEmail: false,
    });
  }

  return {
    id: spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SA_EMAIL,
      private_key: process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  const sheetsApi = google.sheets({ version: "v4", auth });
  const driveApi  = google.drive({ version: "v3", auth });

  // ── Create all 6 spreadsheets ──────────────────────────────────────────────

  const [kpiTracker, dealLog, izaiah, sylis, fadi, kevin] = await Promise.all([
    createSheet(sheetsApi, driveApi, "Leadwell KPI Tracker",       "Daily Log",      DAILY_LOG_HEADERS),
    createSheet(sheetsApi, driveApi, "Leadwell Deal Log",           "Deal Log",       DEAL_LOG_HEADERS),
    createSheet(sheetsApi, driveApi, "Leadwell — Izaiah Dingman",  "Daily Activity", DAILY_ACTIVITY_HEADERS),
    createSheet(sheetsApi, driveApi, "Leadwell — Sylis Snyder",    "Daily Activity", DAILY_ACTIVITY_HEADERS),
    createSheet(sheetsApi, driveApi, "Leadwell — Fadi Lebsir",     "Daily Activity", DAILY_ACTIVITY_HEADERS),
    createSheet(sheetsApi, driveApi, "Leadwell — Kevin Korona",    "Daily Activity", DAILY_ACTIVITY_HEADERS),
  ]);

  // ── Add Leadwell staff to KV registry ─────────────────────────────────────

  const TEMP_PASSWORD = "leadwell2026";

  const newStaff: StaffMeta[] = [
    {
      id: "celest-fernandez",
      name: "Celest Fernandez",
      password: hashPassword(TEMP_PASSWORD),
      createdAt: new Date().toISOString(),
      role: "closer",
    },
    {
      id: "izaiah-dingman",
      name: "Izaiah Dingman",
      password: hashPassword(TEMP_PASSWORD),
      createdAt: new Date().toISOString(),
      role: "setter",
      sheetId: izaiah.id,
    },
    {
      id: "sylis-snyder",
      name: "Sylis Snyder",
      password: hashPassword(TEMP_PASSWORD),
      createdAt: new Date().toISOString(),
      role: "setter",
      sheetId: sylis.id,
    },
    {
      id: "fadi-lebsir",
      name: "Fadi Lebsir",
      password: hashPassword(TEMP_PASSWORD),
      createdAt: new Date().toISOString(),
      role: "setter",
      sheetId: fadi.id,
    },
    {
      id: "kevin-korona",
      name: "Kevin Korona",
      password: hashPassword(TEMP_PASSWORD),
      createdAt: new Date().toISOString(),
      role: "setter",
      sheetId: kevin.id,
    },
  ];

  // Merge into existing registry (don't clobber existing SNS staff)
  const existing = await kv.get<StaffMeta[]>(STAFF_KV_KEY) ?? [];
  const existingIds = new Set(existing.map(s => s.id));
  const toAdd = newStaff.filter(s => !existingIds.has(s.id));
  await kv.set(STAFF_KV_KEY, [...existing, ...toAdd]);

  return NextResponse.json({
    ok: true,
    tempPassword: TEMP_PASSWORD,
    addedStaff: toAdd.map(s => s.name),
    skippedStaff: newStaff.filter(s => existingIds.has(s.id)).map(s => s.name),
    sheets: { kpiTracker, dealLog, izaiah, sylis, fadi, kevin },
    envVars: {
      LEADWELL_SHEETS_KPI_ID: kpiTracker.id,
      LEADWELL_SHEETS_DEAL_LOG_ID: dealLog.id,
    },
  });
}
