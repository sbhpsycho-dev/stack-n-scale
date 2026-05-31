import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { ScorecardCache, KPISummary } from "@/lib/ads-scorecard";

const BLANK_SUMMARY: KPISummary = {
  spendMTD: 0, totalLeads: 0, qualifiedLeads: 0,
  qualLeadRate: 0, cpql: 0, roas: 0, bookedCalls: 0, redSpend: 0,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const cached = await kv.get<ScorecardCache>("sns:ads:scorecard:cache");
  if (!cached) {
    return Response.json({ ads: [], summary: BLANK_SUMMARY, computedAt: null });
  }

  return Response.json(cached);
}
