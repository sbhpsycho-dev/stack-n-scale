import crypto from "crypto";
import { kv } from "@vercel/kv";
import type { Deal } from "./deal-types";
import type { StaffMeta } from "./staff-registry";

const MASTER_LOG_ID = "1IytiWU-JosLSQp2CXPJp18i_sLzzJpa9VhBBqMLvzjc";
const SETTER_KPI_ID = "1mASm-QAFu7gMIH23fG1Qb_TdBec_ZCgc2Ymsriwqf2E";
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
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
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
