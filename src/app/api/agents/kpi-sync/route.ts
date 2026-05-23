import { kv } from "@vercel/kv";
import type { Deal } from "@/lib/deal-types";
import { getSheetsToken, sheetsGet, sheetsAppend, buildMasterLogRow, buildRepRow, getRepSheets } from "@/lib/sheets-sync";
import { verifyCronSecret } from "@/lib/cron-auth";

// Fallback IDs match the hardcoded values in sheets-sync.ts so the cron works
// even if the env vars are not explicitly set in Vercel.
const MASTER_LOG_ID = process.env.GOOGLE_SHEETS_MASTER_LOG_ID ?? "1IytiWU-JosLSQp2CXPJp18i_sLzzJpa9VhBBqMLvzjc";
const SETTER_KPI_ID = process.env.GOOGLE_SHEETS_SETTER_KPI_ID ?? "1mASm-QAFu7gMIH23fG1Qb_TdBec_ZCgc2Ymsriwqf2E";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const results: Record<string, unknown> = {};

  const dealIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const deals   = (
    await Promise.all(dealIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  if (!deals.length) return Response.json({ ok: true, synced: 0 });

  let token: string;
  try {
    token = await getSheetsToken();
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }

  // ── Master Log — bulk dedup + append ────────────────────────────────────
  try {
    const existing = await sheetsGet(token, MASTER_LOG_ID, "Deal Log!S:S");
    const knownIds = new Set<string>((existing.values ?? []).flat().filter(Boolean));
    const newDeals = deals.filter(d => !knownIds.has(d.id));

    if (newDeals.length) {
      await sheetsAppend(token, MASTER_LOG_ID, "Deal Log!A:S", newDeals.map(buildMasterLogRow));
    }
    results.masterLog = { synced: newDeals.length, total: deals.length };
  } catch (e) {
    results.masterLog = { error: String(e) };
  }

  // ── Setter KPI Daily Log — one row per (date, setter) not yet logged ────
  try {
    const dateSetterMap: Record<string, { date: string; name: string; deals: number; gross: number }> = {};
    for (const deal of deals) {
      for (const raw of [deal.dmSetter, deal.setter].filter(Boolean) as string[]) {
        const name = raw.trim();
        const key  = `${deal.date}__${name.toLowerCase()}`;
        dateSetterMap[key] = {
          date:  deal.date,
          name,
          deals: (dateSetterMap[key]?.deals ?? 0) + 1,
          gross: (dateSetterMap[key]?.gross ?? 0) + deal.grossAmount,
        };
      }
    }

    const existingRows = await sheetsGet(token, SETTER_KPI_ID, "Daily Log!A:B");
    const logged = new Set<string>(
      (existingRows.values ?? []).map((r: string[]) => `${r[0]}__${r[1]?.toLowerCase()}`)
    );

    // 14-column row matching master sheet structure (A:N):
    // A=Date, B=Name, C-J=blanks, K=Deals Closed, L=Gross Deal Value, M-N=blanks
    const toAdd = Object.entries(dateSetterMap)
      .filter(([key]) => !logged.has(key))
      .map(([, s]) => [s.date, s.name, "", "", "", "", "", "", "", "", s.deals, s.gross, "", ""] as unknown[]);

    if (toAdd.length) {
      await sheetsAppend(token, SETTER_KPI_ID, "Daily Log!A:N", toAdd as unknown[][]);
    }
    results.setterKPI = { synced: toAdd.length };
  } catch (e) {
    results.setterKPI = { error: String(e) };
  }

  // ── Rep sheets — dynamic from staff registry ─────────────────────────────
  const repSheets = await getRepSheets();
  for (const [repKey, sheetId] of Object.entries(repSheets)) {
    try {
      const existing    = await sheetsGet(token, sheetId, "A:F");
      const knownRepIds = new Set<string>((existing.values ?? []).map((r: string[]) => r[5]).filter(Boolean));

      const repDeals = deals.filter(d =>
        d.dmSetter?.toLowerCase().startsWith(repKey) ||
        d.setter?.toLowerCase().startsWith(repKey)   ||
        d.closer?.toLowerCase().startsWith(repKey)
      );

      const newRows = repDeals
        .filter(d => !knownRepIds.has(d.id))
        .map(d => buildRepRow(d, repKey));

      if (newRows.length) {
        await sheetsAppend(token, sheetId, "A:F", newRows);
      }
      results[repKey] = { synced: newRows.length };
    } catch (e) {
      results[repKey] = { error: String(e) };
    }
  }

  return Response.json({ ok: true, ...results });
}
