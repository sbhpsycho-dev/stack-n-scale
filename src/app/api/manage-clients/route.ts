import { kv } from "@vercel/kv";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type BizClient } from "@/lib/biz-client-types";

export const runtime = "nodejs";

const KV_KEY = "sns:biz-clients";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return false;
  return true;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  return Response.json(clients);
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json() as Partial<BizClient>;
  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const id = body.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const now = new Date().toISOString();
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];

  if (clients.some((c) => c.id === id)) {
    return Response.json({ error: "A client with that name already exists" }, { status: 409 });
  }

  const newClient: BizClient = {
    id,
    name: body.name.trim(),
    contactName: body.contactName ?? "",
    contactEmail: body.contactEmail ?? "",
    contactPhone: body.contactPhone,
    status: body.status ?? "lead",
    startDate: body.startDate,
    monthlyValue: body.monthlyValue,
    services: body.services,
    notes: body.notes,
    createdAt: now,
    teamMembers: [],
  };

  await kv.set(KV_KEY, [...clients, newClient]);
  return Response.json({ ok: true, client: newClient });
}
