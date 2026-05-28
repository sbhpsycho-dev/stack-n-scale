import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import Stripe from "stripe";

export const runtime     = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return Response.json({ error: "STRIPE_SECRET_KEY not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  // ── 1. Load all KV deals ──────────────────────────────────────────────────
  const dealIds = (await kv.lrange("sns:deals:index", 0, -1)) as string[];
  const deals = (
    await Promise.all(dealIds.map(id => kv.get<any>(`sns:deals:${id}`)))
  ).filter(Boolean) as any[];

  // Build a set of known external IDs — covers both id-based and externalId-based formats
  const knownExternalIds = new Set(
    deals
      .map(d => d.externalId ?? (d.stripeSessionId ? `stripe-${d.stripeSessionId}` : null))
      .filter(Boolean) as string[]
  );

  // Also index by deal.id directly (backfill-deals sets id = `stripe-${paymentIntentId}`)
  const knownDealIds = new Set(deals.map(d => d.id as string));

  // ── 2. Pull Stripe PaymentIntents from last 90 days ───────────────────────
  const since = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const charges: Stripe.PaymentIntent[] = [];

  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore && charges.length < 500) {
    const page = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: since },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    charges.push(...page.data.filter(c => c.status === "succeeded"));
    hasMore = page.has_more;
    if (page.data.length) startingAfter = page.data[page.data.length - 1].id;
  }

  // ── 3. Find Stripe payments with no matching KV deal ─────────────────────
  const missing = charges.filter(charge => {
    const expectedId = `stripe-${charge.id}`;
    return !knownExternalIds.has(expectedId) && !knownDealIds.has(expectedId);
  });

  // ── 4. Find KV deals with no matching Stripe payment ─────────────────────
  // Manual / Fanbasis entries are intentionally skipped — only check stripe-prefixed IDs
  const stripeChargeIds = new Set(charges.map(c => `stripe-${c.id}`));
  const orphanedDeals = deals.filter(d => {
    const refId: string = d.externalId ?? d.id ?? "";
    if (!refId.startsWith("stripe-")) return false; // skip manual / fanbasis entries
    return !stripeChargeIds.has(refId);
  });

  // ── 5. Build response ─────────────────────────────────────────────────────
  const allClear = missing.length === 0 && orphanedDeals.length === 0;

  return Response.json({
    checkedAt: new Date().toISOString(),
    period: "last 90 days",
    stripeChargesChecked: charges.length,
    kvDealsChecked: deals.length,
    missingDeals: {
      count: missing.length,
      items: missing.map(c => ({
        stripeId: c.id,
        expectedDealId: `stripe-${c.id}`,
        amount: (c.amount ?? 0) / 100,
        currency: c.currency,
        created: new Date(c.created * 1000).toISOString(),
        customerEmail: (c.metadata as any)?.email ?? null,
        description: c.description ?? null,
      })),
    },
    orphanedDeals: {
      count: orphanedDeals.length,
      items: orphanedDeals.map(d => ({
        dealId: d.id,
        externalId: d.externalId ?? null,
        clientName: d.clientName,
        amount: d.grossAmount,
        date: d.date,
      })),
    },
    summary: allClear
      ? "✅ All Stripe payments have matching deal records"
      : `⚠️ Found ${missing.length} Stripe payments with no deal + ${orphanedDeals.length} deals with no Stripe match`,
  });
}
