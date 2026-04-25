import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type DashboardConfig, DEFAULT_CONFIG } from "@/lib/dashboard-config";

const configKey = (clientId: string) => `sns-config-${clientId}`;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const id = session.user.role === "admin" && target
    ? target
    : session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "admin");

  try {
    const config = (await kv.get<DashboardConfig>(configKey(id))) ?? DEFAULT_CONFIG;
    return Response.json(config);
  } catch {
    return Response.json(DEFAULT_CONFIG);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const target = new URL(req.url).searchParams.get("target");
  const id = session.user.role === "admin" && target
    ? target
    : session.user.role === "admin"
    ? "admin"
    : (session.user.clientId ?? "admin");

  try {
    const body = await req.json() as DashboardConfig;
    await kv.set(configKey(id), body);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
