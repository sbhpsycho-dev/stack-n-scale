import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { google } from "googleapis";
import type { SalesData } from "@/lib/sales-data";
import { STAFF_KV_KEY } from "@/lib/staff-registry";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const report: Record<string, unknown> = {};

  // 1. Env vars present (not values)
  report.env = {
    GOOGLE_SA_EMAIL:              !!process.env.GOOGLE_SA_EMAIL,
    GOOGLE_SA_PRIVATE_KEY:        !!process.env.GOOGLE_SA_PRIVATE_KEY,
    GOOGLE_SHEETS_SETTER_KPI_ID:  !!process.env.GOOGLE_SHEETS_SETTER_KPI_ID,
    GOOGLE_SHEETS_MASTER_LOG_ID:  !!process.env.GOOGLE_SHEETS_MASTER_LOG_ID,
    sheetId: process.env.GOOGLE_SHEETS_SETTER_KPI_ID ?? null,
  };

  // 2. Google Sheet tab probe
  const sheetId = process.env.GOOGLE_SHEETS_SETTER_KPI_ID;
  const email   = process.env.GOOGLE_SA_EMAIL;
  const key     = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!sheetId || !email || !key) {
    report.sheet = { error: "Missing env vars — cannot reach sheet" };
  } else {
    const auth   = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
    const sheets = google.sheets({ version: "v4", auth });
    const tabs: Record<string, unknown> = {};
    for (const tab of ["Leaderboard", "Weekly Summary", "Daily Log", "Sheet1"]) {
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${tab}!A1:Z3` });
        tabs[tab] = {
          rowCount: res.data.values?.length ?? 0,
          headers:  res.data.values?.[0] ?? [],
          firstRow: res.data.values?.[1] ?? [],
        };
      } catch (e: unknown) {
        tabs[tab] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    report.sheet = tabs;
  }

  // 3. KV snapshot
  const [dash, staffReg, dealIndex] = await Promise.all([
    kv.get<SalesData>("sns-dashboard-v1"),
    kv.get(STAFF_KV_KEY),
    kv.get<string[]>("sns:deals:index"),
  ]);

  report.kv = {
    "sns-dashboard-v1": {
      exists: !!dash,
      repsLeaderboardLength: dash?.reps?.leaderboard?.length ?? 0,
      repsLeaderboardSample: dash?.reps?.leaderboard?.slice(0, 3) ?? [],
    },
    staffRegistry: {
      exists: !!staffReg,
      value: staffReg,
    },
    dealsIndex: {
      exists: !!dealIndex,
      count: Array.isArray(dealIndex) ? dealIndex.length : 0,
      sample: Array.isArray(dealIndex) ? dealIndex.slice(0, 5) : [],
    },
  };

  return Response.json(report, { status: 200 });
}
