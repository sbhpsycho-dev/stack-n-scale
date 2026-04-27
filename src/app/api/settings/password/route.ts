import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { SEED, type SalesData, type ClientMeta } from "@/lib/sales-data";
import { verifyPassword, hashPassword } from "@/lib/password";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role === "admin") return new Response("Unauthorized", { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword) return Response.json({ ok: false, error: "Missing fields" }, { status: 400 });

  try {
    // Update in admin SalesData
    const adminData = (await kv.get<SalesData>("sns-dashboard-v1")) ?? SEED;
    const registry = adminData.clientRegistry ?? [];
    const entry = registry.find((c) => c.id === session.user.clientId);

    if (!entry) return Response.json({ ok: false, error: "Client not found" }, { status: 404 });
    if (!verifyPassword(currentPassword, entry.password)) return Response.json({ ok: false, error: "Current password is incorrect" }, { status: 401 });

    const hashed = hashPassword(newPassword);
    entry.password = hashed;
    await kv.set("sns-dashboard-v1", adminData);

    // Mirror to dedicated registry so auth picks it up
    const dedicated = await kv.get<ClientMeta[]>("sns-registry");
    if (dedicated) {
      const dedEntry = dedicated.find((c) => c.id === session.user.clientId);
      if (dedEntry) {
        dedEntry.password = hashed;
        await kv.set("sns-registry", dedicated);
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Password change error:", err);
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
