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
  const p = data.pipeline;

  return Response.json({
    callsMade:      p.callsMade,
    callsAnswered:  p.callsAnswered,
    demosSet:       p.demosSet,
    demosShowed:    p.demosShowed,
    pitched:        p.pitched,
    closed:         p.closed,
    answerRate:     p.answerRate,
    showRate:       p.showRate,
    closeRate:      p.closeRate,
    demoToClose:    p.demoToClose,
    stageBreakdown: p.stageBreakdown ?? [],
  });
}
