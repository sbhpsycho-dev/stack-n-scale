import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type KpiEntry } from "@/lib/biz-client-types";

export const runtime = "nodejs";

async function canAccess(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "admin") return true;
  return session?.user?.role === "biz_client" && session.user.clientId === id;
}

function kvKey(clientId: string, memberId: string, date: string) {
  return `sns:biz-kpi:${clientId}:${memberId}:${date}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canAccess(id))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("memberId");
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  if (memberId) {
    const keys = dates.map((date) => kvKey(id, memberId, date));
    const entries = await Promise.all(keys.map((k) => kv.get<KpiEntry>(k)));
    return Response.json(entries.filter(Boolean));
  }

  // All members for this client — caller passes memberIds as query param
  const memberIds = (searchParams.get("memberIds") ?? "").split(",").filter(Boolean);
  const result: Record<string, KpiEntry[]> = {};
  for (const mid of memberIds) {
    const keys = dates.map((date) => kvKey(id, mid, date));
    const entries = await Promise.all(keys.map((k) => kv.get<KpiEntry>(k)));
    result[mid] = entries.filter(Boolean) as KpiEntry[];
  }
  return Response.json(result);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as { memberId: string; date: string; values: Record<string, number> };
  if (!body.memberId || !body.date || !body.values) {
    return Response.json({ error: "memberId, date, and values are required" }, { status: 400 });
  }

  const entry: KpiEntry = {
    date: body.date,
    values: body.values,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(kvKey(id, body.memberId, body.date), entry);
  return Response.json({ ok: true, entry });
}
