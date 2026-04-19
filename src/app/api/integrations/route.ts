import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getIntegrations, saveIntegrations } from "@/lib/integrations";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "admin") return new Response("Unauthorized", { status: 401 });

  const data = await getIntegrations(session.user.clientId!);
  return Response.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "admin") return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  await saveIntegrations(session.user.clientId!, body);
  return Response.json({ ok: true });
}
