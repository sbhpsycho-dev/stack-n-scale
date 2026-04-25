import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import { type Resource } from "@/lib/resources";

const RESOURCES_KEY = "sns-resources";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  try {
    const resources = (await kv.get<Resource[]>(RESOURCES_KEY)) ?? [];
    return Response.json(resources);
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json() as Omit<Resource, "id" | "createdAt">;
    const existing = (await kv.get<Resource[]>(RESOURCES_KEY)) ?? [];
    const newResource: Resource = {
      ...body,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await kv.set(RESOURCES_KEY, [...existing, newResource]);
    return Response.json({ ok: true, resource: newResource });
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
    const { id } = await req.json() as { id: string };
    const existing = (await kv.get<Resource[]>(RESOURCES_KEY)) ?? [];
    await kv.set(RESOURCES_KEY, existing.filter((r) => r.id !== id));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
