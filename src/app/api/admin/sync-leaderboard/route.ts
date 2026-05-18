import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type SalesData, BLANK } from "@/lib/sales-data";
import { getSheetsToken, sheetsGet } from "@/lib/sheets-sync";

const SETTER_KPI_ID = process.env.GOOGLE_SHEETS_SETTER_KPI_ID ?? "1mASm-QAFu7gMIH23fG1Qb_TdBec_ZCgc2Ymsriwqf2E";

function parseSheetDate(raw: string): { year: string; ym: string } | null {
  // MM/DD/YYYY (format written by sync script)
  const a = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (a) return { year: a[3], ym: `${a[3]}-${a[1].padStart(2, "0")}` };
  // YYYY-MM-DD fallback
  const b = raw.match(/^(\d{4})-(\d{2})/);
  if (b) return { year: b[1], ym: `${b[1]}-${b[2]}` };
  return null;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const now    = new Date();
  const thisY  = String(now.getFullYear());
  const thisYM = `${thisY}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  let rows: string[][] | null = null;
  try {
    const token = await getSheetsToken();
    for (const tab of ["Daily Log", "Sheet1"]) {
      try {
        const res = await sheetsGet(token, SETTER_KPI_ID, `${tab}!A1:Z`);
        if (res.values && res.values.length >= 2) { rows = res.values as string[][]; break; }
      } catch { continue; }
    }
  } catch { /* sheet unavailable */ }

  if (!rows) return Response.json({ ok: false, reason: "sheet_unavailable" });

  const headers   = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const col       = (n: string) => headers.indexOf(n);
  const dateIdx   = col("date");
  const nameIdx   = col("settername") >= 0 ? col("settername") : col("setter") >= 0 ? col("setter") : col("name") >= 0 ? col("name") : 1;
  const cashIdx   = col("cashcollected") >= 0 ? col("cashcollected")
                  : col("grosscollected($)") >= 0 ? col("grosscollected($)")
                  : col("grossdealvalue($)") >= 0 ? col("grossdealvalue($)")
                  : col("grossdealvalue") >= 0 ? col("grossdealvalue") : col("grosscollected");
  const dSetIdx   = col("demosset") >= 0 ? col("demosset") : col("zoomsbooked");
  const dShowIdx  = col("demosshowed") >= 0 ? col("demosshowed") : col("showedups") >= 0 ? col("showedups") : col("zoomsshowed");
  const closedIdx = col("dealsclosed") >= 0 ? col("dealsclosed") : col("closed");
  const callsIdx  = col("callsmade") >= 0 ? col("callsmade") : col("callsdialed");
  const answIdx   = col("callsanswered") >= 0 ? col("callsanswered") : col("callsconnected");

  const HEADER_LABELS = new Set(["name", "setter name", "setter", "settername"]);
  const p = (row: string[], i: number) => i >= 0 ? parseFloat((row[i] ?? "0").replace(/[$,]/g, "")) || 0 : 0;

  type Agg = { cash: number; calls: number; answered: number; dSet: number; dShow: number; closed: number };
  const repMapMTD = new Map<string, Agg>();
  let cashYTD = 0;

  for (const row of rows.slice(1) as string[][]) {
    const name = row[nameIdx]?.trim() ?? "";
    if (!name || HEADER_LABELS.has(name.toLowerCase())) continue;

    const rawDate = dateIdx >= 0 ? (row[dateIdx]?.trim() ?? "") : "";
    const parsed  = rawDate ? parseSheetDate(rawDate) : null;

    const cash   = p(row, cashIdx);
    const dSet   = p(row, dSetIdx);
    const dShow  = p(row, dShowIdx);
    const closed = p(row, closedIdx);
    const calls  = p(row, callsIdx);
    const answ   = p(row, answIdx);

    // YTD — accumulate all rows from this calendar year
    if (!parsed || parsed.year === thisY) cashYTD += cash;

    // MTD — only rows in the current month
    if (parsed && parsed.ym !== thisYM) continue;

    const prev = repMapMTD.get(name) ?? { cash: 0, calls: 0, answered: 0, dSet: 0, dShow: 0, closed: 0 };
    repMapMTD.set(name, {
      cash:     prev.cash     + cash,
      calls:    prev.calls    + calls,
      answered: prev.answered + answ,
      dSet:     prev.dSet     + dSet,
      dShow:    prev.dShow    + dShow,
      closed:   prev.closed   + closed,
    });
  }

  const leaderboard: SalesData["reps"]["leaderboard"] = Array.from(repMapMTD.entries()).map(([name, s]) => ({
    name,
    cashCollected: s.cash,
    callsMade:     s.calls,
    callsAnswered: s.answered,
    demosSet:      s.dSet,
    demosShowed:   s.dShow,
    pitched:       s.dShow,
    dealsClosed:   s.closed,
    answerRate:    s.calls > 0 ? parseFloat(((s.answered / s.calls) * 100).toFixed(1)) : 0,
  }));

  // Safe patch — read existing KV, update only leaderboard + YTD, write back
  const current = (await kv.get<SalesData>("sns-dashboard-v1")) ?? { ...BLANK };
  if (!current.dashboard) current.dashboard = { ...BLANK.dashboard };
  if (!current.reps)      current.reps      = { ...BLANK.reps };
  current.reps.leaderboard          = leaderboard;
  current.dashboard.cashCollectedYTD = cashYTD;
  await kv.set("sns-dashboard-v1", current, { ex: 21600 });

  return Response.json({ ok: true, count: leaderboard.length, cashYTD });
}
