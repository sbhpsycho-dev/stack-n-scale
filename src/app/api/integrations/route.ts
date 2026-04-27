import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getIntegrationsMasked, saveIntegrations } from "@/lib/integrations";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const clientId = session.user.role === "admin" ? "admin" : session.user.clientId!;
  const data = await getIntegrationsMasked(clientId);
  return Response.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const clientId = session.user.role === "admin" ? "admin" : session.user.clientId!;
  const body = await req.json();
  await saveIntegrations(clientId, body);
  return Response.json({ ok: true });
}
