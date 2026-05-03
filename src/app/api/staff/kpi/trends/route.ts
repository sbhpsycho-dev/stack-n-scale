import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Stripe from "stripe";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return Response.json({ months: [] });

  const stripe = new Stripe(stripeKey);
  const now = new Date();
  const months: { month: string; gross: number; net: number; refunds: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs   = Math.floor(end.getTime() / 1000);
    const label   = start.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    const [charges, refunds] = await Promise.all([
      stripe.balanceTransactions
        .list({ created: { gte: startTs, lte: endTs }, type: "charge", limit: 100 })
        .autoPagingToArray({ limit: 2000 }),
      stripe.refunds
        .list({ created: { gte: startTs, lte: endTs }, limit: 100 })
        .autoPagingToArray({ limit: 2000 }),
    ]);

    const gross   = parseFloat((charges.reduce((s, t) => s + t.amount / 100, 0)).toFixed(2));
    const refAmt  = parseFloat((refunds.reduce((s, r) => s + r.amount / 100, 0)).toFixed(2));
    const net     = parseFloat((gross - refAmt).toFixed(2));

    months.push({ month: label, gross, net, refunds: refAmt });
  }

  return Response.json({ months });
}
