import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

export type DailyEntry = {
  date: string; // YYYY-MM-DD
  callsMade: number;
  callsAnswered: number;
  demosSet: number;
  demosShowed: number;
  pitched: number;
  closed: number;
  cashCollected: number;
};

const replogKey = (clientId: string) => `sns-replog-${clientId}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const id = session.user.role === "admin" && target
    ? target
    : session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const entries = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    return Response.json(entries);
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const entry = await req.json() as DailyEntry;
    const existing = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    // Replace entry for same date, or append
    const updated = existing.some(e => e.date === entry.date)
      ? existing.map(e => e.date === entry.date ? entry : e)
      : [entry, ...existing].sort((a, b) => b.date.localeCompare(a.date));
    await kv.set(replogKey(id), updated);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const id = session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "");

  try {
    const { date } = await req.json() as { date: string };
    const existing = (await kv.get<DailyEntry[]>(replogKey(id))) ?? [];
    await kv.set(replogKey(id), existing.filter(e => e.date !== date));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
