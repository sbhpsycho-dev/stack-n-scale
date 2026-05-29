import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type BizClient } from "@/lib/biz-client-types";

export const runtime = "nodejs";

const KV_KEY = "sns:biz-clients";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "admin";
}

async function canRead(id: string) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "admin") return true;
  // Biz clients can read their own record only
  return session?.user?.role === "biz_client" && session.user.clientId === id;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canRead(id))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  const client = clients.find((c) => c.id === id);
  if (!client) return Response.json({ error: "Not found" }, { status: 404 });
  // Strip sensitive fields before returning to biz_client
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "biz_client") {
    const { portalPasswordHash: _hash, ...safe } = client;
    return Response.json(safe);
  }
  return Response.json(client);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as Partial<BizClient>;
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "Not found" }, { status: 404 });

  const updated = { ...clients[idx], ...body, id, createdAt: clients[idx].createdAt, teamMembers: clients[idx].teamMembers };
  const next = clients.map((c, i) => (i === idx ? updated : c));
  await kv.set(KV_KEY, next);
  return Response.json({ ok: true, client: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  await kv.set(KV_KEY, clients.filter((c) => c.id !== id));
  return Response.json({ ok: true });
}
