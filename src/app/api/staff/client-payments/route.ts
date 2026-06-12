import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type Deal } from "@/lib/deal-types";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const allowed = ["admin", "staff", "sales_exec", "executive"];
  if (!session || !allowed.includes(session.user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.toLowerCase() ?? "";
  const name  = searchParams.get("name")?.toLowerCase()  ?? "";

  if (!email && !name) return Response.json({ totalPaid: 0, paymentCount: 0, payments: [] });

  // sns:deals:index is written by webhooks via lpush (Redis list) and by admin
  // tools via kv.set(array). Try lrange first; fall back to get.
  let index: string[] = [];
  try {
    const fromList = (await kv.lrange("sns:deals:index", 0, -1)) as string[];
    index = fromList.length > 0 ? fromList : ((await kv.get<string[]>("sns:deals:index")) ?? []);
  } catch {
    index = (await kv.get<string[]>("sns:deals:index")) ?? [];
  }
  if (!index.length) return Response.json({ totalPaid: 0, paymentCount: 0, payments: [] });

  const all = await Promise.all(index.map(id => kv.get<Deal>(`sns:deals:${id}`)));

  const matched = (all.filter(Boolean) as Deal[]).filter(d => {
    const dealEmail = d.clientEmail?.toLowerCase();
    const dealName  = d.clientName?.toLowerCase();
    if (email && dealEmail && dealEmail === email) return true;
    if (name  && dealName  && dealName  === name)  return true;
    if (name  && dealName  && (dealName.includes(name) || name.includes(dealName))) return true;
    return false;
  });

  const payments = matched
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(d => ({ date: d.date, amount: d.grossAmount, processor: d.processor, offer: d.offer }));

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  return Response.json({ totalPaid, paymentCount: payments.length, payments });
}
