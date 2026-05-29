import { after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts, getWeekId } from "@/lib/payout-calc";
import { syncDealToSheets, triggerMakeDealWebhook } from "@/lib/sheets-sync";
import { triggerScenario } from "@/lib/make";
import { BLANK, type SalesData } from "@/lib/sales-data";
import { logAudit } from "@/lib/audit";
import { buildDealClosedMessage } from "@/lib/discord";

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

  const ids = (await kv.lrange("sns:deals:index", 0, -1)) ?? [];
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
    date:          body.date,
    clientName:    body.clientName,
    offer:         body.offer,
    grossAmount:   Number(body.grossAmount),
    processor:     body.processor,
    processorFee:  Number(body.processorFee),
    netAmount,
    leadSource:    body.leadSource,
    dmSetter:      body.dmSetter ?? null,
    setter:        body.setter ?? null,
    closer:        body.closer ?? null,
    clientEmail:   (body as any).clientEmail?.trim() || null,
    contractValue: (body as any).contractValue ? Number((body as any).contractValue) : null,
    payouts:       {} as Deal["payouts"],
    payoutStatus:  "pending",
    notes:         body.notes ?? "",
  };
  partial.payouts = calculatePayouts(partial);

  await kv.set(`sns:deals:${id}`, partial);

  // Append to index — atomic, no read-modify-write race
  await kv.lpush("sns:deals:index", id);

  // Audit log — fire and forget, never blocks the response
  logAudit(
    session?.user?.clientId ?? "system",
    (session?.user as any)?.name ?? "system",
    "deal.created",
    partial.id,
    "deal",
    { after: { clientName: partial.clientName, grossAmount: partial.grossAmount, offer: partial.offer } }
  ).catch(() => {});

  // Add to weekly pending — atomic lpush
  const weekId = getWeekId(new Date(body.date));
  const pendingKey = "sns:payouts:pending";
  await kv.lpush(pendingKey, id);

  // Update weekly batch — store deal list atomically, metadata separately
  const weekDealsKey = `sns:payouts:weekly:deals:${weekId}`;
  const weekMetaKey  = `sns:payouts:weekly:meta:${weekId}`;
  await kv.lpush(weekDealsKey, id);
  // Only set metadata if it doesn't already exist (nx keeps first-writer wins)
  await kv.set(weekMetaKey, { weekId, status: "pending" }, { nx: true });

  // Dual-path: Make.com (primary) + direct Sheets (fallback while migrating)
  const dealPayload = {
    id:            partial.id,
    date:          partial.date,
    clientName:    partial.clientName,
    offer:         partial.offer,
    grossAmount:   partial.grossAmount,
    netAmount:     partial.netAmount,
    leadSource:    partial.leadSource,
    processor:     partial.processor,
    dmSetter:      partial.dmSetter ?? null,
    setter:        partial.setter ?? null,
    closer:        partial.closer ?? null,
    payouts:       partial.payouts,
    payoutStatus:  partial.payoutStatus,
    notes:         partial.notes ?? null,
  };
  triggerScenario("MAKE_DEAL_WEBHOOK_URL", dealPayload).catch(() => {});
  if (!process.env.MAKE_DEAL_WEBHOOK_URL) {
    syncDealToSheets(partial).catch(e => console.error("[sheets]", e));
  }
  // Trigger Make.com payout agent — fires automatically with every new deal
  triggerMakeDealWebhook(partial).catch(e => console.error("[deals] make webhook failed:", e));

  // Discord real-time notification
  const discordWebhook = process.env.DISCORD_WEBHOOK_DEAL_CLOSED;
  if (discordWebhook) {
    fetch(discordWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: buildDealClosedMessage({
        name:          partial.clientName,
        email:         partial.clientEmail,
        setter:        partial.setter,
        closer:        partial.closer,
        grossAmount:   partial.grossAmount,
        contractValue: partial.contractValue,
      })}),
      signal: AbortSignal.timeout(5000),
    }).catch(e => console.error("[deals] discord notify failed:", e));
  }

  // Patch admin dashboard MTD totals + rep leaderboard from deals so admin page stays live.
  // Uses after() so the patch survives past the response being sent.
  after(async () => {
    try {
      const now = new Date();
      const monthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const allIds = (await kv.lrange("sns:deals:index", 0, -1)) ?? [];
      const allDeals = (await Promise.all(allIds.map(i => kv.get<Deal>(`sns:deals:${i}`)))).filter((d): d is Deal => d !== null);
      const mtd = allDeals.filter(d => d.date >= monthStr);

      const cashCollectedMTD    = parseFloat(mtd.reduce((s, d) => s + d.grossAmount, 0).toFixed(2));
      const netRevenueMTD       = parseFloat(mtd.reduce((s, d) => s + d.netAmount, 0).toFixed(2));
      const totalDealsClosedMTD = mtd.length;

      // Rebuild rep leaderboard from all deals (all-time, not just MTD).
      // Preserve callsMade/callsAnswered/demosShowed/pitched from the existing leaderboard
      // since those fields come from GHL/Sheets, not the deal log.
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

      const dash = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;
      const prevLeaderboard = dash.reps.leaderboard ?? [];
      const leaderboard = Array.from(repMap.entries())
        .map(([name, s]) => {
          const prev = prevLeaderboard.find(r => r.name === name);
          return {
            name,
            cashCollected: s.cashCollected,
            dealsClosed:   s.dealsClosed,
            demosSet:      s.demosSet,
            callsMade:     prev?.callsMade     ?? 0,
            callsAnswered: prev?.callsAnswered  ?? 0,
            demosShowed:   prev?.demosShowed   ?? 0,
            pitched:       prev?.pitched       ?? 0,
            answerRate:    prev?.answerRate     ?? 0,
          };
        })
        .sort((a, b) => b.cashCollected - a.cashCollected);

      await kv.set("sns-dashboard-v1", {
        ...dash,
        dashboard: { ...dash.dashboard, cashCollectedMTD, netRevenueMTD, totalDealsClosedMTD },
        reps: { ...dash.reps, leaderboard },
      });
    } catch (e) {
      console.error("Dashboard patch error:", e);
    }
  });

  return Response.json({ deal: partial }, { status: 201 });
}
