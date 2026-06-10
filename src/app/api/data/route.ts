import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BLANK, type SalesData } from "@/lib/sales-data";

const ADMIN_KEY = "sns-dashboard-v1";
const clientKey = (id: string) => `sns-client-${id}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  if (target && session.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const key =
    session.user.role === "admin" && target ? clientKey(target)
    : session.user.role === "admin"          ? ADMIN_KEY
    :                                          clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const raw = ((await kv.get(key)) ?? BLANK) as SalesData;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const syncedMonth  = raw._syncedMonth;

    if (syncedMonth && syncedMonth !== currentMonth) {
      const stale = raw;
      return Response.json({
        ...BLANK,
        _syncedMonth: syncedMonth,
        dashboard: {
          ...BLANK.dashboard,
          monthlyGoal:            stale.dashboard.monthlyGoal,
          mrr:                    stale.dashboard.mrr,
          cashCollectedLastMonth: stale.dashboard.cashCollectedMTD,
          cashCollectedYTD:       stale.dashboard.cashCollectedYTD,
        },
        clients:        stale.clients,
        clientRegistry: stale.clientRegistry,
      } as SalesData);
    }
    return Response.json(raw);
  } catch {
    return Response.json(BLANK);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  if (target && session.user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const key = session.user.role === "admin" && target
    ? clientKey(target)
    : session.user.role === "admin"
    ? ADMIN_KEY
    : clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const body = await req.json();
    const month = new Date().toISOString().slice(0, 7);
    await kv.set(key, { ...body, _syncedMonth: month });
    return Response.json({ ok: true, persisted: true });
  } catch {
    return Response.json({ ok: false, persisted: false });
  }
}
