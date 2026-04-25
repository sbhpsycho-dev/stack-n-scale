import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BLANK } from "@/lib/sales-data";

const ADMIN_KEY = "sns-dashboard-v1";
const clientKey = (id: string) => `sns-client-${id}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const key =
    session.user.role === "admin" && target ? clientKey(target)
    : session.user.role === "admin"          ? ADMIN_KEY
    :                                          clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const data = (await kv.get(key)) ?? BLANK;
    return Response.json(data);
  } catch {
    return Response.json(BLANK);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const key = session.user.role === "admin" && target
    ? clientKey(target)
    : session.user.role === "admin"
    ? ADMIN_KEY
    : clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const body = await req.json();
    await kv.set(key, body);
    return Response.json({ ok: true, persisted: true });
  } catch {
    return Response.json({ ok: false, persisted: false });
  }
}
