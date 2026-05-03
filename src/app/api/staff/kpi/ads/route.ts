import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type SalesData, BLANK } from "@/lib/sales-data";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const data = (await kv.get<SalesData>("sns-dashboard-v1")) ?? BLANK;
  const a = data.ads;
  const d = data.dashboard;

  return Response.json({
    totalAdSpend:   a.totalAdSpend,
    totalLeads:     a.totalLeads,
    cpl:            a.cpl,
    roas:           a.roas,
    ctr:            a.ctr,
    cpc:            a.cpc,
    impressions:    a.impressions,
    reach:          a.reach,
    costPerClose:   d.costPerClose,
    leadsByCampaign: a.leadsByCampaign ?? [],
    cplByAdSet:     a.cplByAdSet      ?? [],
    leadsOverTime:  a.leadsOverTime   ?? [],
  });
}
