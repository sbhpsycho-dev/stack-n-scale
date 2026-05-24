import crypto from "crypto";
import { kv } from "@vercel/kv";
import type { Deal } from "./deal-types";
import type { StaffMeta } from "./staff-registry";
import type { DailyEntry } from "@/app/api/replog/route";
import { BLANK, type Rep, type SalesData } from "./sales-data";

const MASTER_LOG_ID = process.env.GOOGLE_SHEETS_MASTER_LOG_ID ?? "1IytiWU-JosLSQp2CXPJp18i_sLzzJpa9VhBBqMLvzjc";
const SETTER_KPI_ID = process.env.GOOGLE_SHEETS_SETTER_KPI_ID ?? "1mASm-QAFu7gMIH23fG1Qb_TdBec_ZCgc2Ymsriwqf2E";
const STAFF_KV_KEY  = "sns-staff-registry";

export async function getRepSheets(): Promise<Record<string, string>> {
  const staff = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  const map: Record<string, string> = {};
  for (const s of staff) {
    if (s.sheetId) map[s.name.trim().toLowerCase().split(" ")[0]] = s.sheetId;
  }
  return map;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function makeJWT(): string {
  const email      = process.env.GOOGLE_SA_EMAIL!;
  const privateKey = process.env.GOOGLE_SA_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now        = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })).toString("base64url");

  const signing = `${header}.${payload}`;
  const sign    = crypto.createSign("RSA-SHA256");
  sign.update(signing);
  return `${signing}.${sign.sign(privateKey, "base64url")}`;
}

