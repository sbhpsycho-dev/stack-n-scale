import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SEED } from "@/lib/sales-data";

const ADMIN_KEY = "sns-dashboard-v1";
const clientKey = (id: string) => `sns-client-${id}`;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const key = session.user.role === "admin"
    ? ADMIN_KEY
    : clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const data = (await kv.get(key)) ?? SEED;
    return Response.json(data);
  } catch {
    return Response.json(SEED);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const key = session.user.role === "admin"
    ? ADMIN_KEY
    : clientKey(session.user.clientId!);

  try {
    const { kv } = await import("@vercel/kv");
    const body = await req.json();
    await kv.set(key, body);
  } catch { /* KV not connected — ignore */ }
  return Response.json({ ok: true });
}
