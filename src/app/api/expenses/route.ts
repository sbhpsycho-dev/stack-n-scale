import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import type { Session } from "next-auth";
import type { SNSExpense, ExpenseCategory, ExpenseRecurrence } from "@/lib/expense-types";
import { EXPENSE_SEEDS } from "@/lib/expense-seeds";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function isStaffOrAdmin(session: Session | null) {
  return session?.user?.role === "admin" || session?.user?.role === "staff";
}

function isAdmin(session: Session | null) {
  return session?.user?.role === "admin";
}

// ─── Seeding ──────────────────────────────────────────────────────────────────

async function seedFixedCostsIfNeeded(): Promise<void> {
  const alreadySeeded = await kv.get<boolean>("sns:expenses:fixed-seeds");
  if (alreadySeeded) return;

  const now = new Date().toISOString();
  const monthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const newExpenses: SNSExpense[] = EXPENSE_SEEDS.map(seed => ({
    id:         randomUUID(),
    date:       monthStr,
    vendor:     seed.vendor,
    description: seed.description,
    amount:     seed.amount,
    category:   seed.category,
    recurrence: seed.recurrence,
    isSeeded:   true,
    createdAt:  now,
  }));

  // Store each expense and build index
  await Promise.all(newExpenses.map(e => kv.set(`sns:expenses:${e.id}`, e)));
  await kv.set("sns:expenses:index", newExpenses.map(e => e.id));
  await kv.set("sns:expenses:fixed-seeds", true);

  console.log(`[expenses] Seeded ${newExpenses.length} fixed costs ($8,204/mo)`);
}

// ─── GET — list expenses with optional month/category filter ─────────────────

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isStaffOrAdmin(session)) return new Response("Unauthorized", { status: 401 });

  // Auto-seed on first request
  await seedFixedCostsIfNeeded();

  const { searchParams } = new URL(req.url);
  const month    = searchParams.get("month");    // "YYYY-MM"
  const category = searchParams.get("category"); // ExpenseCategory

  const ids = (await kv.get<string[]>("sns:expenses:index")) ?? [];
  if (!ids.length) return Response.json({ expenses: [] });

  const all = (
    await Promise.all(ids.map(id => kv.get<SNSExpense>(`sns:expenses:${id}`)))
  ).filter((e): e is SNSExpense => e !== null);

  const filtered = all.filter(e => {
    // Fixed costs match any month query (they are always active)
    if (month) {
      if (e.recurrence === "fixed") {
        // Fixed costs show every month regardless of their stored date
      } else {
        // Variable costs filter by exact date prefix
        if (!e.date.startsWith(month)) return false;
      }
    }
    if (category && e.category !== category) return false;
    return true;
  });

  filtered.sort((a, b) => {
    // Fixed before variable, then alpha by vendor
    if (a.recurrence !== b.recurrence) return a.recurrence === "fixed" ? -1 : 1;
    return a.vendor.localeCompare(b.vendor);
  });

  return Response.json({ expenses: filtered });
}

// ─── POST — add a new expense (admin only) ───────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return new Response("Unauthorized", { status: 401 });

  let body: {
    vendor: string;
    description?: string;
    amount: string | number;
    category: ExpenseCategory;
    recurrence: ExpenseRecurrence;
    date?: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vendor, amount, category, recurrence, date, notes, description } = body;

  if (!vendor?.trim()) return Response.json({ error: "Missing: vendor" }, { status: 400 });
  if (!category)       return Response.json({ error: "Missing: category" }, { status: 400 });
  if (!recurrence)     return Response.json({ error: "Missing: recurrence" }, { status: 400 });

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return Response.json({ error: "Amount must be a positive number" }, { status: 400 });
  }

  const now = new Date();
  const defaultDate = recurrence === "fixed"
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    : now.toISOString().slice(0, 10);

  const expense: SNSExpense = {
    id:          randomUUID(),
    date:        date ?? defaultDate,
    vendor:      vendor.trim(),
    description: description?.trim() ?? "",
    amount:      parsedAmount,
    category,
    recurrence,
    isSeeded:    false,
    notes:       notes?.trim() ?? "",
    createdAt:   now.toISOString(),
  };

  await kv.set(`sns:expenses:${expense.id}`, expense);

  // Prepend to index
  const existing = (await kv.get<string[]>("sns:expenses:index")) ?? [];
  await kv.set("sns:expenses:index", [expense.id, ...existing]);

  // Invalidate monthly aggregate cache for this month
  const monthKey = expense.date.slice(0, 7);
  await kv.del(`sns:expenses:monthly:${monthKey}`);

  return Response.json({ expense }, { status: 201 });
}

// ─── DELETE — remove an expense (admin only, non-seeded only) ────────────────

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing: id" }, { status: 400 });

  const expense = await kv.get<SNSExpense>(`sns:expenses:${id}`);
  if (!expense) return Response.json({ error: "Not found" }, { status: 404 });
  if (expense.isSeeded) {
    return Response.json({ error: "Cannot delete seeded fixed costs. Edit the amount instead." }, { status: 400 });
  }

  await kv.del(`sns:expenses:${id}`);
  const ids = (await kv.get<string[]>("sns:expenses:index")) ?? [];
  await kv.set("sns:expenses:index", ids.filter(i => i !== id));

  // Invalidate monthly cache
  const monthKey = expense.date.slice(0, 7);
  await kv.del(`sns:expenses:monthly:${monthKey}`);

  return Response.json({ success: true });
}
