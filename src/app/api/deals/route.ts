import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts, getWeekId } from "@/lib/payout-calc";
import { syncDealToSheets } from "@/lib/sheets-sync";
import { BLANK, type SalesData } from "@/lib/sales-data";

function authGuard(session: Session | null) {
  return !session || (session.user.role !== "admin" && session.user.role !== "staff");
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (authGuard(session)) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const from      = searchParams.get("from");
  const to        = searchParams.get("to");
  const processor = searchParams.get("processor");
  const rep       = searchParams.get("rep");
  const source    = searchParams.get("source");

  const ids = (await kv.get<string[]>("sns:deals:index")) ?? [];
  if (!ids.length) return Response.json({ deals: [] });

  const deals = (
    await Promise.all(ids.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const filtered = deals.filter(d => {
    if (from && d.date < from) return false;
    if (to   && d.date > to)   return false;
    if (processor && d.processor !== processor) return false;
    if (source    && d.leadSource !== source)   return false;
    if (rep && d.setter !== rep && d.closer !== rep) return false;
    return true;
  });

  filtered.sort((a, b) => b.date.localeCompare(a.date));
  return Response.json({ deals: filtered });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (authGuard(session)) return new Response("Unauthorized", { status: 401 });

  let body: Omit<Deal, "id" | "netAmount" | "payouts">;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const required = ["date", "clientName", "offer", "grossAmount", "processor", "processorFee", "leadSource"];
  for (const f of required) {
    if (body[f as keyof typeof body] == null || body[f as keyof typeof body] === "") {
      return Response.json({ error: `Missing: ${f}` }, { status: 400 });
    }
  }

  const id = randomUUID();
  const netAmount = body.grossAmount - body.processorFee;

  const partial: Deal = {
    id,
    date:         body.date,
    clientName:   body.clientName,
    offer:        body.offer,
    grossAmount:  Number(body.grossAmount),
    processor:    body.processor,
    processorFee: Number(body.processorFee),
    netAmount,
    leadSource:   body.leadSource,
    dmSetter:     body.dmSetter ?? null,
    setter:       body.setter ?? null,
    closer:       body.closer ?? null,
    payouts:      {} as Deal["payouts"],
    payoutStatus: "pending",
    notes:        body.notes ?? "",
  };
  partial.payouts = calculatePayouts(partial);

  await kv.set(`sns:deals:${id}`, partial);

  // Append to index
  const existing = (await kv.get<string[]>("sns:deals:index")) ?? [];
  await kv.set("sns:deals:index", [id, ...existing]);

  // Add to weekly pending
  const weekId = getWeekId(new Date(body.date));
  const pendingKey = "sns:payouts:pending";
  const pending = (await kv.get<string[]>(pendingKey)) ?? [];
  if (!pending.includes(id)) await kv.set(pendingKey, [...pending, id]);

  // Update weekly batch
  const weekKey = `sns:payouts:weekly:${weekId}`;
  const week = await kv.get<{ dealIds: string[] }>(weekKey);
  const weekDealIds = week?.dealIds ?? [];
  if (!weekDealIds.includes(id)) {
    await kv.set(weekKey, { ...week, weekId, dealIds: [...weekDealIds, id], status: "pending" });
  }

  // Sync to Google Sheets immediately — fire and forget
  syncDealToSheets(partial).catch(e => console.error("Sheets sync error:", e));

  // Patch admin dashboard MTD totals + rep leaderboard from deals so admin page stays live
  void (async () => {
    try {
      const now = new Date();
      const monthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const allIds = (await kv.get<string[]>("sns:deals:index")) ?? [];
      const allDeals = (await Promise.all(allIds.map(i => kv.get<Deal>(`sns:deals:${i}`)))).filter((d): d is Deal => d !== null);
      const mtd = allDeals.filter(d => d.date >= monthStr);

      const cashCollectedMTD    = parseFloat(mtd.reduce((s, d) => s + d.grossAmount, 0).toFixed(2));
      const netRevenueMTD       = parseFloat(mtd.reduce((s, d) => s + d.netAmount, 0).toFixed(2));
      const totalDealsClosedMTD = mtd.length;

      // Rebuild rep leaderboard from all deals (all-time, not just MTD)
      type RepStats = { cashCollected: number; dealsClosed: number; demosSet: number };
      const repMap = new Map<string, RepStats>();
      for (const deal of allDeals) {
        if (deal.setter) {
          const r = repMap.get(deal.setter) ?? { cashCollected: 0, dealsClosed: 0, demosSet: 0 };
          repMap.set(deal.setter, { ...r, demosSet: r.demosSet + 1 });
        }
        if (deal.closer) {
          const r = repMap.get(deal.closer) ?? { cashCollected: 0, dealsClosed: 0, demosSet: 0 };
          repMap.set(deal.closer, { ...r, dealsClosed: r.dealsClosed + 1, cashCollected: r.cashCollected + deal.grossAmount });
        }
      }
      const leaderboard = Array.from(repMap.entries())
        .map(([name, s]) => ({
          name,
          cashCollected: s.cashCollected,
          dealsClosed:   s.dealsClosed,
          demosSet:      s.demosSet,
          callsMade:     0,
          callsAnswered: 0,
          demosShowed:   0,
          pitched:       0,
          answerRate:    0,
        }))
        .sort((a, b) => b.cashCollected - a.cashCollected);

      const dash = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;
      await kv.set("sns-dashboard-v1", {
        ...dash,
        dashboard: { ...dash.dashboard, cashCollectedMTD, netRevenueMTD, totalDealsClosedMTD },
        reps: { ...dash.reps, leaderboard },
      });
    } catch (e) {
      console.error("Dashboard patch error:", e);
    }
  })();

  return Response.json({ deal: partial }, { status: 201 });
}
