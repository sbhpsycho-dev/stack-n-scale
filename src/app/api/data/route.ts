import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BLANK, type SalesData } from "@/lib/sales-data";
import { STAFF_KV_KEY, type StaffMeta } from "@/lib/staff-registry";
import type { DailyEntry } from "@/app/api/replog/route";

const ADMIN_KEY = "sns-dashboard-v1";
const clientKey = (id: string) => `sns-client-${id}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const isAdminLike = session.user.role === "admin" || session.user.role === "sales_exec";
  if (target && !isAdminLike) return new Response("Forbidden", { status: 403 });
  const key =
    isAdminLike && target ? clientKey(target)
    : isAdminLike          ? ADMIN_KEY
    :                        clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const raw = ((await kv.get(key)) ?? BLANK) as SalesData;

    // Aggregate main KPIs live from staff replog entries — no GHL dependency
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-06"
    const currentYear  = new Date().toISOString().slice(0, 4); // "2026"
    const staffList    = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
    const replogArrays = await Promise.all(
      staffList.map(s =>
        kv.get<DailyEntry[]>(`sns-replog-${s.id}`).then(r => r ?? [])
      )
    );
    const allEntries  = replogArrays.flat();
    const mtdEntries  = allEntries.filter(e => e.date.startsWith(currentMonth));
    const ytdEntries  = allEntries.filter(e => e.date.startsWith(currentYear));

    const liveCash  = mtdEntries.reduce((s, e) => s + (e.cashCollected ?? 0), 0);
    const liveDeals = mtdEntries.reduce((s, e) => s + (e.closed       ?? 0), 0);
    const liveLeads = mtdEntries.reduce((s, e) => s + (e.demosSet     ?? 0), 0);
    const liveYTD   = ytdEntries.reduce((s, e) => s + (e.cashCollected ?? 0), 0);

    return Response.json({
      ...raw,
      _syncedMonth: currentMonth,
      dashboard: {
        ...raw.dashboard,
        cashCollectedMTD:    Math.round(liveCash),
        totalDealsClosedMTD: liveDeals,
        leadsThisMonth:      liveLeads,
        cashCollectedYTD:    Math.round(liveYTD),
      },
    });
  } catch {
    return Response.json(BLANK);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (session.user.role === "sales_exec") return new Response("Forbidden", { status: 403 });

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