export async function getSheetsToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  makeJWT(),
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Sheets auth failed: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function sheetsGet(token: string, sheetId: string, range: string) {
  const res  = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Sheets API error ${res.status}: ${json.error?.message ?? JSON.stringify(json.error)}`);
  }
  return json;
}

export async function sheetsAppend(token: string, sheetId: string, range: string, rows: unknown[][]) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ values: rows }),
    }
  );
  return res.json();
}

// ─── Row builders ─────────────────────────────────────────────────────────────

export function buildMasterLogRow(deal: Deal): (string | number)[] {
  const setterLabel =
    deal.dmSetter && deal.setter ? `DM: ${deal.dmSetter} / Set: ${deal.setter}` :
    deal.dmSetter ?? deal.setter ?? "";
  const setterPay = (deal.payouts.dmSetter ?? 0) + (deal.payouts.setter ?? 0);

  return [
    deal.date, deal.clientName, deal.offer, deal.grossAmount, deal.processor, deal.processorFee,
    "",                     // G — Net After Fees (formula)
    deal.leadSource, setterLabel, deal.closer ?? "",
    "", "",                 // K, L — Caelum 15%, Media Buyer 5% (formulas)
    setterPay, deal.payouts.closer ?? 0,
    "", "",                 // O, P — Total Payouts, Evan Take Home (formulas)
    deal.payoutStatus, deal.notes ?? "", deal.id,
  ];
}

export function buildRepRow(deal: Deal, repKey: string): (string | number)[] {
  let cut = 0;
  if (deal.dmSetter?.toLowerCase().startsWith(repKey)) cut += (deal.payouts.dmSetter ?? 0);
  if (deal.setter?.toLowerCase().startsWith(repKey))   cut += (deal.payouts.setter ?? 0);
  if (deal.closer?.toLowerCase().startsWith(repKey))   cut += (deal.payouts.closer ?? 0);

  const role =
    deal.dmSetter?.toLowerCase().startsWith(repKey) && deal.setter?.toLowerCase().startsWith(repKey)
      ? "DM Setter + Setter"
      : deal.dmSetter?.toLowerCase().startsWith(repKey) ? "DM Setter"
      : deal.setter?.toLowerCase().startsWith(repKey)   ? "Setter" : "Closer";

  return [deal.date, deal.clientName, deal.grossAmount, cut, role, deal.id];
}

export async function sheetsUpdate(token: string, sheetId: string, range: string, rows: unknown[][]) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method:  "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ values: rows }),
    }
  );
  return res.json();
}

const REPLOG_HEADERS = ["Date", "Name", "Calls Made", "Calls Answered", "Demos Set", "Demos Showed", "Pitched", "Closed", "Cash Collected"];

export function buildReplogRow(staffName: string, entry: DailyEntry): (string | number)[] {
  const first = staffName.trim().split(" ")[0];
  const name  = first.charAt(0).toUpperCase() + first.slice(1);
  return [entry.date, name, entry.callsMade, entry.callsAnswered, entry.demosSet, entry.demosShowed, entry.pitched, entry.closed, entry.cashCollected];
}

// ─── Per-rep sheet sync ───────────────────────────────────────────────────────

// Writes/updates the rep's daily entry in their own personal Google Sheet.
// Expects a tab named "Daily Activity" (columns A:I matching REPLOG_HEADERS).
// Silently skips if the rep has no sheetId configured in the staff registry.
export async function syncReplogToRepSheet(staffName: string, entry: DailyEntry): Promise<void> {
  const repSheets = await getRepSheets();
  const nameKey   = staffName.trim().toLowerCase().split(" ")[0];
  const sheetId   = repSheets[nameKey];
  if (!sheetId) return; // no personal sheet configured for this rep — skip

  const token    = await getSheetsToken();
  const existing = await sheetsGet(token, sheetId, "Daily Activity!A:I");
  const rows     = (existing.values ?? []) as string[][];
  const dataRow  = buildReplogRow(staffName, entry);

  if (rows.length === 0) {
    await sheetsAppend(token, sheetId, "Daily Activity!A:I", [REPLOG_HEADERS, dataRow]);
    return;
  }

  const matchIdx = rows.findIndex((r, i) => i > 0 && r[0] === entry.date);
  if (matchIdx >= 0) {
    await sheetsUpdate(token, sheetId, `Daily Activity!A${matchIdx + 1}:I${matchIdx + 1}`, [dataRow]);
  } else {
    await sheetsAppend(token, sheetId, "Daily Activity!A:I", [dataRow]);
  }
}

// ─── Make.com replog webhook ──────────────────────────────────────────────────

// Fires a Make.com webhook when a deal is saved so the payout agent can run immediately.
// Gracefully skips (no-op) if MAKE_DEAL_WEBHOOK_URL is not configured.
export async function triggerMakeDealWebhook(deal: Deal): Promise<void> {
  const url = process.env.MAKE_DEAL_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal, timestamp: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Make.com deal webhook failed: HTTP ${res.status}`);
  }
}

// Fires a Make.com webhook with the rep's daily entry so the automation chain
// can update the Master KPI Sheet, post to Discord, and trigger a dashboard refresh.
// Gracefully skips if MAKE_REPLOG_WEBHOOK_URL is not set.
export async function triggerMakeReplogWebhook(staffName: string, entry: DailyEntry): Promise<void> {
  const url = process.env.MAKE_REPLOG_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staffName, entry, timestamp: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`Make.com replog webhook failed: HTTP ${res.status}`);
  }
}

export async function syncReplogToSheets(staffName: string, entry: DailyEntry): Promise<void> {
  const token    = await getSheetsToken();
  // Only read date+name columns — enough to find the existing row to upsert
  const existing = await sheetsGet(token, SETTER_KPI_ID, "Daily Log!A:B");
  const rows     = (existing.values ?? []) as string[][];
  const nameKey  = staffName.trim().toLowerCase().split(" ")[0];

  // 12-column row matching the master Setter KPI sheet structure:
  // A=Date, B=Name, C=Calls Dialed, D=Calls Connected,
  // E=Conversations (blank), F=Fact Finds (blank),
  // G=Zooms Booked, H=Zooms Showed,
  // I=No-Showed (blank/formula), J=Show Rate (blank/formula),
  // K=Deals Closed, L=Gross Deal Value
  const first   = staffName.trim().split(" ")[0];
  const name    = first.charAt(0).toUpperCase() + first.slice(1);
  const dataRow = [
    entry.date, name,
    entry.callsMade, entry.callsAnswered,
    "", "",                    // E: Conversations, F: Fact Finds (not tracked)
    entry.demosSet, entry.demosShowed,
    "", "",                    // I: No-Showed, J: Show Rate (formula cols — leave blank)
    entry.closed, entry.cashCollected,
  ];

  const matchIdx = rows.findIndex(
    (r, i) => i > 0 && r[0] === entry.date && r[1]?.trim().toLowerCase().startsWith(nameKey)
  );
  if (matchIdx >= 0) {
    await sheetsUpdate(token, SETTER_KPI_ID, `Daily Log!A${matchIdx + 1}:L${matchIdx + 1}`, [dataRow]);
  } else {
    await sheetsAppend(token, SETTER_KPI_ID, "Daily Log!A:L", [dataRow]);
  }
}

