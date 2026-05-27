/**
 * /api/admin/meta-spend
 *
 * Manual ad spend entry endpoint (and future Meta Marketing API sync).
 * Requires admin authentication (same session-based check used by other /api/admin routes).
 *
 * ─── POST ───────────────────────────────────────────────────────────────────
 * Body:
 *   {
 *     date:      "2026-05-25",          // YYYY-MM-DD (defaults to yesterday ET if omitted)
 *     total:     250.00,                // total spend in USD
 *     campaigns: {                      // optional per-campaign breakdown
 *       "SNS Campaign 1": 150.00,
 *       "Retarget – Closers": 100.00
 *     }
 *   }
 * Response: 200 { ok: true, date, record }
 *
 * ─── GET ────────────────────────────────────────────────────────────────────
 * Query:  ?date=2026-05-25   (defaults to yesterday)
 * Response: 200 { date, record }  — record is null if no spend on file
 *
 * ─── DELETE ─────────────────────────────────────────────────────────────────
 * Query:  ?date=2026-05-25
 * Clears the spend record for that date.
 * Response: 200 { ok: true, date }
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SpendRecord } from "@/lib/lead-pipeline";
import { getMetaSpend, setMetaSpend } from "@/lib/lead-pipeline";
import { kv } from "@vercel/kv";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requireAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "admin";
}

// ── Yesterday in ET (approx UTC-5) ───────────────────────────────────────────

function yesterdayET(): string {
  const et = new Date(Date.now() - 5 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000);
  return et.toISOString().slice(0, 10);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!(await requireAdmin())) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? yesterdayET();

  // Basic date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Invalid date format — use YYYY-MM-DD" }, { status: 400 });
  }

  const record = await getMetaSpend(date);
  return Response.json({ date, record });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!(await requireAdmin())) return new Response("Unauthorized", { status: 401 });

  let body: { date?: string; total?: number; campaigns?: Record<string, number> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = body.date ?? yesterdayET();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Invalid date format — use YYYY-MM-DD" }, { status: 400 });
  }

  const total = Number(body.total ?? 0);
  if (isNaN(total) || total < 0) {
    return Response.json({ error: "total must be a non-negative number" }, { status: 400 });
  }

  const campaigns: Record<string, number> = {};
  if (body.campaigns && typeof body.campaigns === "object") {
    for (const [k, v] of Object.entries(body.campaigns)) {
      const amount = Number(v);
      if (!isNaN(amount) && amount >= 0) campaigns[k] = amount;
    }
  }

  const record: SpendRecord = { total, campaigns };
  await setMetaSpend(date, record);

  console.log(`[admin/meta-spend] saved spend for ${date}: $${total}`);
  return Response.json({ ok: true, date, record });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? yesterdayET();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Invalid date format — use YYYY-MM-DD" }, { status: 400 });
  }

  await kv.del(`sns:meta:spend:${date}`);
  console.log(`[admin/meta-spend] deleted spend for ${date}`);
  return Response.json({ ok: true, date });
}
