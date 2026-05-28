import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Session } from "next-auth";
import type { SNSExpense, BreakevenResult } from "@/lib/expense-types";
import {
  AVG_PROCESSOR_FEE_RATE,
  AVG_COMMISSION_RATE_ON_GROSS,
} from "@/lib/expense-seeds";

function isStaffOrAdmin(session: Session | null) {
  return session?.user?.role === "admin" || session?.user?.role === "staff";
}

/**
 * How much of each deal's gross actually covers overhead costs.
 *
 * A $5K or $10K deal goes through:
 *   1. Processor fee (~2.9%)  → reduces to net
 *   2. Commissions (~25% gross) to Caelum/setters/closers/media buyer
 *
 * What's LEFT is the company's operating margin that can cover overhead.
 *
 * Margin = gross × (1 - processorFeeRate) - gross × commissionRate
 *        = gross × (1 - processorFeeRate - commissionRate)
 */
function netMarginPerDeal(grossAmount: number): number {
  return grossAmount * (1 - AVG_PROCESSOR_FEE_RATE - AVG_COMMISSION_RATE_ON_GROSS);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isStaffOrAdmin(session)) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month")
    ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // Fetch all expenses relevant to this month
  const ids = (await kv.get<string[]>("sns:expenses:index")) ?? [];
  const all = (
    await Promise.all(ids.map(id => kv.get<SNSExpense>(`sns:expenses:${id}`)))
  ).filter((e): e is SNSExpense => e !== null);

  const relevant = all.filter(e => {
    if (e.recurrence === "fixed") return true;
    return e.date.startsWith(month);
  });

  const totalFixed    = relevant.filter(e => e.recurrence === "fixed").reduce((s, e) => s + e.amount, 0);
  const totalVariable = relevant.filter(e => e.recurrence === "variable").reduce((s, e) => s + e.amount, 0);
  const grandTotal    = totalFixed + totalVariable;

  // Margin per deal after fees and commissions
  const marginPer5K  = netMarginPerDeal(5000);   // ~$3,355
  const marginPer10K = netMarginPerDeal(10000);   // ~$6,710

  // Deals needed = ceil(totalCosts / marginPerDeal)
  const dealsAt5K  = grandTotal > 0 ? Math.ceil(grandTotal / marginPer5K)  : 0;
  const dealsAt10K = grandTotal > 0 ? Math.ceil(grandTotal / marginPer10K) : 0;

  // Revenue benchmark = total costs ÷ (1 - feeRate - commissionRate)
  const netRate = 1 - AVG_PROCESSOR_FEE_RATE - AVG_COMMISSION_RATE_ON_GROSS;
  const revenueBenchmark = netRate > 0 ? Math.ceil(grandTotal / netRate) : 0;

  const result: BreakevenResult = {
    month,
    totalFixed:        parseFloat(totalFixed.toFixed(2)),
    totalVariable:     parseFloat(totalVariable.toFixed(2)),
    grandTotal:        parseFloat(grandTotal.toFixed(2)),
    dealsAt5K,
    dealsAt10K,
    revenueBenchmark,
  };

  return Response.json(result);
}
