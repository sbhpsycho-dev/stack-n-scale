import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { google } from "googleapis";
import type { Deal } from "@/lib/deal-types";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

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

  let leaderboard: typeof sheetLeaderboard;

  if (sheetLeaderboard.length > 0) {
    leaderboard = sheetLeaderboard;
  } else {
    // Build from deals KV + staff registry (all start at zero, grow as deals are logged)
    const [staffRegistry, dealIds] = await Promise.all([
      kv.get<StaffMeta[]>(STAFF_KV_KEY),
      kv.get<string[]>("sns:deals:index"),
    ]);
    const staff = staffRegistry ?? [];
    const ids   = dealIds ?? [];
    const deals = ids.length > 0
      ? (await Promise.all(ids.map(id => kv.get<Deal>(`sns:deals:${id}`)))).filter((d): d is Deal => d !== null)
      : [];

    type RepStats = { cashCollected: number; demosSet: number; dealsClosed: number };
    const repMap = new Map<string, RepStats>();
    for (const s of staff) {
      repMap.set(s.name, { cashCollected: 0, demosSet: 0, dealsClosed: 0 });
    }
    for (const deal of deals) {
      if (deal.setter) {
        const r = repMap.get(deal.setter) ?? { cashCollected: 0, demosSet: 0, dealsClosed: 0 };
        repMap.set(deal.setter, { ...r, demosSet: r.demosSet + 1 });
      }
      if (deal.closer) {
        const r = repMap.get(deal.closer) ?? { cashCollected: 0, demosSet: 0, dealsClosed: 0 };
        repMap.set(deal.closer, { ...r, dealsClosed: r.dealsClosed + 1, cashCollected: r.cashCollected + deal.grossAmount });
      }
    }
    leaderboard = Array.from(repMap.entries()).map(([name, s]) => ({
      name,
      cashCollected: s.cashCollected,
      demosSet:      s.demosSet,
      demosShowed:   0,
      dealsClosed:   s.dealsClosed,
      showRate:      0,
      closeRate:     s.demosSet > 0 ? parseFloat(((s.dealsClosed / s.demosSet) * 100).toFixed(1)) : 0,
    }));
  }

  const totalCash    = leaderboard.reduce((s, r) => s + r.cashCollected, 0);
  const totalDeals   = leaderboard.reduce((s, r) => s + r.dealsClosed, 0);
  const avgCloseRate = leaderboard.length > 0
    ? parseFloat((leaderboard.reduce((s, r) => s + r.closeRate, 0) / leaderboard.length).toFixed(1))
    : 0;

  return Response.json({ leaderboard, totalCash, totalDeals, avgCloseRate });
}
