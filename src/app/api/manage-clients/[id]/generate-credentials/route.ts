import { kv } from "@vercel/kv";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { type BizClient } from "@/lib/biz-client-types";

export const runtime = "nodejs";

const KV_KEY = "sns:biz-clients";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const clients = (await kv.get<BizClient[]>(KV_KEY)) ?? [];
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return Response.json({ error: "Not found" }, { status: 404 });

  // Generate a slug username from client id + random suffix to ensure uniqueness
  const portalUsername = `${id}-${randomBytes(3).toString("hex")}`;
  const plainPassword = randomBytes(8).toString("base64url").slice(0, 12);
  const portalPasswordHash = hashPassword(plainPassword);

  const updated = { ...clients[idx], portalUsername, portalPasswordHash };
  await kv.set(KV_KEY, clients.map((c, i) => (i === idx ? updated : c)));

  // Return plain password only once — it is NOT stored
  return Response.json({ ok: true, portalUsername, plainPassword });
}
