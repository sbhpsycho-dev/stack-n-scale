import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getIntegrations, saveIntegrations } from "@/lib/integrations";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return Response.json({ ok: false, error: "clientId required" }, { status: 400 });

  const data = await getIntegrations(clientId);
  return Response.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return new Response("Unauthorized", { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return Response.json({ ok: false, error: "clientId required" }, { status: 400 });

  const body = await req.json();
  await saveIntegrations(clientId, body);
  return Response.json({ ok: true });
}