// ─── Pipeline helpers (shared between replog route and sheets webhook) ────────

const PIPELINE_LASTMOD_KEY = "sns-pipeline-lastmod";

export async function bumpPipelineVersion(): Promise<void> {
  await kv.set(PIPELINE_LASTMOD_KEY, Date.now());
}

export async function getPipelineLastmod(): Promise<number> {
  return (await kv.get<number>(PIPELINE_LASTMOD_KEY)) ?? 0;
}

export async function updatePipelineFromReplogs(): Promise<void> {
  const staff = (await kv.get<StaffMeta[]>("sns-staff-registry")) ?? [];
  if (staff.length === 0) return;

  const thisYM = new Date().toISOString().slice(0, 7);

  let tCallsMade = 0, tCallsAnswered = 0, tDemosSet = 0, tDemosShowed = 0, tPitched = 0, tClosed = 0;
  const leaderboard: Rep[] = [];

  await Promise.all(staff.map(async (s) => {
    const entries = (await kv.get<DailyEntry[]>(`sns-replog-${s.id}`)) ?? [];
    const mtd = entries.filter(e => e.date.startsWith(thisYM));

    let callsMade = 0, callsAnswered = 0, demosSet = 0, demosShowed = 0, pitched = 0, closed = 0, cashCollected = 0;
    for (const e of mtd) {
      callsMade     += e.callsMade;
      callsAnswered += e.callsAnswered;
      demosSet      += e.demosSet;
      demosShowed   += e.demosShowed;
      pitched       += e.pitched;
      closed        += e.closed;
      cashCollected += e.cashCollected;
    }

    tCallsMade     += callsMade;
    tCallsAnswered += callsAnswered;
    tDemosSet      += demosSet;
    tDemosShowed   += demosShowed;
    tPitched       += pitched;
    tClosed        += closed;

    const answerRate = callsMade   > 0 ? parseFloat(((callsAnswered / callsMade)   * 100).toFixed(1)) : 0;
    const showRate   = demosSet    > 0 ? parseFloat(((demosShowed   / demosSet)    * 100).toFixed(1)) : 0;
    const closeRate  = demosShowed > 0 ? parseFloat(((closed        / demosShowed) * 100).toFixed(1)) : 0;

    const existing = (await kv.get<SalesData>(`sns-client-${s.id}`)) ?? BLANK;
    await kv.set(`sns-client-${s.id}`, {
      ...existing,
      dashboard: { ...existing.dashboard, cashCollectedMTD: cashCollected, totalDealsClosedMTD: closed },
      pipeline:  { ...existing.pipeline, callsMade, callsAnswered, demosSet, demosShowed, pitched, closed, answerRate, showRate, closeRate, demoToClose: closeRate },
    });

    if (callsMade > 0 || demosSet > 0 || cashCollected > 0) {
      leaderboard.push({ name: s.name, callsMade, callsAnswered, demosSet, demosShowed, pitched, dealsClosed: closed, cashCollected, answerRate });
    }
  }));

  const cached = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;

  const answerRate = tCallsMade   > 0 ? parseFloat(((tCallsAnswered / tCallsMade)   * 100).toFixed(1)) : 0;
  const showRate   = tDemosSet    > 0 ? parseFloat(((tDemosShowed   / tDemosSet)    * 100).toFixed(1)) : 0;
  const closeRate  = tDemosShowed > 0 ? parseFloat(((tClosed        / tDemosShowed) * 100).toFixed(1)) : 0;

  leaderboard.sort((a, b) => b.cashCollected - a.cashCollected);

  await kv.set("sns-dashboard-v1", {
    ...cached,
    pipeline: { ...cached.pipeline, callsMade: tCallsMade, callsAnswered: tCallsAnswered, demosSet: tDemosSet, demosShowed: tDemosShowed, pitched: tPitched, closed: tClosed, answerRate, showRate, closeRate, demoToClose: closeRate },
    reps: { ...cached.reps, leaderboard },
  });
}

