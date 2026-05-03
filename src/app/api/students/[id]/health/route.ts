import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { NextRequest } from "next/server";
import type { CheckInRecord } from "@/lib/health-score";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/students/[id]/health">) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const records = (await kv.get<CheckInRecord[]>(`sns:checkins:${id}`)) ?? [];

  if (!records.length) return Response.json({ history: [], currentScore: null });

  const currentScore = records[records.length - 1].healthScore;
  return Response.json({ history: records, currentScore });
}
