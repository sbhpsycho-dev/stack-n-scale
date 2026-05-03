import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type StaffMeta, STAFF_KV_KEY } from "@/lib/staff-registry";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "admin" && session.user.role !== "staff")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const staff = (await kv.get<StaffMeta[]>(STAFF_KV_KEY)) ?? [];
  return Response.json(staff.map(s => ({ id: s.id, name: s.name })));
}
