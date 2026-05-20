import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import Stripe from "stripe";
import type { Deal } from "@/lib/deal-types";
import { calculatePayouts } from "@/lib/payout-calc";
import { syncDealToSheets } from "@/lib/sheets-sync";
import { BLANK, type SalesData } from "@/lib/sales-data";

export const runtime     = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = await getServerSession(authOptions);
  if (session?.user.role !== "admin") return new Response("Unauthorized", { status: 401 });

  // ── 1. Fetch ALL paid Stripe charges (auto-paginate) ──────────────────────────
  const allCharges: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const page = await stripe.charges.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    allCharges.push(...page.data.filter(c => c.paid && !c.refunded && c.amount > 0));
    hasMore = page.has_more;
    if (page.data.length) startingAfter = page.data[page.data.length - 1].id;
  }

  // ── 2. Create deal records for new charges ────────────────────────────────────
  let created = 0, skipped = 0;

  for (const charge of allCharges) {
    const dealId   = `stripe-${charge.payment_intent ?? charge.id}`;
    const existing = await kv.get(`sns:deals:${dealId}`);
    if (existing) { skipped++; continue; }

    const grossAmount  = charge.amount / 100;
    const processorFee = parseFloat((grossAmount * 0.029 + 0.30).toFixed(2));
    const clientName   = charge.billing_details?.name ?? charge.metadata?.name ?? "Unknown";

    const deal: Deal = {
      id:           dealId,
      date:         new Date(charge.created * 1000).toISOString().split("T")[0],
      clientName,
      offer:        (charge.metadata?.offer === "10K" ? "10K" : "5K") as Deal["offer"],
      grossAmount,
      processor:    "stripe",
      processorFee,
      netAmount:    parseFloat((grossAmount - processorFee).toFixed(2)),
      leadSource:   (charge.metadata?.leadSource === "organic" ? "organic" : "ad") as Deal["leadSource"],
      dmSetter:     charge.metadata?.dmSetter   ?? null,
      setter:       charge.metadata?.setter     ?? null,
      closer:       charge.metadata?.closer     ?? null,
      payouts:      {} as Deal["payouts"],
      payoutStatus: "pending",
      notes:        charge.metadata?.notes      ?? "",
    };
    deal.payouts = calculatePayouts(deal);

    await kv.set(`sns:deals:${dealId}`, deal);
    const idx = (await kv.get<string[]>("sns:deals:index")) ?? [];
    await kv.set("sns:deals:index", [dealId, ...idx]);
    await syncDealToSheets(deal);
    created++;
  }

  // ── 3. Rebuild dashboard KV from ALL deals ────────────────────────────────────
  const now      = new Date();
  const thisY    = String(now.getFullYear());
  const monthStr = `${thisY}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const allIds   = (await kv.get<string[]>("sns:deals:index")) ?? [];
  const allDeals = (
    await Promise.all(allIds.map(id => kv.get<Deal>(`sns:deals:${id}`)))
  ).filter((d): d is Deal => d !== null);

  const mtd = allDeals.filter(d => d.date >= monthStr);
  const ytd = allDeals.filter(d => d.date.startsWith(thisY));

  const cashCollectedMTD    = parseFloat(mtd.reduce((s, d) => s + d.grossAmount, 0).toFixed(2));
  const netRevenueMTD       = parseFloat(mtd.reduce((s, d) => s + d.netAmount,   0).toFixed(2));
  const cashCollectedYTD    = parseFloat(ytd.reduce((s, d) => s + d.grossAmount, 0).toFixed(2));
  const totalDealsClosedMTD = mtd.length;

  const dash = (await kv.get<SalesData>("sns-dashboard-v1")) ?? { ...BLANK };
  if (!dash.dashboard) dash.dashboard = { ...BLANK.dashboard };
  dash.dashboard.cashCollectedMTD    = cashCollectedMTD;
  dash.dashboard.netRevenueMTD       = netRevenueMTD;
  dash.dashboard.cashCollectedYTD    = cashCollectedYTD;
  dash.dashboard.totalDealsClosedMTD = totalDealsClosedMTD;
  await kv.set("sns-dashboard-v1", dash, { ex: 21600 });

  return Response.json({
    ok:      true,
    created, skipped,
    total:   allCharges.length,
    cashMTD: cashCollectedMTD,
    cashYTD: cashCollectedYTD,
    deals:   totalDealsClosedMTD,
  });
}
