import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type BizClient, type TeamMember } from "@/lib/biz-client-types";

export const runtime = "nodejs";

const KV_KEY = "sns:biz-clients";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "admin";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  if (!(await requireAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, memberId } = await params;
  const body = await req.json() as Partial<TeamMember>;
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  const clientIdx = clients.findIndex((c) => c.id === id);
  if (clientIdx === -1) return Response.json({ error: "Client not found" }, { status: 404 });

  const members = clients[clientIdx].teamMembers ?? [];
  const memberIdx = members.findIndex((m) => m.id === memberId);
  if (memberIdx === -1) return Response.json({ error: "Member not found" }, { status: 404 });

  const updated = { ...members[memberIdx], ...body, id: memberId };
  const newMembers = members.map((m, i) => (i === memberIdx ? updated : m));
  const newClients = clients.map((c, i) =>
    i === clientIdx ? { ...c, teamMembers: newMembers } : c
  );
  await kv.set(KV_KEY, newClients);
  return Response.json({ ok: true, member: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  if (!(await requireAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, memberId } = await params;
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  const clientIdx = clients.findIndex((c) => c.id === id);
  if (clientIdx === -1) return Response.json({ error: "Client not found" }, { status: 404 });

  const newMembers = (clients[clientIdx].teamMembers ?? []).filter((m) => m.id !== memberId);
  const newClients = clients.map((c, i) =>
    i === clientIdx ? { ...c, teamMembers: newMembers } : c
  );
  await kv.set(KV_KEY, newClients);
  return Response.json({ ok: true });
}
