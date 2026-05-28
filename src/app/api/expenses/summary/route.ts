import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { Session } from "next-auth";
import type { SNSExpense, ExpenseSummary, ExpenseCategory } from "@/lib/expense-types";

function isStaffOrAdmin(session: Session | null) {
  return session?.user?.role === "admin" || session?.user?.role === "staff";
}

const CATEGORIES: ExpenseCategory[] = [
  "advertising", "software", "payment_processing", "team", "legal", "other",
];

function emptyByCategory(): Record<ExpenseCategory, number> {
  return Object.fromEntries(CATEGORIES.map(c => [c, 0])) as Record<ExpenseCategory, number>;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isStaffOrAdmin(session)) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") // "YYYY-MM" — defaults to current month
    ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  // Try cached aggregate first
  const cacheKey = `sns:expenses:monthly:${month}`;
  const cached = await kv.get<ExpenseSummary>(cacheKey);
  if (cached) return Response.json(cached);

  // Build fresh
  const ids = (await kv.get<string[]>("sns:expenses:index")) ?? [];
  const all = (
    await Promise.all(ids.map(id => kv.get<SNSExpense>(`sns:expenses:${id}`)))
  ).filter((e): e is SNSExpense => e !== null);

  // Fixed costs apply every month; variable costs must match the requested month
  const relevant = all.filter(e => {
    if (e.recurrence === "fixed") return true;
    return e.date.startsWith(month);
  });

  const byCategory = emptyByCategory();
  let totalFixed = 0;
  let totalVariable = 0;

  for (const e of relevant) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    if (e.recurrence === "fixed") {
      totalFixed += e.amount;
    } else {
      totalVariable += e.amount;
    }
  }

  const summary: ExpenseSummary = {
    month,
    totalFixed:    parseFloat(totalFixed.toFixed(2)),
    totalVariable: parseFloat(totalVariable.toFixed(2)),
    grandTotal:    parseFloat((totalFixed + totalVariable).toFixed(2)),
    byCategory,
    expenses:      relevant.sort((a, b) => a.recurrence === "fixed" ? -1 : 1),
  };

  // Cache for 1 hour (3600 seconds)
  await kv.set(cacheKey, summary, { ex: 3600 });

  return Response.json(summary);
}
