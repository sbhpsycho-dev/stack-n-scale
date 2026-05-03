import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { google } from "googleapis";
import { type SalesData, SEED } from "@/lib/sales-data";

function getAuth() {
  const client_email = process.env.GOOGLE_SA_EMAIL;
  const private_key  = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) return null;
  return new google.auth.GoogleAuth({
    credentials: { client_email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function readSetterSheet() {
  const sheetId = process.env.GOOGLE_SHEETS_SETTER_KPI_ID;
  if (!sheetId) return null;
  const auth = getAuth();
  if (!auth) return null;
  const sheets = google.sheets({ version: "v4", auth });
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Daily Log!A1:Z",
    });
    return res.data.values ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Fallback: use GHL-synced leaderboard from SalesData
  const salesData = (await kv.get<SalesData>("sns-dashboard-v1")) ?? SEED;
  const ghlLeaderboard = salesData.reps.leaderboard ?? [];

  // Try reading from Setter KPI Tracker sheet
  const rows = await readSetterSheet();
  let sheetLeaderboard: {
    name: string;
    cashCollected: number;
    demosSet: number;
    demosShowed: number;
    dealsClosed: number;
    showRate: number;
    closeRate: number;
  }[] = [];

  if (rows && rows.length >= 2) {
    const headers = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
    const col = (name: string) => headers.indexOf(name);

    const nameIdx       = col("name") >= 0 ? col("name") : col("settername") >= 0 ? col("settername") : 0;
    const cashIdx       = col("cashcollected");
    const demosSetIdx   = col("demosset");
    const demosShowIdx  = col("demosshowed") >= 0 ? col("demosshowed") : col("showedups");
    const closedIdx     = col("dealsclosed") >= 0 ? col("dealsclosed") : col("closed");

    sheetLeaderboard = rows.slice(1)
      .map((row: string[]) => {
        const name        = row[nameIdx]?.trim() ?? "";
        const cash        = parseFloat((row[cashIdx] ?? "0").replace(/[$,]/g, "")) || 0;
        const demosSet    = parseFloat(row[demosSetIdx]  ?? "0") || 0;
        const demosShowed = parseFloat(row[demosShowIdx] ?? "0") || 0;
        const closed      = parseFloat(row[closedIdx]    ?? "0") || 0;
        const showRate    = demosSet  > 0 ? parseFloat(((demosShowed / demosSet)  * 100).toFixed(1)) : 0;
        const closeRate   = demosShowed > 0 ? parseFloat(((closed / demosShowed) * 100).toFixed(1)) : 0;
        return { name, cashCollected: cash, demosSet, demosShowed, dealsClosed: closed, showRate, closeRate };
      })
      .filter(r => r.name);
  }

  const leaderboard = sheetLeaderboard.length > 0 ? sheetLeaderboard : ghlLeaderboard.map(r => ({
    name:          r.name,
    cashCollected: r.cashCollected,
    demosSet:      r.demosSet,
    demosShowed:   r.demosShowed,
    dealsClosed:   r.dealsClosed,
    showRate:      r.demosSet > 0 ? parseFloat(((r.demosShowed / r.demosSet) * 100).toFixed(1)) : 0,
    closeRate:     r.demosShowed > 0 ? parseFloat(((r.dealsClosed / r.demosShowed) * 100).toFixed(1)) : 0,
  }));

  const totalCash    = leaderboard.reduce((s, r) => s + r.cashCollected, 0);
  const totalDeals   = leaderboard.reduce((s, r) => s + r.dealsClosed, 0);
  const avgCloseRate = leaderboard.length > 0
    ? parseFloat((leaderboard.reduce((s, r) => s + r.closeRate, 0) / leaderboard.length).toFixed(1))
    : 0;

  return Response.json({ leaderboard, totalCash, totalDeals, avgCloseRate });
}