// ─── Personal sheet reader ────────────────────────────────────────────────────

/** Reads all daily-log rows from a rep's personal Google Sheet and returns DailyEntry[].
 *  Tries "Daily Log!A:Z" first, falls back to default-tab "A:Z".
 *  Scans the first 6 rows to auto-detect the header row by looking for known column names.
 *  Handles Naomi-style "DEMOS CLOSED" and master-style "DEALS CLOSED" headers. */
async function readPersonalSheetEntries(token: string, sheetId: string): Promise<DailyEntry[]> {
  // Try named tab first, then fall back to default (first) tab
  let result: { values?: string[][] };
  try {
    result = await sheetsGet(token, sheetId, "Daily Log!A:Z");
  } catch {
    try {
      result = await sheetsGet(token, sheetId, "A:Z");
    } catch {
      return [];
    }
  }

  const rows = (result.values ?? []) as string[][];
  if (rows.length < 2) return [];

  // Find header row: first of the first 6 rows that contains a known KPI column
  let headerIdx = -1;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const norm = rows[i].map(h => h.trim().toLowerCase().replace(/\s+/g, ""));
    if (norm.some(h => ["callsmade", "callsdialed", "demosset", "zoomsbooked"].includes(h))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx].map(h => h.trim().toLowerCase().replace(/\s+/g, ""));
  const colFirst = (...names: string[]) => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const dateIdx    = colFirst("date");
  const callsIdx   = colFirst("callsmade", "callsdialed");
  const answIdx    = colFirst("callsanswered", "callsconnected");
  const dSetIdx    = colFirst("demosset", "zoomsbooked");
  const dShowIdx   = colFirst("demosshowed", "zoomsshowed", "showedups");
  const closedIdx  = colFirst("dealsclosed", "demosclosed", "closed");
  const cashIdx    = colFirst("cashcollected", "grosscollected", "grossdealvalue");

  if (dateIdx < 0) return []; // date column is required

  const entries: DailyEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row     = rows[i];
    const rawDate = row[dateIdx] ?? "";
    if (!rawDate || rawDate.trim() === "") continue;

    const asDate = new Date(rawDate);
    const date   = isNaN(asDate.getTime()) ? rawDate.trim() : asDate.toISOString().slice(0, 10);

    const callsMade     = callsIdx  >= 0 ? Number(row[callsIdx])  || 0 : 0;
    const callsAnswered = answIdx   >= 0 ? Number(row[answIdx])   || 0 : 0;
    const demosSet      = dSetIdx   >= 0 ? Number(row[dSetIdx])   || 0 : 0;
    const demosShowed   = dShowIdx  >= 0 ? Number(row[dShowIdx])  || 0 : 0;
    const closed        = closedIdx >= 0 ? Number(row[closedIdx]) || 0 : 0;
    const cashCollected = cashIdx   >= 0 ? parseFloat((row[cashIdx] ?? "0").replace(/[$,]/g, "")) || 0 : 0;

    // Skip blank/formula rows with no actual data
    if (!callsMade && !demosSet && !closed && !cashCollected) continue;

    entries.push({ date, callsMade, callsAnswered, demosSet, demosShowed, pitched: 0, closed, cashCollected });
  }
  return entries;
}

