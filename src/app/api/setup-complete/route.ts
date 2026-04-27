import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";

const setupKey = (clientId: string) => `sns:setup-done:${clientId}`;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.clientId) return Response.json({ done: false });

  try {
    const done = await kv.get(setupKey(session.user.clientId));
    return Response.json({ done: !!done });
  } catch {
    return Response.json({ done: false });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user.clientId) return new Response("Unauthorized", { status: 401 });

  try {
    await kv.set(setupKey(session.user.clientId), 1);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
