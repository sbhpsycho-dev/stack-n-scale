import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { kv } from "@vercel/kv";
import type { CoachingClient } from "@/lib/coaching-types";
export type { CoachingClient } from "@/lib/coaching-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  const keys = await kv.keys("sns:coaching:client:*");
  if (!keys.length) return Response.json([]);

  const clients = await Promise.all(
    keys.map((k) => kv.get<CoachingClient>(k))
  );

  const sorted = clients
    .filter(Boolean)
    .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime());

  return Response.json(sorted);
}
