import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { google } from "googleapis";
import type { Deal } from "@/lib/deal-types";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";
import type { SalesData } from "@/lib/sales-data";
import { getSheetsToken, sheetsGet } from "@/lib/sheets-sync";

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
  // Try tabs in priority order — Leaderboard (aggregated query) → Weekly Summary → Daily Log → Sheet1
  for (const tab of ["Leaderboard", "Weekly Summary", "Daily Log", "Sheet1"]) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tab}!A1:Z`,
      });
      if (res.data.values && res.data.values.length >= 2) return res.data.values;
    } catch {
      continue;
    }
  }
  return null;
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
    callsMade: number;
    demosSet: number;
    demosShowed: number;
    dealsClosed: number;
    showRate: number;
    closeRate: number;
  }[] = [];

  if (rows && rows.length >= 2) {
    const headers = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
    const col = (name: string) => headers.indexOf(name);

    const nameIdx      = col("name") >= 0 ? col("name")
                       : col("settername") >= 0 ? col("settername")
                       : col("setter") >= 0 ? col("setter") : 0;
    const cashIdx      = col("cashcollected") >= 0 ? col("cashcollected")
                       : col("grosscollected($)") >= 0 ? col("grosscollected($)")
                       : col("grossdealvalue($)") >= 0 ? col("grossdealvalue($)")
                       : col("grossdealvalue") >= 0 ? col("grossdealvalue")
                       : col("grosscollected");
    const callsIdx     = col("callsmade") >= 0 ? col("callsmade")
                       : col("callsdialed") >= 0 ? col("callsdialed") : -1;
    const demosSetIdx  = col("demosset") >= 0 ? col("demosset") : col("zoomsbooked");
    const demosShowIdx = col("demosshowed") >= 0 ? col("demosshowed")
                       : col("showedups") >= 0 ? col("showedups")
                       : col("zoomsshowed");
    const closedIdx    = col("dealsclosed") >= 0 ? col("dealsclosed")
                       : col("demosclosed") >= 0 ? col("demosclosed")
                       : col("closed");

    // Aggregate by name — handles both summary rows (one per setter) and daily log rows
    const HEADER_LABELS = new Set(["name", "setter name", "setter", "settername"]);
    type Totals = { cashCollected: number; callsMade: number; demosSet: number; demosShowed: number; dealsClosed: number };
    const repMap = new Map<string, Totals>();
    for (const row of rows.slice(1) as string[][]) {
      const name = row[nameIdx]?.trim() ?? "";
      if (!name || HEADER_LABELS.has(name.toLowerCase())) continue;
      const cash        = cashIdx >= 0      ? parseFloat((row[cashIdx]      ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const calls       = callsIdx >= 0     ? parseFloat((row[callsIdx]     ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const demosSet    = demosSetIdx >= 0  ? parseFloat((row[demosSetIdx]  ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const demosShowed = demosShowIdx >= 0 ? parseFloat((row[demosShowIdx] ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const closed      = closedIdx    >= 0 ? parseFloat((row[closedIdx]    ?? "0").replace(/[$,]/g, "")) || 0 : 0;
      const prev        = repMap.get(name) ?? { cashCollected: 0, callsMade: 0, demosSet: 0, demosShowed: 0, dealsClosed: 0 };
      repMap.set(name, {
        cashCollected: prev.cashCollected + cash,
        callsMade:     prev.callsMade     + calls,
        demosSet:      prev.demosSet      + demosSet,
        demosShowed:   prev.demosShowed   + demosShowed,
        dealsClosed:   prev.dealsClosed   + closed,
      });
    }
    sheetLeaderboard = Array.from(repMap.entries()).map(([name, s]) => ({
      name,
      cashCollected: s.cashCollected,
      callsMade:     s.callsMade,
      demosSet:      s.demosSet,
      demosShowed:   s.demosShowed,
      dealsClosed:   s.dealsClosed,
      showRate:  s.demosSet    > 0 ? parseFloat(((s.demosShowed / s.demosSet)    * 100).toFixed(1)) : 0,
      closeRate: s.demosShowed > 0 ? parseFloat(((s.dealsClosed / s.demosShowed) * 100).toFixed(1)) : 0,
    }));

    // ─── Personal sheet supplement ──────────────────────────────────────────────
    // Reps with a personal sheetId who don't appear in the master tracker are
    // appended here so they show up on the live leaderboard without needing
    // to be added to the master Setter KPI Tracker sheet.
    try {
      const staffRegistry   = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
      // Build a set of first-name keys already in repMap (case-insensitive)
      const masterFirstNames = new Set(
        Array.from(repMap.keys()).map(n => n.trim().toLowerCase().split(" ")[0])
      );
      const personalReps = staffRegistry.filter(
        s => s.sheetId && !masterFirstNames.has(s.name.trim().toLowerCase().split(" ")[0])
      );

      if (personalReps.length > 0) {
        const pToken = await getSheetsToken();

        for (const s of personalReps) {
          try {
            // Try named tab first, then default tab
            let pResult: { values?: string[][] };
            try {
              pResult = await sheetsGet(pToken, s.sheetId!, "Daily Log!A:Z");
            } catch {
              pResult = await sheetsGet(pToken, s.sheetId!, "A:Z");
            }
            const pRows = (pResult.values ?? []) as string[][];
            if (pRows.length < 2) continue;

            // Detect header row
            let hIdx = -1;
            for (let i = 0; i < Math.min(6, pRows.length); i++) {
              const hn = pRows[i].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
              if (hn.some((h: string) => ["callsmade", "callsdialed", "demosset", "zoomsbooked"].includes(h))) {
                hIdx = i; break;
              }
            }
            if (hIdx < 0) continue;

            const ph = pRows[hIdx].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
            const pcFirst = (...ns: string[]) => { for (const n of ns) { const i = ph.indexOf(n); if (i >= 0) return i; } return -1; };

            const pCashIdx   = pcFirst("cashcollected", "grosscollected", "grossdealvalue");
            const pCallsIdx  = pcFirst("callsmade", "callsdialed");
            const pDSetIdx   = pcFirst("demosset", "zoomsbooked");
            const pDShowIdx  = pcFirst("demosshowed", "zoomsshowed", "showedups");
            const pClosedIdx = pcFirst("dealsclosed", "demosclosed", "closed");

            let pCash = 0, pCalls = 0, pDSet = 0, pDShow = 0, pClosed = 0;
            for (const row of pRows.slice(hIdx + 1) as string[][]) {
              if (!row.some((c: string) => c?.trim())) continue; // skip entirely empty rows
              pCash   += pCashIdx   >= 0 ? parseFloat((row[pCashIdx]   ?? "0").replace(/[$,]/g, "")) || 0 : 0;
              pCalls  += pCallsIdx  >= 0 ? Number(row[pCallsIdx])  || 0 : 0;
              pDSet   += pDSetIdx   >= 0 ? Number(row[pDSetIdx])   || 0 : 0;
              pDShow  += pDShowIdx  >= 0 ? Number(row[pDShowIdx])  || 0 : 0;
              pClosed += pClosedIdx >= 0 ? Number(row[pClosedIdx]) || 0 : 0;
            }

            if (pCalls > 0 || pDSet > 0 || pCash > 0) {
              sheetLeaderboard.push({
                name:          s.name,
                cashCollected: pCash,
                callsMade:     pCalls,
                demosSet:      pDSet,
                demosShowed:   pDShow,
                dealsClosed:   pClosed,
                showRate:  pDSet  > 0 ? parseFloat(((pDShow  / pDSet)  * 100).toFixed(1)) : 0,
                closeRate: pDShow > 0 ? parseFloat(((pClosed / pDShow) * 100).toFixed(1)) : 0,
              });
            }
          } catch (pErr) {
            console.error(`[setters] personal sheet error for ${s.name}:`, pErr);
          }
        }
      }
    } catch (suppErr) {
      console.error("[setters] personal sheet supplement error:", suppErr);
    }
  }

  type LeaderboardRow = typeof sheetLeaderboard[number];
  let leaderboard: LeaderboardRow[] = [];
  let source: "sheet" | "cache" | "kv" | "empty" = "empty";

  if (sheetLeaderboard.length > 0) {
    leaderboard = sheetLeaderboard;
    source = "sheet";
  } else {
    // Mid-tier: use the pre-built leaderboard from the last sync-leaderboard run
    const dash = await kv.get<SalesData>("sns-dashboard-v1");
    const cached = dash?.reps?.leaderboard ?? [];
    if (cached.length > 0) {
      leaderboard = cached.map(r => ({
        name:          r.name,
        cashCollected: r.cashCollected,
        callsMade:     r.callsMade ?? 0,
        demosSet:      r.demosSet,
        demosShowed:   r.demosShowed,
        dealsClosed:   r.dealsClosed,
        showRate:      r.demosSet    > 0 ? parseFloat(((r.demosShowed / r.demosSet)    * 100).toFixed(1)) : 0,
        closeRate:     r.demosShowed > 0 ? parseFloat(((r.dealsClosed / r.demosShowed) * 100).toFixed(1)) : 0,
      }));
      source = "cache";
    } else {
      // Last resort: build from raw deals + staff registry in KV
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
        callsMade:     0,
        demosSet:      s.demosSet,
        demosShowed:   0,
        dealsClosed:   s.dealsClosed,
        showRate:      0,
        closeRate:     s.demosSet > 0 ? parseFloat(((s.dealsClosed / s.demosSet) * 100).toFixed(1)) : 0,
      }));
      source = leaderboard.some(r => r.cashCollected > 0 || r.dealsClosed > 0) ? "kv" : "empty";
    }
  }

  const totalCash    = leaderboard.reduce((s, r) => s + r.cashCollected, 0);
  const totalDeals   = leaderboard.reduce((s, r) => s + r.dealsClosed, 0);
  const totalCalls   = leaderboard.reduce((s, r) => s + r.callsMade, 0);
  const avgCloseRate = leaderboard.length > 0
    ? parseFloat((leaderboard.reduce((s, r) => s + r.closeRate, 0) / leaderboard.length).toFixed(1))
    : 0;

  return Response.json({ leaderboard, totalCash, totalDeals, totalCalls, avgCloseRate, source });
}
