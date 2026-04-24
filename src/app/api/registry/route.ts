import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type ClientMeta, type SalesData } from "@/lib/sales-data";

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, name } = await req.json() as { id: string; name: string };
  if (!id || !name) return Response.json({ ok: false, error: "id and name required" }, { status: 400 });

  const updateRegistry = (reg: ClientMeta[]) =>
    reg.map((c) => (c.id === id ? { ...c, name } : c));

  const [dedicated, adminData] = await Promise.all([
    kv.get<ClientMeta[]>("sns-registry"),
    kv.get<SalesData>("sns-dashboard-v1"),
  ]);

  await Promise.all([
    dedicated
      ? kv.set("sns-registry", updateRegistry(dedicated))
      : Promise.resolve(),
    adminData
      ? kv.set("sns-dashboard-v1", {
          ...adminData,
          clientRegistry: updateRegistry(adminData.clientRegistry ?? []),
        })
      : Promise.resolve(),
  ]);

  return Response.json({ ok: true });
}
