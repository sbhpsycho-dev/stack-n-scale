import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { verifyPassword, hashPassword } from "@/lib/password";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "staff") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json() as {
    currentPassword: string;
    newPassword: string;
  };

  if (!currentPassword || !newPassword) {
    return Response.json({ ok: false, error: "Both passwords are required" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return Response.json({ ok: false, error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const registry = await kv.get<StaffMeta[]>(STAFF_KV_KEY);
  if (!registry) return Response.json({ ok: false, error: "Staff registry not found" }, { status: 404 });

  const member = registry.find((s) => s.id === session.user.clientId);
  if (!member) return Response.json({ ok: false, error: "Staff member not found" }, { status: 404 });

  if (!verifyPassword(currentPassword, member.password)) {
    return Response.json({ ok: false, error: "Current password is incorrect" }, { status: 401 });
  }

  member.password = hashPassword(newPassword);
  await kv.set(STAFF_KV_KEY, registry);
  return Response.json({ ok: true });
}
