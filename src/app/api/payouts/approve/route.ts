import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { WeeklyPayout } from "@/lib/deal-types";
import { getWeekId } from "@/lib/payout-calc";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { weekId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const weekId = body.weekId ?? getWeekId();
  const weekKey = `sns:payouts:weekly:${weekId}`;
  const week = await kv.get<WeeklyPayout>(weekKey);
  if (!week) return Response.json({ error: "Week not found" }, { status: 404 });

  const updated: WeeklyPayout = { ...week, status: "approved", approvedAt: new Date().toISOString() };
  await kv.set(weekKey, updated);

  return Response.json({ ok: true, weekId, status: "approved" });
}
