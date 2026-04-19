import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type ClientMeta, SEED_REGISTRY } from "@/lib/sales-data";

const REGISTRY_KEY = "sns-clients";

async function getRegistry(): Promise<ClientMeta[]> {
  try {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<ClientMeta[]>(REGISTRY_KEY)) ?? SEED_REGISTRY;
  } catch {
    return SEED_REGISTRY;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  const registry = await getRegistry();
  return Response.json(registry.map(({ password: _pw, ...rest }) => rest));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const body: ClientMeta = await req.json();
    if (!body.id || !body.name || !body.password) {
      return new Response("Missing required fields", { status: 400 });
    }
    const { kv } = await import("@vercel/kv");
    const existing = await getRegistry();
    const idx = existing.findIndex((c) => c.id === body.id);
    const updated = idx >= 0
      ? existing.map((c, i) => (i === idx ? body : c))
      : [...existing, body];
    await kv.set(REGISTRY_KEY, updated);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const { id }: { id: string } = await req.json();
    const { kv } = await import("@vercel/kv");
    const existing = await getRegistry();
    const updated = existing.filter((c) => c.id !== id);
    await kv.set(REGISTRY_KEY, updated);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
