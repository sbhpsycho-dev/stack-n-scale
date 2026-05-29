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

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as Partial<TeamMember>;
  if (!body.name?.trim() || !body.role?.trim()) {
    return Response.json({ error: "name and role are required" }, { status: 400 });
  }

  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "Client not found" }, { status: 404 });

  const memberId = body.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const member: TeamMember = {
    id: memberId,
    name: body.name.trim(),
    role: body.role.trim(),
    kpis: body.kpis ?? [],
  };

  const existing = clients[idx].teamMembers ?? [];
  if (existing.some((m) => m.id === memberId)) {
    return Response.json({ error: "Member with that name already exists on this client" }, { status: 409 });
  }

  const updated = { ...clients[idx], teamMembers: [...existing, member] };
  await kv.set(KV_KEY, clients.map((c, i) => (i === idx ? updated : c)));
  return Response.json({ ok: true, member });
}
