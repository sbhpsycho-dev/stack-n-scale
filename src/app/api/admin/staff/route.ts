import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { hashPassword } from "@/lib/password";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

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

  const { name, password } = await req.json() as { name: string; password: string };
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
  };

  await kv.set(STAFF_KV_KEY, [...existing, member]);
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
  await kv.set(STAFF_KV_KEY, existing.filter((s) => s.id !== id));
  return Response.json({ ok: true });
}

// Admin resets a staff member's password
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, password } = await req.json() as { id: string; password: string };
  if (!id || !password?.trim()) {
    return Response.json({ ok: false, error: "id and password required" }, { status: 400 });
  }

  const existing = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  const member = existing.find((s) => s.id === id);
  if (!member) return Response.json({ ok: false, error: "Staff member not found" }, { status: 404 });

  member.password = hashPassword(password.trim());
  await kv.set(STAFF_KV_KEY, existing);
  return Response.json({ ok: true });
}
