import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { hashPassword } from "@/lib/password";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";
import { triggerScenario } from "@/lib/make";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const staff = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  // Never expose hashed passwords to the frontend
  return Response.json(staff.map(({ password: _, ...s }) => s));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json() as { name: string; password: string; discordId?: string; role?: string };
  const { name, password } = body;
  const discordId = body.discordId as string | undefined;
  const role = body.role as StaffMeta["role"] | undefined;
  if (!name?.trim() || !password?.trim()) {
    return Response.json({ ok: false, error: "Name and password required" }, { status: 400 });
  }

  const existing = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  const id = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  if (existing.some((s) => s.id === id)) {
    return Response.json({ ok: false, error: "A staff member with that name already exists" }, { status: 409 });
  }

  const member: StaffMeta = {
    id,
    name: name.trim(),
    password: hashPassword(password.trim()),
    createdAt: new Date().toISOString(),
    ...(discordId ? { discordId } : {}),
    ...(role ? { role } : {}),
  };

  await kv.set(STAFF_KV_KEY, [...existing, member]);

  // Audit log — fire and forget, never blocks the response
  logAudit(
    session?.user?.clientId ?? "system",
    (session?.user as any)?.name ?? "system",
    "staff.created",
    member.id,
    "staff",
    { after: { name: member.name, role: member.role ?? "setter", discordId: member.discordId ?? null } }
  ).catch(() => {});

  // Fire-and-forget: trigger Make.com staff onboarding scenario
  triggerScenario("MAKE_STAFF_ONBOARDING_WEBHOOK_URL", {
    staffId: member.id,
    name: member.name,
    email: member.email ?? null,
    discordId: member.discordId ?? null,
    role: member.role ?? "setter",
    loginUrl: `${process.env.NEXTAUTH_URL}/login`,
    timestamp: new Date().toISOString(),
  }).catch(() => {}); // fire and forget

  const { password: _, ...safe } = member;
  return Response.json({ ok: true, staff: safe });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await req.json() as { id: string };
  if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });

  const existing = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  const toDelete = existing.find((s) => s.id === id);
  await kv.set(STAFF_KV_KEY, existing.filter((s) => s.id !== id));

  // Audit log — fire and forget, never blocks the response
  logAudit(
    session?.user?.clientId ?? "system",
    (session?.user as any)?.name ?? "system",
    "staff.deleted",
    id,
    "staff",
    { before: toDelete ? { name: toDelete.name, role: toDelete.role ?? "setter" } : null }
  ).catch(() => {});

  return Response.json({ ok: true });
}

// Admin updates a staff member — password reset and/or sheetId
export async function PATCH(req: Request) {
  // Allow Make.com to update sheetId via Bearer token (CRON_SECRET) — limited to sheetId only
  const authHeader = req.headers.get("authorization");
  const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (isCronAuth) {
    const body = await req.json() as { id?: string; sheetId?: string };
    if (!body.id || !body.sheetId) {
      return Response.json({ error: "id and sheetId required" }, { status: 400 });
    }
    const registry = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
    const updated = registry.map(s => s.id === body.id ? { ...s, sheetId: body.sheetId } : s);
    await kv.set(STAFF_KV_KEY, updated);
    return Response.json({ ok: true });
  }

  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const patchBody = await req.json() as { id: string; password?: string; sheetId?: string; discordId?: string; role?: string };
  const { id, password, sheetId } = patchBody;
  const patchDiscordId = patchBody.discordId as string | undefined;
  const patchRole = patchBody.role as StaffMeta["role"] | undefined;
  if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
  if (!password?.trim() && sheetId === undefined && patchDiscordId === undefined && patchRole === undefined) {
    return Response.json({ ok: false, error: "password, sheetId, discordId, or role required" }, { status: 400 });
  }

  const existing = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  const idx = existing.findIndex((s) => s.id === id);
  if (idx === -1) return Response.json({ ok: false, error: "Staff member not found" }, { status: 404 });

  const changedFields: Record<string, unknown> = {};
  if (password?.trim()) { existing[idx].password = hashPassword(password.trim()); changedFields.password = "[redacted]"; }
  if (sheetId !== undefined) { existing[idx].sheetId = sheetId.trim() || undefined; changedFields.sheetId = sheetId.trim() || null; }
  if (patchDiscordId !== undefined) { existing[idx].discordId = patchDiscordId.trim() || undefined; changedFields.discordId = patchDiscordId.trim() || null; }
  if (patchRole !== undefined) { existing[idx].role = patchRole as StaffMeta["role"]; changedFields.role = patchRole; }

  await kv.set(STAFF_KV_KEY, existing);

  // Audit log — fire and forget, never blocks the response
  logAudit(
    session?.user?.clientId ?? "system",
    (session?.user as any)?.name ?? "system",
    "staff.updated",
    id,
    "staff",
    { after: changedFields as Record<string, string> }
  ).catch(() => {});

  return Response.json({ ok: true });
}