// Reads all Daily Log rows from Setter KPI sheet and upserts into each staff member's KV replog.
// Sheets is treated as truth — any row with a matching date+name overwrites the KV entry.
export async function ingestSetterKPISheet(): Promise<{ staffUpdated: number; rowsProcessed: number }> {
  const token  = await getSheetsToken();
  // Read A:L (12 cols) — sheet structure:
  // A=Date, B=Name, C=Calls Dialed, D=Calls Connected, E=Conversations, F=Fact Finds,
  // G=Zooms Booked (demosSet), H=Zooms Showed (demosShowed), I=No-Showed (formula),
  // J=Show Rate (formula), K=Deals Closed, L=Gross Deal Value (cashCollected)
  // Try multiple tabs — if "Daily Log" doesn't exist the old code would throw and kill
  // the personal-sheet supplement loop below. Now we fall through gracefully with rows=[].
  let rows: string[][] = [];
  for (const tab of ["Daily Log", "Sheet1", "Weekly Summary", "Leaderboard"]) {
    try {
      const res = await sheetsGet(token, SETTER_KPI_ID, `${tab}!A:L`);
      if (res.values && res.values.length >= 2) { rows = res.values as string[][]; break; }
    } catch { continue; }
  }

  const staff = (await kv.get<StaffMeta[]>("sns-staff-registry")) ?? [];
  const staffByFirst = new Map<string, StaffMeta>();
  for (const s of staff) {
    staffByFirst.set(s.name.trim().toLowerCase().split(" ")[0], s);
  }

  // Group rows by staff member
  const byStaff = new Map<string, DailyEntry[]>();
  let rowsProcessed = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawDate = row[0];
    const name    = row[1];
    if (!rawDate || !name || typeof rawDate !== "string" || rawDate.trim() === "") continue;

    // Normalise date — Sheets may return M/D/YYYY or YYYY-MM-DD
    let date: string;
    const asDate = new Date(rawDate);
    date = isNaN(asDate.getTime()) ? rawDate : asDate.toISOString().slice(0, 10);

    const firstKey = String(name).trim().toLowerCase().split(" ")[0];
    const member   = staffByFirst.get(firstKey);
    if (!member) continue;

    const entry: DailyEntry = {
      date,
      callsMade:     Number(row[2])  || 0,  // C — Calls Dialed
      callsAnswered: Number(row[3])  || 0,  // D — Calls Connected
      demosSet:      Number(row[6])  || 0,  // G — Zooms Booked
      demosShowed:   Number(row[7])  || 0,  // H — Zooms Showed
      pitched:       0,                     // not tracked in sheet
      closed:        Number(row[10]) || 0,  // K — Deals Closed
      cashCollected: Number(row[11]) || 0,  // L — Gross Deal Value
    };

    if (!byStaff.has(member.id)) byStaff.set(member.id, []);
    const existing = byStaff.get(member.id)!;
    const idx = existing.findIndex(e => e.date === date);
    if (idx >= 0) existing[idx] = entry; else existing.push(entry);
    rowsProcessed++;
  }

  // Merge with existing KV entries (sheets rows win for matching dates)
  let staffUpdated = 0;
  for (const [id, sheetEntries] of byStaff) {
    const kvKey  = `sns-replog-${id}`;
    const kvRows = (await kv.get<DailyEntry[]>(kvKey)) ?? [];
    const merged = [...kvRows];
    for (const e of sheetEntries) {
      const idx = merged.findIndex(r => r.date === e.date);
      if (idx >= 0) merged[idx] = e; else merged.push(e);
    }
    merged.sort((a, b) => b.date.localeCompare(a.date));
    await kv.set(kvKey, merged);
    staffUpdated++;
  }

  // ─── Personal sheet supplements ──────────────────────────────────────────────
  // For staff who have a personal sheetId but whose data wasn't found in the master
  // tracker, read their personal sheet and merge into their KV replog.
  for (const s of staff) {
    if (!s.sheetId)          continue; // no personal sheet configured
    if (byStaff.has(s.id))  continue; // already ingested from master

    try {
      const personalEntries = await readPersonalSheetEntries(token, s.sheetId);
      if (personalEntries.length === 0) continue;

      const kvKey  = `sns-replog-${s.id}`;
      const kvRows = (await kv.get<DailyEntry[]>(kvKey)) ?? [];
      const merged = [...kvRows];
      for (const e of personalEntries) {
        const idx = merged.findIndex(r => r.date === e.date);
        if (idx >= 0) merged[idx] = e; else merged.push(e);
      }
      merged.sort((a, b) => b.date.localeCompare(a.date));
      await kv.set(kvKey, merged);
      rowsProcessed += personalEntries.length;
      staffUpdated++;
    } catch (err) {
      console.error(`[ingestSetterKPISheet] personal sheet error for ${s.name}:`, err);
    }
  }

  return { staffUpdated, rowsProcessed };
}

// Clears a specific date row for a staff member in the Setter KPI Daily Log.
export async function syncDeleteFromSheets(staffName: string, date: string): Promise<void> {
  const token    = await getSheetsToken();
  const existing = await sheetsGet(token, SETTER_KPI_ID, "Daily Log!A:I");
  const rows     = (existing.values ?? []) as string[][];
  const nameKey  = staffName.trim().toLowerCase().split(" ")[0];

  const matchIdx = rows.findIndex((r, i) => i > 0 && r[0] === date && r[1]?.trim().toLowerCase().startsWith(nameKey));
  if (matchIdx < 0) return;

  const rowNum = matchIdx + 1;
  // Clear the full 12-column row (A:L) to match the write width used by syncReplogToSheets
  await sheetsUpdate(token, SETTER_KPI_ID, `Daily Log!A${rowNum}:L${rowNum}`,
    [["", "", "", "", "", "", "", "", "", "", "", ""]]);
}

// ─── Core sync — writes one deal to all sheets ───────────────────────────────

export async function syncDealToSheets(deal: Deal): Promise<void> {
  const token = await getSheetsToken();

  // Master Log — check dedup then append
  const existing = await sheetsGet(token, MASTER_LOG_ID, "Deal Log!S:S");
  const knownIds  = new Set<string>((existing.values ?? []).flat().filter(Boolean));
  if (!knownIds.has(deal.id)) {
    await sheetsAppend(token, MASTER_LOG_ID, "Deal Log!A:S", [buildMasterLogRow(deal)]);
  }

  // Setter KPI Daily Log — one row per setter for today
  const setterNames = [deal.dmSetter, deal.setter].filter(Boolean) as string[];
  for (const name of setterNames) {
    const key        = name.trim().toLowerCase().split(" ")[0];
    const todayRows  = await sheetsGet(token, SETTER_KPI_ID, "Daily Log!A:B");
    const rows       = (todayRows.values ?? []) as string[][];
    const alreadyIn  = rows.some(r => r[0] === deal.date && r[1]?.toLowerCase().startsWith(key));
    if (!alreadyIn) {
      const displayName = name.trim().split(" ")[0];
      const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
      await sheetsAppend(token, SETTER_KPI_ID, "Daily Log!A:N", [
        [deal.date, capitalizedName, "", "", "", "", "", "", "", "", 1, deal.grossAmount, "", ""],
      ]);
    }
  }

  // Rep sheets — dynamic from staff registry
  const repSheets = await getRepSheets();
  for (const [repKey, sheetId] of Object.entries(repSheets)) {
    const repInvolved =
      deal.dmSetter?.toLowerCase().startsWith(repKey) ||
      deal.setter?.toLowerCase().startsWith(repKey)   ||
      deal.closer?.toLowerCase().startsWith(repKey);
    if (!repInvolved) continue;

    const existing  = await sheetsGet(token, sheetId, "A:F");
    const knownRepIds = new Set<string>((existing.values ?? []).map((r: string[]) => r[5]).filter(Boolean));
    if (!knownRepIds.has(deal.id)) {
      await sheetsAppend(token, sheetId, "A:F", [buildRepRow(deal, repKey)]);
    }
  }
}
